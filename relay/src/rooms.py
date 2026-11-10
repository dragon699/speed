import asyncio, json, time
from typing import Literal
from fastapi import WebSocket
from pydantic import ValidationError
from common.protocol.close_codes import CloseCode
from common.protocol.frames import Frame
from relay.settings import settings
from relay.src.recorder import Recorder
from relay.src.schemas.messages import ControlMessage, MessagePing, MessagePhone, MessageRecord, MessageSignal
from relay.src.telemetry.logging import log


Role = Literal['car', 'phone']




class Room:
    def __init__(self, code: str) -> None:
        self.code = code
        self.peers: dict[Role, WebSocket | None] = {'car': None, 'phone': None}
        self.rates: dict[Role, tuple[int, int]] = {'car': (0, 0), 'phone': (0, 0)}
        self.trusted: dict[Role, bool] = {'car': False, 'phone': False}
        self.charging = False
        self.phone_name: str | None = None
        self.recorder: Recorder | None = None


    def is_empty(self) -> bool:
        return not any(self.peers.values())


    def can_record(self) -> bool:
        return any(self.trusted.values())


    def get_status(self) -> dict:
        return {
            'type': 'status',
            'car': self.peers['car'] is not None,
            'phone': self.peers['phone'] is not None,
            'charging': self.charging,
            'phone_name': self.phone_name,
            'recording': self.recorder is not None,
            'can_record': self.can_record()
        }


    def is_within_rate(self, role: Role) -> bool:
        now = int(time.monotonic())
        second, count = self.rates[role]

        if second != now:
            self.rates[role] = (now, 1)
            return True

        if count >= settings.max_messages_per_second:
            return False

        self.rates[role] = (second, count + 1)
        return True


    async def send(self, peer: WebSocket | None, data: bytes | dict) -> None:
        if peer is None:
            return

        try:
            if isinstance(data, bytes):
                await peer.send_bytes(data)
            else:
                await peer.send_text(json.dumps(data))

        except Exception as err:
            log.debug('Send failed', extra={'room': self.code, 'error_type': type(err).__name__})


    async def broadcast_status(self) -> None:
        status = self.get_status()

        for peer in self.peers.values():
            await self.send(peer, status)


    async def forward(self, role: Role, data: bytes) -> None:
        if role != 'phone' or not Frame.is_valid_batch(data) or not self.is_within_rate(role):
            return

        if self.recorder:
            await self.recorder.write(data)

            if self.recorder.full:
                await self.stop_recording()

        forwarded = Frame.filter_forwarded(data)

        if forwarded:
            await self.send(self.peers['car'], forwarded)


    async def start_recording(self) -> None:
        if self.recorder:
            return

        if not await asyncio.to_thread(Recorder.has_space):
            log.warning('Recording refused, storage limit reached', extra={'room': self.code})
            return

        self.recorder = Recorder(self.code)
        log.info('Recording started', extra={'room': self.code, 'file': self.recorder.path.name})
        await self.broadcast_status()


    async def stop_recording(self) -> None:
        if not self.recorder:
            return

        recorder, self.recorder = self.recorder, None
        await recorder.flush()

        log.info('Recording stopped', extra={
            'room': self.code, 'file': recorder.path.name, 'bytes': recorder.size, 'full': recorder.full
        })
        await self.broadcast_status()


    def get_other(self, role: Role) -> WebSocket | None:
        return self.peers['phone' if role == 'car' else 'car']


    async def handle_control(self, role: Role, peer: WebSocket, text: str) -> None:
        if len(text) > settings.max_control_bytes:
            return

        try:
            message = ControlMessage.validate_json(text)

        except ValidationError:
            return

        if isinstance(message, MessagePing):
            await self.send(peer, {'type': 'pong', 't': message.t, 'server': time.time() * 1000})

        elif isinstance(message, MessageSignal):
            await self.send(self.get_other(role), {'type': 'signal', 'data': message.data})

        elif isinstance(message, MessageRecord) and role == 'phone' and self.can_record():
            if message.on:
                await self.start_recording()
            else:
                await self.stop_recording()

        elif isinstance(message, MessagePhone) and role == 'phone':
            if (message.charging, message.name) != (self.charging, self.phone_name):
                self.charging = message.charging
                self.phone_name = message.name
                await self.broadcast_status()



class Rooms:
    def __init__(self) -> None:
        self.rooms: dict[str, Room] = {}


    async def join(self, code: str, role: Role, peer: WebSocket, trusted: bool) -> Room | None:
        room = self.rooms.get(code)

        if room is None:
            if len(self.rooms) >= settings.max_rooms:
                return None

            room = self.rooms[code] = Room(code)

        replaced = room.peers[role]
        room.peers[role] = peer
        room.trusted[role] = trusted

        if not room.can_record():
            await room.stop_recording()

        if replaced is not None:
            try:
                await replaced.close(code=CloseCode.REPLACED)

            except Exception:
                pass

        log.info('Peer joined', extra={'room': code, 'role': role, 'trusted': trusted, 'replaced': replaced is not None})
        await room.broadcast_status()

        return room


    async def leave(self, room: Room, role: Role, peer: WebSocket) -> None:
        if room.peers[role] is not peer:
            return

        room.peers[role] = None

        if role == 'phone':
            room.charging = False
            room.phone_name = None

            if room.recorder:
                await room.recorder.flush()

        log.info('Peer left', extra={'room': room.code, 'role': role})

        if room.is_empty():
            await room.stop_recording()
            self.rooms.pop(room.code, None)
        else:
            await room.broadcast_status()


rooms = Rooms()

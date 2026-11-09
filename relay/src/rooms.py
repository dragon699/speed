import json, time
from typing import Literal
from fastapi import WebSocket
from pydantic import ValidationError
from common.protocol.frames import Frame
from relay.settings import settings
from relay.src.schemas.messages import ControlMessage, MessagePing, MessagePhone
from relay.src.telemetry.logging import log


Role = Literal['car', 'phone']

CLOSE_REPLACED = 4409



class Room:
    def __init__(self, code: str) -> None:
        self.code = code
        self.peers: dict[Role, WebSocket | None] = {'car': None, 'phone': None}
        self.rates: dict[Role, tuple[int, int]] = {'car': (0, 0), 'phone': (0, 0)}
        self.charging = False


    def is_empty(self) -> bool:
        return not any(self.peers.values())


    def get_status(self) -> dict:
        return {
            'type': 'status',
            'car': self.peers['car'] is not None,
            'phone': self.peers['phone'] is not None,
            'charging': self.charging
        }


    def is_within_rate(self, role: Role) -> bool:
        now = int(time.monotonic())
        second, count = self.rates[role]

        if second != now:
            self.rates[role] = (now, 1)
            return True

        if count >= settings.max_frames_per_second:
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
        if role != 'phone' or not Frame.is_valid(data) or not self.is_within_rate(role):
            return

        await self.send(self.peers['car'], data)


    async def handle_control(self, role: Role, peer: WebSocket, text: str) -> None:
        try:
            message = ControlMessage.validate_json(text)

        except ValidationError:
            return

        if isinstance(message, MessagePing):
            await self.send(peer, {'type': 'pong', 't': message.t})

        elif isinstance(message, MessagePhone) and role == 'phone':
            if message.charging != self.charging:
                self.charging = message.charging
                await self.broadcast_status()



class Rooms:
    def __init__(self) -> None:
        self.rooms: dict[str, Room] = {}


    async def join(self, code: str, role: Role, peer: WebSocket) -> Room | None:
        room = self.rooms.get(code)

        if room is None:
            if len(self.rooms) >= settings.max_rooms:
                return None

            room = self.rooms[code] = Room(code)

        replaced = room.peers[role]
        room.peers[role] = peer

        if replaced is not None:
            try:
                await replaced.close(code=CLOSE_REPLACED)

            except Exception:
                pass

        log.info('Peer joined', extra={'room': code, 'role': role, 'replaced': replaced is not None})
        await room.broadcast_status()

        return room


    async def leave(self, room: Room, role: Role, peer: WebSocket) -> None:
        if room.peers[role] is not peer:
            return

        room.peers[role] = None

        if role == 'phone':
            room.charging = False

        log.info('Peer left', extra={'room': room.code, 'role': role})

        if room.is_empty():
            self.rooms.pop(room.code, None)
        else:
            await room.broadcast_status()


rooms = Rooms()

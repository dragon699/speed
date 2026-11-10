import asyncio, hmac
from typing import Annotated
from fastapi import APIRouter, Path, WebSocket
from common.protocol.close_codes import CloseCode
from relay.settings import settings
from relay.src.rooms import Role, rooms
from relay.src.schemas.messages import MessageHello


router = APIRouter()

Code = Annotated[str, Path(pattern=r'^[A-Z0-9]{4,8}$')]


async def authenticate(peer: WebSocket) -> bool:
    try:
        text = await asyncio.wait_for(peer.receive_text(), settings.hello_timeout_seconds)
        hello = MessageHello.model_validate_json(text)

    except Exception:
        return False

    return hmac.compare_digest(
        hello.key.encode(),
        settings.device_key.get_secret_value().encode()
    )


async def serve(peer: WebSocket, code: str, role: Role) -> None:
    await peer.accept()

    if not await authenticate(peer):
        await peer.close(code=CloseCode.UNAUTHORIZED)
        return

    room = await rooms.join(code, role, peer)

    if room is None:
        await peer.close(code=CloseCode.FULL)
        return

    try:
        while True:
            message = await peer.receive()

            if message['type'] == 'websocket.disconnect':
                break

            if message.get('bytes') is not None:
                await room.forward(role, message['bytes'])

            elif message.get('text') is not None:
                await room.handle_control(role, peer, message['text'])

    finally:
        await rooms.leave(room, role, peer)


@router.websocket('/car/{code}')
async def car(peer: WebSocket, code: Code) -> None:
    await serve(peer, code, 'car')


@router.websocket('/phone/{code}')
async def phone(peer: WebSocket, code: Code) -> None:
    await serve(peer, code, 'phone')

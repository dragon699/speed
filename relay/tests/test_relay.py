import json, os, time
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
from common.protocol.frames import Frame, FrameKind
from relay.src.api import app
from relay.tests.conftest import KEY



@pytest.fixture(scope='module')
def client():
    with TestClient(app) as test_client:
        yield test_client


def join(client, role, code, key=KEY):
    ws = client.websocket_connect(f'/ws/{role}/{code}')
    socket = ws.__enter__()
    socket.send_text(json.dumps({'type': 'hello'} if key is None else {'type': 'hello', 'key': key}))
    return ws, socket


def status(socket):
    message = socket.receive_json()
    assert message['type'] == 'status'
    return message


def test_health(client):
    response = client.get('/api/health')
    assert response.status_code == 200
    assert response.json()['healthy'] is True


def test_wrong_key_is_closed_with_4401(client):
    ws, socket = join(client, 'car', 'AUTH01', key='wrong')
    with pytest.raises(WebSocketDisconnect) as closed:
        socket.receive_text()
    assert closed.value.code == 4401
    ws.__exit__(None, None, None)


def test_short_code_needs_the_device_key(client):
    ws, socket = join(client, 'car', 'OPEN01', key=None)
    with pytest.raises(WebSocketDisconnect) as closed:
        socket.receive_text()
    assert closed.value.code == 4401
    ws.__exit__(None, None, None)


def test_long_code_pairs_without_a_key_but_cannot_record(client):
    code = 'K7M2X9PQR4TD'
    car_ws, car = join(client, 'car', code, key=None)
    assert status(car)['can_record'] is False
    phone_ws, phone = join(client, 'phone', code, key=None)
    assert status(car)['phone'] is True
    status(phone)

    phone.send_bytes(Frame.pack(1.0, FrameKind.FUSED_SPEED, 12.5))
    assert [value for _, _, value in Frame.iter_unpack(car.receive_bytes())] == [12.5]

    phone.send_text(json.dumps({'type': 'record', 'on': True}))
    phone.send_text(json.dumps({'type': 'ping', 't': 1}))
    assert phone.receive_json()['type'] == 'pong'
    assert not list(Path(os.environ['RECORDINGS_DIR']).glob(f'{code}-*.bin'))

    phone_ws.__exit__(None, None, None)
    car_ws.__exit__(None, None, None)


def test_a_car_with_the_key_lets_a_paired_phone_record(client):
    code = 'H3NQ7WZK2PLE'
    car_ws, car = join(client, 'car', code)
    status(car)
    phone_ws, phone = join(client, 'phone', code, key=None)
    assert status(phone)['can_record'] is True
    status(car)

    phone.send_text(json.dumps({'type': 'record', 'on': True}))
    assert status(phone)['recording'] is True
    phone.send_text(json.dumps({'type': 'record', 'on': False}))
    assert status(phone)['recording'] is False

    phone_ws.__exit__(None, None, None)
    car_ws.__exit__(None, None, None)


def test_pairing_status_and_phone_details(client):
    car_ws, car = join(client, 'car', 'PAIR01')
    assert status(car) == {
        'type': 'status', 'car': True, 'phone': False, 'charging': False, 'phone_name': None, 'recording': False, 'can_record': True
    }

    phone_ws, phone = join(client, 'phone', 'PAIR01')
    assert status(car)['phone'] is True
    assert status(phone)['car'] is True

    phone.send_text(json.dumps({'type': 'phone', 'charging': True, 'name': 'Galaxy'}))
    update = status(car)
    assert update['charging'] is True and update['phone_name'] == 'Galaxy'
    status(phone)

    phone_ws.__exit__(None, None, None)
    left = status(car)
    assert left['phone'] is False and left['charging'] is False and left['phone_name'] is None
    car_ws.__exit__(None, None, None)


def test_ping_is_answered_with_pong(client):
    ws, socket = join(client, 'car', 'PING01')
    status(socket)
    socket.send_text(json.dumps({'type': 'ping', 't': 42.5}))
    pong = socket.receive_json()
    assert pong['type'] == 'pong' and pong['t'] == 42.5
    assert abs(pong['server'] - time.time() * 1000) < 5000
    ws.__exit__(None, None, None)


def test_only_car_relevant_frames_are_forwarded(client):
    car_ws, car = join(client, 'car', 'FWD001')
    status(car)
    phone_ws, phone = join(client, 'phone', 'FWD001')
    status(car)
    status(phone)

    phone.send_bytes(Frame.pack(1.0, FrameKind.GPS_SPEED, 5.0) + Frame.pack(1.0, FrameKind.ACCEL_X, 0.1))
    received = car.receive_bytes()
    assert [(kind, value) for _, kind, value in Frame.iter_unpack(received)] == [(FrameKind.GPS_SPEED, 5.0)]

    phone_ws.__exit__(None, None, None)
    car_ws.__exit__(None, None, None)


def test_signals_are_passed_to_the_other_peer(client):
    car_ws, car = join(client, 'car', 'SIG001')
    status(car)
    phone_ws, phone = join(client, 'phone', 'SIG001')
    status(car)
    status(phone)

    offer = {'description': {'type': 'offer', 'sdp': 'v=0'}}
    phone.send_text(json.dumps({'type': 'signal', 'data': offer}))
    assert car.receive_json() == {'type': 'signal', 'data': offer}

    car.send_text(json.dumps({'type': 'signal', 'data': {'candidate': None}}))
    assert phone.receive_json() == {'type': 'signal', 'data': {'candidate': None}}

    phone.send_text(json.dumps({'type': 'signal', 'data': {'sdp': 'x' * 20_000}}))
    car.send_text(json.dumps({'type': 'ping', 't': 1}))
    assert car.receive_json()['type'] == 'pong'

    phone_ws.__exit__(None, None, None)
    car_ws.__exit__(None, None, None)


def test_recording_writes_every_valid_frame(client):
    phone_ws, phone = join(client, 'phone', 'REC001')
    status(phone)

    phone.send_text(json.dumps({'type': 'record', 'on': True}))
    assert status(phone)['recording'] is True

    frames = Frame.pack(1.0, FrameKind.GPS_SPEED, 5.0) + Frame.pack(1.0, FrameKind.ACCEL_Z, 9.8)
    phone.send_bytes(frames)
    phone.send_bytes(b'junk')
    phone.send_text(json.dumps({'type': 'record', 'on': False}))
    assert status(phone)['recording'] is False

    recordings = sorted(Path(os.environ['RECORDINGS_DIR']).glob('REC001-*.bin'))
    assert recordings and recordings[-1].read_bytes() == frames
    phone_ws.__exit__(None, None, None)


def test_newer_connection_replaces_older_one(client):
    first_ws, first = join(client, 'phone', 'SWAP01')
    status(first)
    second_ws, second = join(client, 'phone', 'SWAP01')

    with pytest.raises(WebSocketDisconnect) as closed:
        while True:
            first.receive_text()
    assert closed.value.code == 4409

    status(second)
    second_ws.__exit__(None, None, None)
    first_ws.__exit__(None, None, None)

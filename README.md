# speed

Live engine sound for the Tesla browser, driven by the phone's GPS and accelerometer.

```
Phone (/phone) ──wss──▶ relay ──wss──▶ Car (/car)
GPS + IMU → fused speed    forwards frames   prediction → gearbox → AudioWorklet
```

## Layout

```
common/                  shared Python (relay + tools)
  protocol/frames.py     13-byte binary frame format
  telemetry/             logger (same as fetch-api)
relay/                   FastAPI WebSocket relay
  src/rooms.py           pairing rooms, forwarding, status
  src/routes/ws.py       /ws/car/{code}, /ws/phone/{code}
  src/routes/internal.py /api/health, /api/ready
web/                     Vite + Svelte 5 + TS, served by nginx
  src/pages/Car.svelte   car page (Tesla browser)
  src/pages/Phone.svelte phone page (Android Chrome)
  src/lib/relay.svelte.ts  WebSocket client, reconnect, heartbeat
  src/lib/protocol.ts    frame encode/decode (must match common/protocol)
  src/lib/sensors/       GPS (motion + fusion in phase 2)
  src/lib/audio/         AudioWorklet engines
  src/theme.css          colors / fonts / themes
  src/engines.json       engine profiles
tools/                   offline replay, KF tuning, plots (phase 1)
```

## Protocol

Binary frames, little-endian `<dBf` (13 bytes): `t_ms float64 | kind uint8 | value float32`

| kind | value |
|---|---|
| 0 | raw GPS speed (m/s) |
| 1 | raw forward accel (m/s²) |
| 2 | fused speed (m/s) |
| 3 | fused accel (m/s²) |

JSON control messages:

| direction | message |
|---|---|
| client → relay | `{"type":"hello","key":"…"}` (first message, within 5 s) |
| client → relay | `{"type":"ping","t":…}` every 2 s → `{"type":"pong","t":…}` |
| phone → relay | `{"type":"phone","charging":bool,"name":"…"}` |
| relay → both | `{"type":"status","car":bool,"phone":bool,"charging":bool,"phone_name":"…"\|null}` |

Close codes: `4401` bad key, `4409` replaced by a newer connection, `4429` too many rooms.

## Device setup

Open `https://speed.iaminyourpc.xyz/#key=<DEVICE_KEY>` once on the phone and once in the car.
The key is stored in localStorage and stripped from the URL.

## Local development

```bash
DEVICE_KEY=$(openssl rand -hex 32) LOG_FORMAT=logfmt python -m relay.app

cd web && npm install && npm run dev
```

Open `http://localhost:3000/#key=<DEVICE_KEY>`, then `/car` and `/phone`.
Vite proxies `/ws` to the relay on `localhost:8080` (`RELAY_URL` to override).

## Deployment

Pushes build `ghcr.io/dragon699/speed/{relay,web}` on the `gha-runner-speed` runner set and bump
`manifests/apps/speed/{relay,web}.yaml` in `dragon699/home-k8s`. Bump `relay/VERSION` / `web/VERSION` to release.

| component | env |
|---|---|
| relay | `DEVICE_KEY` (required, ≥32 chars), `MAX_ROOMS`, `MAX_FRAMES_PER_SECOND`, `LOG_LEVEL`, `LOG_FORMAT` |
| web | `RELAY_URL` (e.g. `http://speed-relay.speed.svc:8080`) |

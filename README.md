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
  src/recorder.py        raw drive recording to /data
web/                     Vite + Svelte 5 + TS, served by nginx
  src/pages/Car.svelte   car page (Tesla browser)
  src/pages/Phone.svelte phone page (Android Chrome)
  src/lib/relay.svelte.ts  WebSocket client, reconnect, heartbeat
  src/lib/protocol.ts    frame encode/decode (must match common/protocol)
  src/lib/sensors/       GPS, motion (accelerometer + gyroscope)
  src/lib/audio/         AudioWorklet engines
  src/theme.css          colors / fonts / themes
  src/engines.json       engine profiles
tools/                   offline recording tools
  summary.py             duration, sample rates, GPS accuracy
  replay.py              forward-axis estimate + Kalman filter replay plot
```

## Protocol

Binary frames, little-endian `<dBf` (13 bytes): `t_ms float64 | kind uint8 | value float32`.
A binary message carries 1–64 frames back to back. `t_ms` is epoch milliseconds on the phone's clock.

| kind | value |
|---|---|
| 0 | raw GPS speed (m/s) |
| 1 | raw forward accel (m/s²) |
| 2 | fused speed (m/s) |
| 3 | fused accel (m/s²) |
| 4–6 | accel incl. gravity x/y/z (m/s², device frame) |
| 7–9 | linear accel x/y/z (m/s², device frame) |
| 10–12 | rotation rate alpha/beta/gamma (°/s) |
| 13 | GPS accuracy (m) |

The relay forwards kinds 0–3 to the car and records every kind while recording is on.
The phone only sends kinds 4–12 while recording.

JSON control messages:

| direction | message |
|---|---|
| client → relay | `{"type":"hello","key":"…"}` (first message, within 5 s) |
| client → relay | `{"type":"ping","t":…}` every 2 s → `{"type":"pong","t":…}` |
| phone → relay | `{"type":"phone","charging":bool,"name":"…"}` |
| phone → relay | `{"type":"record","on":bool}` |
| relay → both | `{"type":"status","car":bool,"phone":bool,"charging":bool,"phone_name":"…"\|null,"recording":bool}` |

Close codes: `4401` bad key, `4409` replaced by a newer connection, `4429` too many rooms.

## Device setup

Open `https://speed.iaminyourpc.xyz/#key=<DEVICE_KEY>` once on the phone and once in the car.
The key is stored in localStorage and stripped from the URL.

## Recordings

Turn on "Record drive" on the phone page. The relay writes `/data/<code>-<YYYYmmdd-HHMMSS>.bin`
(raw frames, ~25 MB/hour), capped at 200 MB per file and 1.8 GB in total.

```bash
mkdir -p recordings
kubectl -n speed cp "$(kubectl -n speed get pod -l app=speed-relay -o jsonpath='{.items[0].metadata.name}')":/data recordings

pip install -r tools/requirements.txt
python -m tools.summary recordings/*.bin
python -m tools.replay recordings/<file>.bin --q 0.1 0.5 2
```

`replay` finds the phone's forward axis from the recording (gravity gives "down", GPS speed changes give
"forward"), runs the Kalman filter once per `q` and saves `<file>.replay.png`. A `scale` near 1 means the
accelerometer and GPS agree; far from 1 means the phone moved during the drive.

## Local development

```bash
DEVICE_KEY=$(openssl rand -hex 32) LOG_FORMAT=logfmt RECORDINGS_DIR=recordings python -m relay.app

cd web && npm install && npm run dev
```

Open `http://localhost:3000/#key=<DEVICE_KEY>`, then `/car` and `/phone`.
Vite proxies `/ws` to the relay on `localhost:8080` (`RELAY_URL` to override).

## Deployment

Pushes build `ghcr.io/dragon699/speed/{relay,web}` on the `gha-runner-speed` runner set and bump
`manifests/apps/speed/{relay,web}.yaml` in `dragon699/home-k8s`. Bump `relay/VERSION` / `web/VERSION` to release.

| component | env |
|---|---|
| relay | `DEVICE_KEY` (required, ≥32 chars), `MAX_ROOMS`, `MAX_MESSAGES_PER_SECOND`, `RECORDINGS_DIR`, `MAX_RECORDING_BYTES`, `MAX_RECORDINGS_BYTES`, `LOG_LEVEL`, `LOG_FORMAT` |
| web | `RELAY_URL` (e.g. `http://speed-relay.speed.svc:8080`) |

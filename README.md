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
  src/lib/audio/         AudioWorklet engine: control bridge + engine DSP (core/, MIT, see NOTICES)
  src/theme.css          colors / fonts / themes
  src/lib/engineStyles.ts  silhouette and colour per engine
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

## Pairing

The car page gets a random 12-character room code (60 bits, kept in localStorage) and shows it as a
QR code while no phone is connected. Scanning it opens `/phone#code=…`, which connects right away;
the code can also be typed in. Without the device key a code must be at least 12 characters, so rooms
can't be guessed; the relay holds up to `MAX_ROOMS` car/phone pairs.

The device key is only needed for recording drives: open `https://speed.iaminyourpc.xyz/#key=<DEVICE_KEY>`
once on the phone (stored in localStorage, stripped from the URL) and "Record drive" appears.

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
./local/run.sh
```

Starts the relay on `:8080` (venv in `.venv`, recordings in `recordings/`) and the Vite dev server on `:3000`
with hot reload. Open `http://localhost:3000/#key=local-development-device-key-0000000000` once, then
`/car` and `/phone` in two tabs. Ctrl+C stops both.

## Speed fusion

The phone fuses GPS (≈1 Hz, delayed) with its accelerometer (60 Hz) in `web/src/lib/fusion/` and sends
`FUSED_SPEED` / `FUSED_ACCEL` frames at 20 Hz. The car prefers them over plain GPS speed and feeds the measured
acceleration into the drivetrain as throttle.

- **Mount** – gravity gives "down"; the forward axis is learned by correlating horizontal acceleration with
  GPS speed changes, so the phone can sit at any angle. It needs a few normal accelerations or brakings,
  is saved for the next drive, and is relearned when the phone is moved.
- **Filter** – a Kalman filter on speed and accelerometer bias, integrating forward acceleration and correcting
  with GPS at the fix time. The GPS lag is estimated online.
- Until the mount is known the car uses GPS speed.

Fused frames are sent for every motion sample, both through the relay (recording, fallback) and over a
WebRTC data channel (unordered, no retransmits) signalled through the relay; the car keeps whichever copy
arrives first. With the car on the phone's hotspot the channel connects directly. Pongs carry the server time,
so the car page shows the real phone → car delay (median / p95) and how much of it came over WebRTC.

`fusion.test.ts` checks it against simulated drives with a randomly mounted, biased, noisy phone and lagging GPS.

## Engine sound

The engine is synthesised live by the DSP from [Tesbox](https://github.com/Atvriders/tesbox) (MIT, vendored in
`web/src/lib/audio/core/`, see `NOTICES`): crank-timed exhaust pulses into a waveguide exhaust network with
turbo/supercharger, overrun pops, cabin perspective and an output stage. `web/src/lib/audio/control.ts` maps our
drivetrain (rpm, signed load, gear, limiter) to its per-block control and turns gear changes into shift
trajectories. The 15 engine definitions (real ratios, tyres, shift times, voicings) come from Tesbox; their DSP
tests run with ours.

The car page has two engine tabs: **Classic** (our original procedural synth in `web/src/lib/audio/classic/`, 10 engines,
unchanged since before the port) and **DSP** (the engine above, 15 engines). Both worklets load into one
AudioContext and only the selected one is connected, so switching tabs swaps the sound instantly.

## Tests

```bash
cd web && npm run check && npm test              # types, unit tests (drivetrain, synth, status, test drive)
GOLDEN=write npx vitest run golden                # record audio/drivetrain fingerprints before a refactor
GOLDEN=check npx vitest run golden                # must still match after it
npx vitest run analysis                           # engine vs engine-sim spectra (needs samples/stuntrally3)
BENCH=1 npx vitest run bench                      # DSP render speed per engine (× real time)

pip install -r relay/requirements-dev.txt && python -m pytest   # relay WebSocket tests
```

## Deployment

Pushes build `ghcr.io/dragon699/speed/{relay,web}` on the `gha-runner-speed` runner set and bump
`manifests/apps/speed/{relay,web}.yaml` in `dragon699/home-k8s`. Bump `relay/VERSION` / `web/VERSION` to release.

| component | env |
|---|---|
| relay | `DEVICE_KEY` (required, ≥32 chars), `MAX_ROOMS`, `MAX_MESSAGES_PER_SECOND`, `RECORDINGS_DIR`, `MAX_RECORDING_BYTES`, `MAX_RECORDINGS_BYTES`, `LOG_LEVEL`, `LOG_FORMAT` |
| web | `RELAY_URL` (e.g. `http://speed-relay.speed.svc:8080`) |

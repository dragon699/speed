import argparse
from pathlib import Path
import numpy as np
import matplotlib
import matplotlib.pyplot as plt
from tools.src.kalman import SpeedKF
from tools.src.orientation import OrientationEstimator
from tools.src.recording import RecordingLoader


GOOD_ACCURACY_M = 20

matplotlib.use('Agg')


def good_fixes(recording) -> tuple[np.ndarray, np.ndarray]:
    t, speed = recording.gps_speed.t, recording.gps_speed.values

    if len(recording.gps_accuracy) != len(t):
        return t, speed

    mask = recording.gps_accuracy.values <= GOOD_ACCURACY_M
    return t[mask], speed[mask]


def fuse(accel_t, accel, gps_t, gps_speed, q: float, r_gps: float, r_acc: float) -> np.ndarray:
    events = sorted(
        [(t, 1, value) for t, value in zip(accel_t, accel)] +
        [(t, 0, value) for t, value in zip(gps_t, gps_speed)]
    )
    kf = SpeedKF(q=q, r_gps=r_gps, r_acc=r_acc)
    last = events[0][0]
    fused = []

    for t, kind, value in events:
        kf.predict(max(t - last, 0.0))
        kf.update(value, kind)
        last = t

        if kind == 1:
            fused.append(kf.x[0])

    return np.array(fused)


def main() -> None:
    parser = argparse.ArgumentParser(description='Replay a recording through the speed Kalman filter')
    parser.add_argument('recording')
    parser.add_argument('--q', type=float, nargs='+', default=[0.1, 0.5, 2.0])
    parser.add_argument('--r-gps', type=float, default=0.5)
    parser.add_argument('--r-acc', type=float, default=0.3)
    parser.add_argument('--out')
    args = parser.parse_args()

    recording = RecordingLoader.load(args.recording)
    gps_t, gps_speed = good_fixes(recording)
    orientation = OrientationEstimator.estimate(recording, gps_t, gps_speed)
    linear = OrientationEstimator.linear(recording, np.median(recording.accel.values, axis=0))
    forward_accel = orientation.forward_accel(linear)

    print(f'forward axis  {np.round(orientation.forward, 3)} (device frame)')
    print(f'down axis     {np.round(orientation.down, 3)}')
    print(f'scale         {orientation.scale:.2f} (≈1 means accelerometer and GPS agree)')
    print(f'intervals     {orientation.intervals}')

    figure, (speed_axis, accel_axis) = plt.subplots(2, 1, figsize=(16, 9), sharex=True, height_ratios=[3, 1])
    speed_axis.plot(gps_t, gps_speed * 3.6, 'o', markersize=3, color='black', label='GPS')

    for q in args.q:
        fused = fuse(linear.t, forward_accel, gps_t, gps_speed, q, args.r_gps, args.r_acc)
        speed_axis.plot(linear.t, fused * 3.6, linewidth=1, label=f'KF q={q}')

    if len(recording.fused_speed):
        speed_axis.plot(recording.fused_speed.t, recording.fused_speed.values * 3.6, linewidth=1.5, color='tab:red', label='live fused (phone)')
        accel_axis.plot(recording.fused_accel.t, recording.fused_accel.values, linewidth=1, color='tab:red', zorder=3)

    speed_axis.set_ylabel('km/h')
    speed_axis.legend()
    speed_axis.grid(alpha=0.3)
    accel_axis.plot(linear.t, forward_accel, linewidth=0.5, color='tab:gray')
    accel_axis.set_ylabel('forward m/s²')
    accel_axis.set_xlabel('seconds')
    accel_axis.grid(alpha=0.3)
    figure.suptitle(recording.path.name)
    figure.tight_layout()

    out = Path(args.out) if args.out else recording.path.with_suffix('.replay.png')
    figure.savefig(out, dpi=120)
    print(f'plot          {out}')


if __name__ == '__main__':
    main()

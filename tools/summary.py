import argparse
import numpy as np
from tools.src.recording import RecordingLoader


def main() -> None:
    parser = argparse.ArgumentParser(description='Summarize speed recordings')
    parser.add_argument('recordings', nargs='+')
    args = parser.parse_args()

    for path in args.recordings:
        recording = RecordingLoader.load(path)
        accuracy = recording.gps_accuracy.values

        print(f'{recording.path.name}')
        print(f'  duration      {recording.duration / 60:.1f} min')
        print(f'  gps           {len(recording.gps_speed)} fixes · {recording.gps_speed.rate():.2f} Hz'
              f' · accuracy median {np.median(accuracy) if len(accuracy) else float("nan"):.1f} m')
        print(f'  max speed     {recording.gps_speed.values.max() * 3.6 if len(recording.gps_speed) else 0:.0f} km/h')

        for label, series in (('accel', recording.accel), ('linear accel', recording.linear), ('rotation', recording.rotation)):
            print(f'  {label:<13} {len(series)} samples · {series.rate():.1f} Hz')


if __name__ == '__main__':
    main()

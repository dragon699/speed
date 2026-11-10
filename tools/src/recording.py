from dataclasses import dataclass
from pathlib import Path
import numpy as np
from common.protocol.frames import Frame, FrameKind


FRAME_DTYPE = np.dtype([('t', '<f8'), ('kind', 'u1'), ('value', '<f4')])

assert FRAME_DTYPE.itemsize == Frame.size



@dataclass
class Series:
    t: np.ndarray
    values: np.ndarray


    def __len__(self) -> int:
        return len(self.t)


    def rate(self) -> float:
        return (len(self.t) - 1) / (self.t[-1] - self.t[0]) if len(self.t) > 1 else 0.0


@dataclass
class Recording:
    path: Path
    start_ms: float
    duration: float
    gps_speed: Series
    gps_accuracy: Series
    fused_speed: Series
    fused_accel: Series
    accel: Series
    linear: Series
    rotation: Series



class RecordingLoader:
    @staticmethod
    def load(path: str | Path) -> Recording:
        path = Path(path)
        frames = np.frombuffer(path.read_bytes(), dtype=FRAME_DTYPE)

        if not len(frames):
            raise ValueError(f'{path.name}: empty recording')

        start = frames['t'].min()
        duration = (frames['t'].max() - start) / 1000

        def scalar(kind: FrameKind) -> Series:
            rows = np.sort(frames[frames['kind'] == kind], order='t')
            return Series((rows['t'] - start) / 1000, rows['value'].astype(float))

        def vector(kinds: tuple[FrameKind, FrameKind, FrameKind]) -> Series:
            parts = [np.sort(frames[frames['kind'] == kind], order='t') for kind in kinds]
            count = min(len(part) for part in parts)
            values = np.column_stack([part['value'][:count] for part in parts]).astype(float)
            return Series((parts[0]['t'][:count] - start) / 1000, values.reshape(count, 3))

        return Recording(
            path=path,
            start_ms=float(start),
            duration=float(duration),
            gps_speed=scalar(FrameKind.GPS_SPEED),
            gps_accuracy=scalar(FrameKind.GPS_ACCURACY),
            fused_speed=scalar(FrameKind.FUSED_SPEED),
            fused_accel=scalar(FrameKind.FUSED_ACCEL),
            accel=vector((FrameKind.ACCEL_X, FrameKind.ACCEL_Y, FrameKind.ACCEL_Z)),
            linear=vector((FrameKind.LINEAR_ACCEL_X, FrameKind.LINEAR_ACCEL_Y, FrameKind.LINEAR_ACCEL_Z)),
            rotation=vector((FrameKind.ROTATION_ALPHA, FrameKind.ROTATION_BETA, FrameKind.ROTATION_GAMMA))
        )

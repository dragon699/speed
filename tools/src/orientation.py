from dataclasses import dataclass
import numpy as np
from tools.src.recording import Recording, Series


MIN_SAMPLES_PER_INTERVAL = 5



@dataclass
class Orientation:
    down: np.ndarray
    forward: np.ndarray
    scale: float
    intervals: int


    def forward_accel(self, linear: Series) -> np.ndarray:
        return linear.values @ self.forward



class OrientationEstimator:
    @staticmethod
    def estimate(recording: Recording, gps_t: np.ndarray, gps_speed: np.ndarray) -> Orientation:
        if not len(recording.accel):
            raise ValueError('No accelerometer data in the recording')

        gravity = np.median(recording.accel.values, axis=0)
        down = gravity / np.linalg.norm(gravity)
        e1, e2 = OrientationEstimator.horizontal_basis(down)

        linear = OrientationEstimator.linear(recording, gravity)
        horizontal = np.column_stack([linear.values @ e1, linear.values @ e2])

        rows, targets = [], []

        for i in range(1, len(gps_t)):
            mask = (linear.t >= gps_t[i - 1]) & (linear.t < gps_t[i])

            if mask.sum() < MIN_SAMPLES_PER_INTERVAL:
                continue

            rows.append(horizontal[mask].mean(axis=0))
            targets.append((gps_speed[i] - gps_speed[i - 1]) / (gps_t[i] - gps_t[i - 1]))

        if len(rows) < 2:
            raise ValueError('Not enough GPS intervals overlapping motion data to find the forward axis')

        rows, targets = np.array(rows), np.array(targets)
        direction = rows.T @ targets
        direction /= np.linalg.norm(direction)
        projected = rows @ direction
        scale = float((projected @ targets) / (projected @ projected))
        forward = direction[0] * e1 + direction[1] * e2

        return Orientation(down=down, forward=forward, scale=scale, intervals=len(rows))


    @staticmethod
    def linear(recording: Recording, gravity: np.ndarray) -> Series:
        if len(recording.linear):
            return recording.linear

        return Series(recording.accel.t, recording.accel.values - gravity)


    @staticmethod
    def horizontal_basis(down: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        helper = np.array([1.0, 0.0, 0.0]) if abs(down[0]) < 0.9 else np.array([0.0, 1.0, 0.0])
        e1 = np.cross(down, helper)
        e1 /= np.linalg.norm(e1)

        return e1, np.cross(down, e1)

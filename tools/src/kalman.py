import numpy as np



class SpeedKF:
    def __init__(self, q: float = 0.5, r_gps: float = 0.5, r_acc: float = 0.3) -> None:
        self.x = np.zeros(2)
        self.P = np.eye(2) * 10
        self.q = q
        self.R = {0: r_gps ** 2, 1: r_acc ** 2}


    def predict(self, dt: float) -> None:
        F = np.array([[1, dt], [0, 1]])
        Q = self.q * np.array([[dt ** 3 / 3, dt ** 2 / 2], [dt ** 2 / 2, dt]])

        self.x = F @ self.x
        self.P = F @ self.P @ F.T + Q


    def update(self, z: float, kind: int) -> None:
        H = np.array([[1.0, 0.0]]) if kind == 0 else np.array([[0.0, 1.0]])
        S = H @ self.P @ H.T + self.R[kind]
        K = self.P @ H.T / S

        self.x = self.x + (K * (z - H @ self.x)).ravel()
        self.P = (np.eye(2) - K @ H) @ self.P

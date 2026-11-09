import struct
from enum import IntEnum



class FrameKind(IntEnum):
    GPS_SPEED = 0
    FORWARD_ACCEL = 1
    FUSED_SPEED = 2
    FUSED_ACCEL = 3


class Frame:
    format = '<dBf'
    size = struct.calcsize(format)


    @staticmethod
    def pack(t_ms: float, kind: FrameKind, value: float) -> bytes:
        return struct.pack(Frame.format, t_ms, kind, value)


    @staticmethod
    def unpack(data: bytes) -> tuple[float, FrameKind, float]:
        t_ms, kind, value = struct.unpack(Frame.format, data)
        return t_ms, FrameKind(kind), value


    @staticmethod
    def is_valid(data: bytes) -> bool:
        return len(data) == Frame.size and data[8] in FrameKind._value2member_map_

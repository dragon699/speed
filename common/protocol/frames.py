import struct
from collections.abc import Iterator
from enum import IntEnum



class FrameKind(IntEnum):
    GPS_SPEED = 0
    FORWARD_ACCEL = 1
    FUSED_SPEED = 2
    FUSED_ACCEL = 3
    ACCEL_X = 4
    ACCEL_Y = 5
    ACCEL_Z = 6
    LINEAR_ACCEL_X = 7
    LINEAR_ACCEL_Y = 8
    LINEAR_ACCEL_Z = 9
    ROTATION_ALPHA = 10
    ROTATION_BETA = 11
    ROTATION_GAMMA = 12
    GPS_ACCURACY = 13
    CLOCK_OFFSET = 14


class Frame:
    format = '<dBf'
    size = struct.calcsize(format)
    max_batch = 64
    forwarded = frozenset({
        FrameKind.GPS_SPEED,
        FrameKind.FORWARD_ACCEL,
        FrameKind.FUSED_SPEED,
        FrameKind.FUSED_ACCEL,
        FrameKind.CLOCK_OFFSET
    })


    @staticmethod
    def pack(t_ms: float, kind: FrameKind, value: float) -> bytes:
        return struct.pack(Frame.format, t_ms, kind, value)


    @staticmethod
    def unpack(data: bytes) -> tuple[float, FrameKind, float]:
        t_ms, kind, value = struct.unpack(Frame.format, data)
        return t_ms, FrameKind(kind), value


    @staticmethod
    def iter_unpack(data: bytes) -> Iterator[tuple[float, FrameKind, float]]:
        for t_ms, kind, value in struct.iter_unpack(Frame.format, data):
            yield t_ms, FrameKind(kind), value


    @staticmethod
    def is_valid_batch(data: bytes) -> bool:
        count, remainder = divmod(len(data), Frame.size)

        if remainder or not 0 < count <= Frame.max_batch:
            return False

        return all(
            data[offset + 8] in FrameKind._value2member_map_
            for offset in range(0, len(data), Frame.size)
        )


    @staticmethod
    def filter_forwarded(data: bytes) -> bytes:
        return b''.join(
            data[offset:offset + Frame.size]
            for offset in range(0, len(data), Frame.size)
            if data[offset + 8] in Frame.forwarded
        )

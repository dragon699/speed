import asyncio, time
from datetime import datetime
from pathlib import Path
from relay.settings import settings


FLUSH_BYTES = 64 * 1024
FLUSH_SECONDS = 1.0



class Recorder:
    def __init__(self, code: str) -> None:
        self.path = Path(settings.recordings_dir) / f'{code}-{datetime.now().strftime("%Y%m%d-%H%M%S")}.bin'
        self.buffer = bytearray()
        self.size = 0
        self.flushed_at = time.monotonic()
        self.full = False


    @staticmethod
    def has_space() -> bool:
        directory = Path(settings.recordings_dir)
        directory.mkdir(parents=True, exist_ok=True)
        used = sum(path.stat().st_size for path in directory.glob('*.bin'))

        return used < settings.max_recordings_bytes


    async def write(self, data: bytes) -> None:
        if self.size + len(self.buffer) + len(data) > settings.max_recording_bytes:
            self.full = True
            return

        self.buffer += data

        if len(self.buffer) >= FLUSH_BYTES or time.monotonic() - self.flushed_at >= FLUSH_SECONDS:
            await self.flush()


    async def flush(self) -> None:
        self.flushed_at = time.monotonic()

        if not self.buffer:
            return

        data = bytes(self.buffer)
        self.buffer.clear()
        self.size += len(data)

        await asyncio.to_thread(self.append, data)


    def append(self, data: bytes) -> None:
        with self.path.open('ab') as file:
            file.write(data)

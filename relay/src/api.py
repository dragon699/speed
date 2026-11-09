from fastapi import FastAPI
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from relay.settings import settings
from relay.src.loaders import RoutesLoader


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    RoutesLoader.load(app, settings)

    yield


app = FastAPI(
    title='Speed Relay',
    version=settings.version,
    description='Pairs a phone with a car and relays sensor frames between them.',
    lifespan=lifespan
)

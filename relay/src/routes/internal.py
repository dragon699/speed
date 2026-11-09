from fastapi import APIRouter
from relay.settings import settings
from relay.src.rooms import rooms


router = APIRouter()


@router.get('/health', tags=['internal'], summary='Health check')
def health() -> dict:
    return {
        'healthy': True,
        'name': settings.name,
        'version': settings.version,
        'rooms': len(rooms.rooms)
    }


@router.get('/ready', tags=['internal'], summary='Readiness check')
def ready() -> dict:
    return {
        'ready': True
    }

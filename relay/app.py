import uvicorn
from relay.settings import settings
from relay.src.api import app
from relay.src.telemetry.logging import logger


if __name__ == "__main__":
    uvicorn.run(
        app,
        host=settings.listen_host,
        port=settings.listen_port,
        log_config=logger.get_uvicorn_config()
    )

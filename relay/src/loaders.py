import json
from pydantic import ValidationError
from relay.src.telemetry.logging import log



class SettingsLoader:
    @staticmethod
    def load():
        from relay.settings import Settings

        try:
            settings = Settings()

        except ValidationError as err:
            print(json.dumps([
                {
                    'error': error['msg'],
                    'env': f'{error["loc"][0].upper()}' if error['loc'] else None
                } for error in err.errors()
            ], indent=2))
            raise SystemExit(1)

        return settings


class RoutesLoader:
    @staticmethod
    def load(app, settings):
        from relay.src.routes import (internal, ws)

        app.include_router(internal.router, prefix="/api")
        app.include_router(ws.router, prefix="/ws")
        log.info(
            f'Relaying frames on {settings.listen_host}:{settings.listen_port}'
        )

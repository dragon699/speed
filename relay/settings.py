import os
from typing import Any
from pydantic_settings import BaseSettings
from pydantic import Field, SecretStr
from common.utils.helpers import SysUtils
from relay.src.telemetry.logging import logger
from relay.src.loaders import SettingsLoader



class Settings(BaseSettings):
    name: str = 'speed-relay'
    version: str = SysUtils.get_app_version(f'{os.path.dirname(__file__)}/VERSION')
    listen_host: str = '0.0.0.0'
    listen_port: int = 8080

    log_level: str = 'info'
    log_format: str = 'json'

    device_key: SecretStr
    hello_timeout_seconds: float = Field(default=5, gt=0)
    max_rooms: int = Field(default=4, gt=0)
    max_frames_per_second: int = Field(default=400, gt=0)


    def model_post_init(self, __context: Any) -> None:
        if len(self.device_key.get_secret_value()) < 32:
            raise ValueError('DEVICE_KEY must be at least 32 characters')

        logger.update_settings(
            log_level=self.log_level,
            log_format=self.log_format
        )


settings = SettingsLoader.load()

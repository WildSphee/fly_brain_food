from pathlib import Path
from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / '.env', extra='ignore')
    backend_host: str = '127.0.0.1'
    backend_port: int = Field(default=8106, ge=1024, le=65535)
    frontend_host: str = '0.0.0.0'
    frontend_port: int = Field(default=5176, ge=1024, le=65535)
    neuprint_api_key: SecretStr = SecretStr('')
    neuprint_dataset: str = 'male-cns:v1.0'
    neural_seed: int = 42
    max_sessions: int = Field(default=4, ge=1, le=16)
    data_dir: Path = ROOT / '.data'


settings = Settings()

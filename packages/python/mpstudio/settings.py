from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Prima Studio"
    environment: str = "local"
    database_url: str = "sqlite:///./local-data/mpstudio.db"
    local_storage_root: str = "./local-data/storage"
    public_base_url: str = "http://localhost:8080"

    gcp_project_id: str = ""
    gcp_region: str = "asia-southeast1"
    gcs_bucket_name: str = ""
    video_clipping_bucket_name: str = "mp-ai-video-clipping-bucket"

    transcoder_enabled: bool = False
    transcoder_region: str = ""
    transcoder_poll_timeout_seconds: int = 0
    transcoder_poll_interval_seconds: float = 10.0

    task_poll_interval_seconds: float = 2.0
    worker_id: str = "local-worker"
    scratch_root: str = "/tmp/mpstudio"

    gemini_model_name: str = "gemini-2.5-flash"
    shortgen_image: str = "ghcr.io/harry0703/moneyprinterturbo:latest"
    stock_video_source: str = "pexels"
    pexels_api_keys: str = ""
    pixabay_api_keys: str = ""
    coverr_api_keys: str = ""
    stock_download_timeout_seconds: int = 60
    light_inline_workflows: bool = False
    newsroom_live_signals: bool = False
    newsroom_signal_timeout_seconds: float = 5.0


@lru_cache
def get_settings() -> Settings:
    return Settings()

import time
from dataclasses import dataclass
from typing import Any

from .settings import get_settings
from .storage import parse_gcs_uri


@dataclass(frozen=True)
class TimelineClip:
    input_uri: str
    start_seconds: float = 0.0
    end_seconds: float | None = None


@dataclass(frozen=True)
class TranscoderJobResult:
    job_name: str
    state: str
    output_uri: str
    error: str = ""


def resolution_for_aspect(aspect_ratio: str) -> tuple[int, int]:
    if aspect_ratio == "16:9":
        return 1920, 1080
    if aspect_ratio == "1:1":
        return 1080, 1080
    return 1080, 1920


def parse_timestamp_range(value: str) -> tuple[float, float] | None:
    if not value or " - " not in value:
        return None
    start, end = value.split(" - ", 1)
    try:
        return _parse_hhmmss(start), _parse_hhmmss(end)
    except ValueError:
        return None


class TranscoderRenderer:
    def __init__(self) -> None:
        self.settings = get_settings()

    @property
    def enabled(self) -> bool:
        return bool(self.settings.transcoder_enabled and self.settings.gcp_project_id)

    @property
    def location(self) -> str:
        return self.settings.transcoder_region or self.settings.gcp_region

    def create_concat_job(
        self,
        *,
        clips: list[TimelineClip],
        output_directory_uri: str,
        output_filename: str,
        aspect_ratio: str,
        include_audio: bool = True,
        pubsub_topic: str | None = None,
    ) -> TranscoderJobResult:
        if not self.enabled:
            raise RuntimeError("Transcoder is disabled")
        if not clips:
            raise ValueError("at least one clip is required")

        from google.cloud.video import transcoder_v1
        from google.cloud.video.transcoder_v1.services.transcoder_service import TranscoderServiceClient

        width, height = resolution_for_aspect(aspect_ratio)
        client = TranscoderServiceClient()
        parent = f"projects/{self.settings.gcp_project_id}/locations/{self.location}"
        output_directory_uri = _as_directory_uri(output_directory_uri)

        inputs = [
            transcoder_v1.types.Input(key=f"input{i}", uri=clip.input_uri)
            for i, clip in enumerate(clips)
        ]
        edit_atoms = []
        for index, clip in enumerate(clips):
            atom = transcoder_v1.types.EditAtom(key=f"atom{index}", inputs=[f"input{index}"])
            if clip.start_seconds > 0:
                atom.start_time_offset = _duration(clip.start_seconds)
            if clip.end_seconds is not None and clip.end_seconds > clip.start_seconds:
                atom.end_time_offset = _duration(clip.end_seconds)
            edit_atoms.append(atom)

        elementary_streams = [
            transcoder_v1.types.ElementaryStream(
                key="video-stream0",
                video_stream=transcoder_v1.types.VideoStream(
                    h264=transcoder_v1.types.VideoStream.H264CodecSettings(
                        height_pixels=height,
                        width_pixels=width,
                        bitrate_bps=4_000_000 if height >= 1920 else 2_500_000,
                        frame_rate=30,
                    )
                ),
            )
        ]
        mux_elementary_streams = ["video-stream0"]
        if include_audio:
            elementary_streams.append(
                transcoder_v1.types.ElementaryStream(
                    key="audio-stream0",
                    audio_stream=transcoder_v1.types.AudioStream(codec="aac", bitrate_bps=128_000),
                )
            )
            mux_elementary_streams.append("audio-stream0")

        config_kwargs: dict[str, Any] = {
            "inputs": inputs,
            "edit_list": edit_atoms,
            "elementary_streams": elementary_streams,
            "mux_streams": [
                transcoder_v1.types.MuxStream(
                    key="mp4",
                    file_name=output_filename,
                    container="mp4",
                    elementary_streams=mux_elementary_streams,
                )
            ],
            "output": transcoder_v1.types.Output(uri=output_directory_uri),
        }
        if pubsub_topic:
            config_kwargs["pubsub_destination"] = transcoder_v1.types.PubsubDestination(topic=pubsub_topic)

        job = transcoder_v1.types.Job(config=transcoder_v1.types.JobConfig(**config_kwargs))
        response = client.create_job(parent=parent, job=job)
        expected_output_uri = f"{output_directory_uri}{output_filename}"
        return TranscoderJobResult(job_name=response.name, state=response.state.name, output_uri=expected_output_uri)

    def wait_for_job(self, job_name: str, output_uri: str) -> TranscoderJobResult:
        if not self.enabled:
            raise RuntimeError("Transcoder is disabled")

        from google.cloud.video.transcoder_v1.services.transcoder_service import TranscoderServiceClient

        client = TranscoderServiceClient()
        timeout = self.settings.transcoder_poll_timeout_seconds
        interval = max(self.settings.transcoder_poll_interval_seconds, 1.0)
        deadline = time.monotonic() + timeout if timeout > 0 else time.monotonic()
        last_state = "UNKNOWN"

        while True:
            job = client.get_job(name=job_name)
            last_state = job.state.name
            if last_state == "SUCCEEDED":
                return TranscoderJobResult(job_name=job_name, state=last_state, output_uri=output_uri)
            if last_state == "FAILED":
                error = job.error.message if job.error else "Transcoder job failed"
                return TranscoderJobResult(job_name=job_name, state=last_state, output_uri=output_uri, error=error)
            if timeout <= 0 or time.monotonic() >= deadline:
                return TranscoderJobResult(job_name=job_name, state=last_state, output_uri=output_uri)
            time.sleep(interval)


def output_directory_for(gcs_uri: str) -> str:
    bucket, blob = parse_gcs_uri(gcs_uri)
    directory = blob.rsplit("/", 1)[0] if "/" in blob else ""
    return f"gs://{bucket}/{directory}/" if directory else f"gs://{bucket}/"


def _duration(seconds: float):
    from google.protobuf.duration_pb2 import Duration

    duration = Duration()
    duration.FromSeconds(int(seconds))
    nanos = int(round((float(seconds) - int(seconds)) * 1_000_000_000))
    if nanos:
        duration.nanos = nanos
    return duration


def _parse_hhmmss(value: str) -> float:
    parts = [float(part) for part in value.strip().split(":")]
    if len(parts) == 3:
        hours, minutes, seconds = parts
        return hours * 3600 + minutes * 60 + seconds
    if len(parts) == 2:
        minutes, seconds = parts
        return minutes * 60 + seconds
    if len(parts) == 1:
        return parts[0]
    raise ValueError(f"invalid timestamp: {value}")


def _as_directory_uri(uri: str) -> str:
    return uri if uri.endswith("/") else f"{uri}/"

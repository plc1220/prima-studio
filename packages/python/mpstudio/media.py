import shutil
import subprocess
from pathlib import Path

from .storage import StorageClient
from .transcoder import TimelineClip, resolution_for_aspect


def create_demo_mp4(path: str | Path, *, title: str, duration_seconds: int = 3) -> None:
    """Create a tiny playable MP4 placeholder for local/demo renders.

    In production the render agents call FFmpeg with real source clips. For local
    smoke tests and demos without uploaded media, this keeps the workflow end-to-end.
    """
    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)

    ffmpeg = _ffmpeg_binary()
    command = [
        ffmpeg,
        "-y",
        "-f",
        "lavfi",
        "-i",
        f"color=c=0x101820:s=1080x1920:d={duration_seconds}",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=channel_layout=stereo:sample_rate=44100",
        "-shortest",
        "-vf",
        (
            "drawtext=fontcolor=white:fontsize=48:x=(w-text_w)/2:y=(h-text_h)/2:"
            f"text='{_escape_drawtext(title)}'"
        ),
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        str(destination),
    ]
    subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def render_timeline_mp4(
    *,
    storage: StorageClient,
    clips: list[TimelineClip],
    output_path: str | Path,
    aspect_ratio: str,
) -> None:
    """Render local timeline clips into a playable MP4 with ffmpeg."""
    if not clips:
        raise ValueError("at least one timeline clip is required")

    destination = Path(output_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    ffmpeg = _ffmpeg_binary()
    width, height = resolution_for_aspect(aspect_ratio)

    command = [ffmpeg, "-y"]
    local_clips: list[Path] = []
    for clip in clips:
        local_path = storage.local_path_for_uri(clip.input_uri)
        if not local_path.exists():
            raise FileNotFoundError(f"timeline input not found: {clip.input_uri}")
        local_clips.append(local_path)
        command.extend(["-i", str(local_path)])
    command.extend(["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"])

    filter_parts = []
    concat_inputs = []
    for index, clip in enumerate(clips):
        duration = ""
        if clip.end_seconds is not None and clip.end_seconds > clip.start_seconds:
            duration = f":duration={clip.end_seconds - clip.start_seconds:.3f}"
        filter_parts.append(
            f"[{index}:v]trim=start={clip.start_seconds:.3f}{duration},setpts=PTS-STARTPTS,"
            f"scale={width}:{height}:force_original_aspect_ratio=increase,"
            f"crop={width}:{height},fps=30,setsar=1[v{index}]"
        )
        concat_inputs.append(f"[v{index}]")
    filter_parts.append(f"{''.join(concat_inputs)}concat=n={len(clips)}:v=1:a=0[vout]")

    command.extend(
        [
            "-filter_complex",
            ";".join(filter_parts),
            "-map",
            "[vout]",
            "-map",
            f"{len(local_clips)}:a",
            "-shortest",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            str(destination),
        ]
    )
    subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def _ffmpeg_binary() -> str:
    system_ffmpeg = shutil.which("ffmpeg")
    if system_ffmpeg:
        return system_ffmpeg
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception as exc:
        raise RuntimeError("ffmpeg is required for playable local demo renders") from exc


def _escape_drawtext(value: str) -> str:
    return value.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")

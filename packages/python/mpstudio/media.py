import shutil
import subprocess
from pathlib import Path

from .storage import StorageClient
from .transcoder import TimelineClip, resolution_for_aspect


def create_demo_mp4(
    path: str | Path,
    *,
    title: str,
    duration_seconds: int = 3,
    audio_path: str | Path | None = None,
    subtitle_text: str = "",
    subtitle_options: dict | None = None,
) -> None:
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
    ]
    if audio_path:
        command.extend(["-i", str(audio_path)])
    else:
        command.extend(["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"])
    vf = (
        "drawtext=fontcolor=white:fontsize=54:x=(w-text_w)/2:y=h*0.16:"
        f"bordercolor=0x000000:borderw=2:text='{_escape_drawtext(_wrap_drawtext(title, max_chars=28))}'"
    )
    if subtitle_text.strip():
        vf = f"{vf},{_drawtext_filter(subtitle_text, 1080, 1920, subtitle_options or {})}"
    command.extend(
        [
        "-shortest",
        "-vf",
        vf,
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        str(destination),
        ]
    )
    subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def render_timeline_mp4(
    *,
    storage: StorageClient,
    clips: list[TimelineClip],
    output_path: str | Path,
    aspect_ratio: str,
    audio_path: str | Path | None = None,
    subtitle_text: str = "",
    subtitle_options: dict | None = None,
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
            try:
                local_path.write_bytes(storage.read_bytes(clip.input_uri))
            except Exception as exc:
                raise FileNotFoundError(f"timeline input not found: {clip.input_uri}") from exc
        local_clips.append(local_path)
        command.extend(["-i", str(local_path)])
    if audio_path:
        command.extend(["-i", str(audio_path)])
        audio_input_index = len(local_clips)
    else:
        command.extend(["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"])
        audio_input_index = len(local_clips)

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
    filter_parts.append(f"{''.join(concat_inputs)}concat=n={len(clips)}:v=1:a=0[vcat]")
    video_output = "[vcat]"
    if subtitle_text.strip():
        filter_parts.append(f"[vcat]{_drawtext_filter(subtitle_text, width, height, subtitle_options or {})}[vout]")
        video_output = "[vout]"

    command.extend(
        [
            "-filter_complex",
            ";".join(filter_parts),
            "-map",
            video_output,
            "-map",
            f"{audio_input_index}:a",
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
    if destination.stat().st_size < 4096:
        raise RuntimeError("ffmpeg produced an empty review cut; check clip timestamps against the source duration")


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
    return value.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'").replace("%", "\\%")


def _drawtext_filter(text: str, width: int, height: int, options: dict) -> str:
    size = int(options.get("font_size") or 60)
    if width < height:
        size = min(size, 44)
    color = _ffmpeg_color(str(options.get("font_color") or "white"))
    outline_color = _ffmpeg_color(str(options.get("outline_color") or "black"))
    outline_width = float(options.get("outline_width") or 1.5)
    position = str(options.get("position") or "bottom")
    y = {
        "top": "h*0.12",
        "middle": "(h-text_h)/2",
        "bottom": "h-text_h-h*0.12",
    }.get(position, "h-text_h-h*0.12")
    wrapped = _wrap_drawtext(text, max_chars=30 if width < height else 58)
    return (
        "drawtext="
        f"fontcolor={color}:fontsize={size}:x=(w-text_w)/2:y={y}:"
        f"bordercolor={outline_color}:borderw={outline_width}:"
        f"line_spacing={max(8, round(size * 0.24))}:"
        f"text='{_escape_drawtext(wrapped)}'"
    )


def _wrap_drawtext(value: str, *, max_chars: int) -> str:
    words = value.replace("\n", " ").split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if len(candidate) > max_chars and current:
            lines.append(current)
            current = word
        else:
            current = candidate
        if len(lines) >= 3:
            break
    if current and len(lines) < 3:
        lines.append(current)
    return "\n".join(lines)


def _ffmpeg_color(value: str) -> str:
    return f"0x{value[1:]}" if value.startswith("#") else value

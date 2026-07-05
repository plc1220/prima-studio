from pathlib import Path
import shutil
import subprocess


def synthesize_voiceover_audio(
    *,
    text: str,
    voice_name: str,
    language: str,
    output_path: str | Path,
    speech_rate: float = 1.0,
    speech_volume: float = 1.0,
    tts_server: str = "gcp",
) -> Path | None:
    """Create narration audio with Google Cloud Text-to-Speech when ADC is available."""
    if tts_server != "gcp" or not text.strip():
        return None

    try:
        from google.cloud import texttospeech
    except Exception:
        return _synthesize_with_local_say(text=text, output_path=output_path, speech_rate=speech_rate)

    destination = Path(output_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        client = texttospeech.TextToSpeechClient()
        response = client.synthesize_speech(
            input=texttospeech.SynthesisInput(text=text),
            voice=texttospeech.VoiceSelectionParams(
                language_code=_language_code(language, voice_name),
                name=voice_name,
            ),
            audio_config=texttospeech.AudioConfig(
                audio_encoding=texttospeech.AudioEncoding.MP3,
                speaking_rate=speech_rate,
                volume_gain_db=_volume_gain_db(speech_volume),
            ),
        )
    except Exception:
        return _synthesize_with_local_say(text=text, output_path=output_path, speech_rate=speech_rate)
    if not response.audio_content:
        return None
    destination.write_bytes(response.audio_content)
    return destination


def _language_code(language: str, voice_name: str) -> str:
    if voice_name and "-" in voice_name:
        parts = voice_name.split("-")
        if len(parts) >= 2:
            return f"{parts[0]}-{parts[1]}"
    if language == "auto":
        return "ms-MY"
    return language


def _volume_gain_db(speech_volume: float) -> float:
    return max(-20.0, min(16.0, (speech_volume - 1.0) * 10.0))


def _synthesize_with_local_say(
    *,
    text: str,
    output_path: str | Path,
    speech_rate: float,
) -> Path | None:
    say = shutil.which("say")
    if not say:
        return None
    destination = Path(output_path).with_suffix(".aiff")
    destination.parent.mkdir(parents=True, exist_ok=True)
    words_per_minute = str(max(120, min(260, round(180 * speech_rate))))
    subprocess.run(
        [say, "-r", words_per_minute, "-o", str(destination), text],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return destination if destination.exists() and destination.stat().st_size > 0 else None

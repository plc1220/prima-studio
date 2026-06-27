# Upstream Integration Notes

This app was reworked after auditing:

- `harry0703/MoneyPrinterTurbo` at `84a136a939bb04c666b478caddd87654ce31d124`
- `plc1220/revmed-vid-clip` at `49af2ddc350b0a3cd336155b054d094e487db106`

MoneyPrinterTurbo is MIT licensed. Its workflow shape is used here with attribution:
script generation, search terms, stock media selection, audio/subtitle planning, and
final render assembly.

The Newsroom Generator is an upstream layer built for this app. It produces a JSON
editorial package containing ranked topic cards, signal evidence, candidate angles,
voiceover script, scene plan, captions, hashtags, stock search terms, and a structured
handoff into the Prima Studio `shorts` workflow. When a newsroom package is sent
to the Shorts Generator, the approved script and search terms are passed through rather than
rewritten from a blank prompt.

The `revmed-vid-clip` repo did not include a license file at audit time. To avoid
copying unlicensed implementation, this app uses a clean-room implementation of the
same product workflow: upload/source asset, Gemini metadata analysis, clip candidate
selection, and GCS output.

Rendering is intentionally moved away from local FFmpeg for the deployed path. The app
uses Google Cloud Transcoder API when `TRANSCODER_ENABLED=true`, with local demo MP4
generation retained only as a fallback for local development, invalid demo uploads, or
environments where the Transcoder service is not configured.

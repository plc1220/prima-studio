# AGENTS.md

Repository guidance for AI coding agents.

The web application lives in `apps/web`. For UI work there, follow the Astryx conventions in `apps/web/AGENTS.md`.

## Local app startup

Start both services when the user asks to run or restart the app:

1. Frontend:
   ```bash
   cd apps/web
   npm run dev
   ```
   The Next.js app serves on http://localhost:3000.

2. Backend:
   ```bash
   source .venv/bin/activate
   uvicorn services.api.app.main:app --reload --port 8080
   ```
   The FastAPI service serves on http://localhost:8080. Verify it with:
   ```bash
   curl http://localhost:8080/healthz
   ```

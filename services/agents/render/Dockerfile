FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1
WORKDIR /workspace

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*

COPY packages/python ./packages/python
COPY services/agents/render/requirements.txt ./services/agents/render/requirements.txt
RUN pip install --no-cache-dir -e packages/python -r services/agents/render/requirements.txt

COPY services ./services

CMD ["python", "-m", "services.agents.render.app.main"]

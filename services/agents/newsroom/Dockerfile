FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1
WORKDIR /workspace

COPY packages/python ./packages/python
COPY services/agents/newsroom/requirements.txt ./services/agents/newsroom/requirements.txt
RUN pip install --no-cache-dir -e packages/python -r services/agents/newsroom/requirements.txt

COPY services ./services

CMD ["python", "-m", "services.agents.newsroom.app.main"]

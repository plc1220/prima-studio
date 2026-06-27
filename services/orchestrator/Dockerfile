FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1
WORKDIR /workspace

COPY packages/python ./packages/python
COPY services/orchestrator/requirements.txt ./services/orchestrator/requirements.txt
RUN pip install --no-cache-dir -e packages/python -r services/orchestrator/requirements.txt

COPY services ./services

CMD ["python", "-m", "services.orchestrator.app.main"]

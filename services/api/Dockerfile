FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1
WORKDIR /workspace

COPY packages/python ./packages/python
COPY services/api/requirements.txt ./services/api/requirements.txt
RUN pip install --no-cache-dir -e packages/python -r services/api/requirements.txt

COPY services ./services

EXPOSE 8080
CMD ["sh", "-c", "uvicorn services.api.app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]

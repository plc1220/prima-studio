import logging
import time
from collections.abc import Callable
from uuid import UUID

from .contracts import AgentTaskKind, AgentTaskPayload, JobStatus
from .database import session_scope
from .repository import claim_task, complete_task, fail_task, set_job_status
from .settings import get_settings

logger = logging.getLogger(__name__)


TaskHandler = Callable[[AgentTaskPayload], None]


def run_worker(kind: AgentTaskKind, handler: TaskHandler) -> None:
    settings = get_settings()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    logger.info("starting worker kind=%s worker_id=%s", kind.value, settings.worker_id)

    while True:
        task = None
        with session_scope() as session:
            task = claim_task(session, kind)

        if task is None:
            time.sleep(settings.task_poll_interval_seconds)
            continue

        payload = AgentTaskPayload.model_validate(task.payload)
        logger.info("claimed task=%s job=%s step=%s", task.id, payload.job_id, payload.step)
        try:
            handler(payload)
        except Exception as exc:  # pragma: no cover - worker safety net
            logger.exception("task failed task=%s", task.id)
            with session_scope() as session:
                attached = session.merge(task)
                fail_task(session, attached, str(exc))
                set_job_status(session, UUID(str(payload.job_id)), JobStatus.failed, str(exc))
            continue

        with session_scope() as session:
            attached = session.merge(task)
            complete_task(session, attached)


from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass
import os
import time


@dataclass
class _NoopLock:
    def acquire(self, blocking: bool = True, blocking_timeout: float | None = None) -> bool:
        return True

    def release(self) -> None:
        return None


def _get_redis_url() -> str:
    return (
        os.getenv("KAMPUS_REDIS_URL", "")
        or os.getenv("CELERY_BROKER_URL", "")
        or os.getenv("REDIS_URL", "")
    )


def _redis_lock(key: str, timeout: int):
    url = _get_redis_url()
    if not url or not url.startswith("redis://"):
        return None

    try:
        import redis  # type: ignore

        client = redis.Redis.from_url(url)
        return client.lock(name=key, timeout=timeout)
    except Exception:
        return None


@contextmanager
def distributed_lock(key: str, *, timeout: int = 30, blocking_timeout: int = 15):
    """Best-effort distributed lock.

    Uses redis-py if available and a Redis URL is configured.
    Falls back to a no-op lock (tests/local env).
    """

    lock = _redis_lock(key, timeout) or _NoopLock()

    acquired = False
    try:
        if hasattr(lock, "acquire"):
            try:
                acquired = bool(lock.acquire(blocking=True, blocking_timeout=blocking_timeout))
            except TypeError:
                acquired = bool(lock.acquire(True))
        else:
            acquired = True

        if not acquired:
            raise TimeoutError(f"No se pudo adquirir lock: {key}")

        yield
    finally:
        try:
            if acquired and hasattr(lock, "release"):
                lock.release()
        except Exception:
            # Best effort
            pass


@contextmanager
def multi_lock(keys: list[str], *, timeout: int = 30, blocking_timeout: int = 15):
    """Acquire multiple locks in stable order."""

    keys_sorted = sorted(set([k for k in keys if k]))
    if not keys_sorted:
        yield
        return

    stack = []
    try:
        for k in keys_sorted:
            cm = distributed_lock(k, timeout=timeout, blocking_timeout=blocking_timeout)
            stack.append(cm)
            cm.__enter__()
        yield
    finally:
        while stack:
            cm = stack.pop()
            try:
                cm.__exit__(None, None, None)
            except Exception:
                pass

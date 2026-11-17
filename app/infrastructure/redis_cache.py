from __future__ import annotations

import json
import threading
import time
from typing import Any

from redis import Redis
from redis.exceptions import RedisError

from app.config import settings


class InMemoryRedisClient:
    """Thread-safe in-memory Redis-compatible fallback for local development when Redis is not running."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._store: dict[str, tuple[str, float | None]] = {}

    def _purge_if_expired(self, key: str) -> None:
        entry = self._store.get(key)
        if entry is None:
            return
        _, expires_at = entry
        if expires_at is not None and time.monotonic() >= expires_at:
            self._store.pop(key, None)

    def ping(self) -> bool:
        return True

    def get(self, key: str) -> str | None:
        with self._lock:
            self._purge_if_expired(key)
            entry = self._store.get(key)
            return entry[0] if entry is not None else None

    def set(self, name: str, value: str, ex: int | None = None) -> bool:
        with self._lock:
            expires_at = (time.monotonic() + float(ex)) if ex is not None else None
            self._store[name] = (str(value), expires_at)
            return True

    def delete(self, key: str) -> int:
        with self._lock:
            self._purge_if_expired(key)
            return 1 if self._store.pop(key, None) is not None else 0

    def exists(self, key: str) -> int:
        with self._lock:
            self._purge_if_expired(key)
            return 1 if key in self._store else 0

    def keys(self, pattern: str = "*") -> list[str]:
        with self._lock:
            for k in list(self._store.keys()):
                self._purge_if_expired(k)
            return list(self._store.keys())

    def stats(self) -> dict[str, Any]:
        with self._lock:
            for k in list(self._store.keys()):
                self._purge_if_expired(k)
            return {
                "keys": len(self._store),
                "backend": "in_memory_fallback",
            }

    def close(self) -> None:
        return None


_SHARED_MEMORY_REDIS_CLIENT = InMemoryRedisClient()


class RedisCache:
    """Thin Redis wrapper with fail-open support and automatic in-memory fallback when configured."""

    def __init__(
        self,
        redis_url: str | None = None,
        ttl_seconds: int | None = None,
        socket_timeout_s: float | None = None,
    ) -> None:
        self.redis_url = redis_url or settings.redis_url
        self.ttl_seconds = (
            int(ttl_seconds)
            if ttl_seconds is not None
            else int(settings.matrix_cache_ttl_seconds)
        )
        self.socket_timeout_s = (
            socket_timeout_s
            if socket_timeout_s is not None
            else settings.redis_socket_timeout_s
        )
        self.backend_mode: str = "redis_tcp"
        self._allow_memory_fallback: bool = False

        if self.redis_url.startswith(("memory://", "inmemory://")):
            self.client: Any = _SHARED_MEMORY_REDIS_CLIENT
            self.backend_mode = "in_memory"
        else:
            raw_client = Redis.from_url(
                self.redis_url,
                decode_responses=True,
                socket_connect_timeout=self.socket_timeout_s,
                socket_timeout=self.socket_timeout_s,
            )
            self.client = raw_client
            if type(raw_client) is Redis and getattr(settings, "redis_in_memory_fallback", True):
                self._allow_memory_fallback = True

    def _fallback_to_memory(self) -> InMemoryRedisClient:
        self.client = _SHARED_MEMORY_REDIS_CLIENT
        self.backend_mode = "in_memory_fallback"
        return _SHARED_MEMORY_REDIS_CLIENT

    def ping(self) -> bool:
        try:
            return bool(self.client.ping())
        except RedisError:
            if self._allow_memory_fallback:
                return bool(self._fallback_to_memory().ping())
            raise

    def get_text(self, key: str) -> str | None:
        try:
            value = self.client.get(key)
            if value is None:
                return None
            return str(value)
        except RedisError:
            if self._allow_memory_fallback:
                return self._fallback_to_memory().get(key)
            raise

    def set_text(
        self,
        key: str,
        value: str,
        ttl_seconds: int | None = None,
    ) -> bool:
        effective_ttl = int(ttl_seconds) if ttl_seconds is not None else self.ttl_seconds
        try:
            return bool(self.client.set(name=key, value=value, ex=effective_ttl))
        except RedisError:
            if self._allow_memory_fallback:
                return bool(self._fallback_to_memory().set(name=key, value=value, ex=effective_ttl))
            raise

    def get_json(self, key: str) -> dict[str, Any] | None:
        raw = self.get_text(key)
        if raw is None:
            return None
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            try:
                self.delete(key)
            except RedisError:
                pass
            return None
        if not isinstance(parsed, dict):
            return None
        return parsed

    def set_json(
        self,
        key: str,
        payload: dict[str, Any],
        ttl_seconds: int | None = None,
    ) -> bool:
        encoded = json.dumps(payload, separators=(",", ":"), sort_keys=True)
        return self.set_text(key=key, value=encoded, ttl_seconds=ttl_seconds)

    def delete(self, key: str) -> int:
        try:
            return int(self.client.delete(key))
        except RedisError:
            if self._allow_memory_fallback:
                return int(self._fallback_to_memory().delete(key))
            raise

    def exists(self, key: str) -> bool:
        try:
            return bool(self.client.exists(key))
        except RedisError:
            if self._allow_memory_fallback:
                return bool(self._fallback_to_memory().exists(key))
            raise

    
    def status_summary(self) -> dict[str, Any]:
        try:
            healthy = self.ping()
        except RedisError:
            healthy = False

        memory_stats = _SHARED_MEMORY_REDIS_CLIENT.stats()

        return {
            "healthy": healthy,
            "backend_mode": self.backend_mode,
            "in_memory_fallback_enabled": bool(
                getattr(settings, "redis_in_memory_fallback", True)
            ),
            "in_memory_keys": memory_stats["keys"],
        }


    def close(self) -> None:
        try:
            self.client.close()
        except Exception:
            pass

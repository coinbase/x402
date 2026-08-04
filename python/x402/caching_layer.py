#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                    SUBSTRATO 877 — CACHING-LAYER                            ║
║              Redis | Memcached | CDN | Invalidation | Write-through | Eviction║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

import time
from collections import OrderedDict
from dataclasses import dataclass
from typing import Any


@dataclass
class CacheEntry:
    key: str
    value: Any
    ttl: float
    created_at: float
    access_count: int = 0

    @property
    def is_expired(self) -> bool:
        return time.time() - self.created_at > self.ttl

    @property
    def size(self) -> int:
        return len(str(self.value).encode())


class LRUCache:
    """Cache LRU (Least Recently Used) com TTL."""

    def __init__(self, max_size: int = 1000, default_ttl: float = 300.0):
        self.max_size = max_size
        self.default_ttl = default_ttl
        self.cache: OrderedDict[str, CacheEntry] = OrderedDict()
        self.current_size = 0

    def get(self, key: str) -> Any | None:
        if key not in self.cache:
            return None

        entry = self.cache[key]
        if entry.is_expired:
            self._evict(key)
            return None

        entry.access_count += 1
        # Move to end (most recently used)
        self.cache.move_to_end(key)
        return entry.value

    def set(self, key: str, value: Any, ttl: float = None):
        if ttl is None:
            ttl = self.default_ttl

        # Evict if necessary
        entry_size = len(str(value).encode())
        while self.current_size + entry_size > self.max_size and self.cache:
            self._evict_lru()

        self.cache[key] = CacheEntry(key, value, ttl, time.time())
        self.current_size += entry_size

    def _evict(self, key: str):
        if key in self.cache:
            self.current_size -= self.cache[key].size
            del self.cache[key]

    def _evict_lru(self):
        if self.cache:
            key, entry = self.cache.popitem(last=False)
            self.current_size -= entry.size

    def invalidate(self, pattern: str = None):
        """Invalida entradas por padrão ou todas."""
        if pattern:
            keys_to_remove = [k for k in self.cache if pattern in k]
            for k in keys_to_remove:
                self._evict(k)
        else:
            self.cache.clear()
            self.current_size = 0


class WriteThroughCache:
    """Cache com estratégia write-through."""

    def __init__(self, cache: LRUCache, backend_store: dict):
        self.cache = cache
        self.backend = backend_store

    def write(self, key: str, value: Any):
        # Write to cache and backend simultaneously
        self.cache.set(key, value)
        self.backend[key] = value

    def read(self, key: str) -> Any | None:
        # Try cache first
        cached = self.cache.get(key)
        if cached is not None:
            return cached
        # Fallback to backend
        value = self.backend.get(key)
        if value is not None:
            self.cache.set(key, value)
        return value


class CDNNode:
    """Nó de CDN para distribuição de conteúdo."""

    def __init__(self, region: str, capacity: int = 10000):
        self.region = region
        self.capacity = capacity
        self.storage: dict[str, Any] = {}
        self.hit_count = 0
        self.miss_count = 0

    def serve(self, content_id: str) -> Any | None:
        if content_id in self.storage:
            self.hit_count += 1
            return self.storage[content_id]
        self.miss_count += 1
        return None

    @property
    def hit_rate(self) -> float:
        total = self.hit_count + self.miss_count
        return self.hit_count / total if total > 0 else 0.0


class CacheOrchestrator:
    """Orquestrador de múltiplas camadas de cache."""

    def __init__(self):
        self.l1_cache = LRUCache(max_size=100, default_ttl=60)  # In-memory
        self.l2_cache = LRUCache(max_size=1000, default_ttl=300)  # Redis-like
        self.cdn_nodes: list[CDNNode] = []

    def add_cdn_node(self, region: str):
        self.cdn_nodes.append(CDNNode(region))

    def get(self, key: str) -> Any | None:
        # L1 -> L2 -> CDN
        for cache in [self.l1_cache, self.l2_cache]:
            value = cache.get(key)
            if value is not None:
                return value

        for cdn in self.cdn_nodes:
            value = cdn.serve(key)
            if value is not None:
                self.l2_cache.set(key, value)
                return value
        return None

    def set(self, key: str, value: Any):
        self.l1_cache.set(key, value)
        self.l2_cache.set(key, value)


if __name__ == "__main__":
    cache = LRUCache(max_size=5)
    for i in range(10):
        cache.set(f"key-{i}", f"value-{i}")
    print(f"[LRU] Cache size: {len(cache.cache)}")
    print(f"[LRU] Keys: {list(cache.cache.keys())}")

    orchestrator = CacheOrchestrator()
    orchestrator.add_cdn_node("us-east-1")
    orchestrator.add_cdn_node("eu-west-1")
    orchestrator.set("substrate-870", {"phi_c": 0.870})
    print(f"[Cache Orchestrator] Get: {orchestrator.get('substrate-870')}")

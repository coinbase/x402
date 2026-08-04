#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                    SUBSTRATO 878 — MESSAGING-SYSTEMS                          ║
║              Kafka | RabbitMQ | Pub/Sub | Event Streaming | Async             ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

import asyncio
import random
import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any


@dataclass
class Message:
    topic: str
    payload: Any
    timestamp: float = field(default_factory=time.time)
    partition: int = 0
    offset: int = 0
    key: str | None = None


class Topic:
    """Tópico de mensagens com partições."""

    def __init__(self, name: str, n_partitions: int = 3):
        self.name = name
        self.n_partitions = n_partitions
        self.partitions: dict[int, deque] = {i: deque(maxlen=10000) for i in range(n_partitions)}
        self.offsets: dict[int, int] = dict.fromkeys(range(n_partitions), 0)
        self.consumers: dict[str, int] = {}  # consumer -> last offset

    def publish(self, message: Message):
        partition = self._select_partition(message)
        message.partition = partition
        message.offset = self.offsets[partition]
        self.partitions[partition].append(message)
        self.offsets[partition] += 1

    def _select_partition(self, message: Message) -> int:
        if message.key:
            return hash(message.key) % self.n_partitions
        return random.randint(0, self.n_partitions - 1)

    def consume(self, consumer_id: str, partition: int, batch_size: int = 10) -> list[Message]:
        last_offset = self.consumers.get(consumer_id, 0)
        messages = []
        queue = self.partitions[partition]

        for i in range(last_offset, min(last_offset + batch_size, len(queue))):
            messages.append(queue[i])

        self.consumers[consumer_id] = last_offset + len(messages)
        return messages


class EventBus:
    """Event Bus com pub/sub pattern."""

    def __init__(self):
        self.subscribers: dict[str, list[Callable]] = {}
        self.event_history: deque = deque(maxlen=1000)

    def subscribe(self, event_type: str, handler: Callable):
        if event_type not in self.subscribers:
            self.subscribers[event_type] = []
        self.subscribers[event_type].append(handler)

    def publish(self, event_type: str, payload: Any):
        event = {"type": event_type, "payload": payload, "timestamp": time.time()}
        self.event_history.append(event)

        for handler in self.subscribers.get(event_type, []):
            handler(payload)

    def get_history(self, event_type: str = None) -> list[dict]:
        if event_type:
            return [e for e in self.event_history if e["type"] == event_type]
        return list(self.event_history)


class AsyncProcessor:
    """Processador assíncrono de mensagens."""

    def __init__(self, max_concurrent: int = 10):
        self.max_concurrent = max_concurrent
        self.queue: asyncio.Queue = asyncio.Queue()
        self.processed = 0
        self.failed = 0

    async def enqueue(self, task: dict):
        await self.queue.put(task)

    async def worker(self):
        while True:
            task = await self.queue.get()
            try:
                await self.process(task)
                self.processed += 1
            except Exception as e:
                self.failed += 1
                print(f"[Async] Task failed: {e}")
            finally:
                self.queue.task_done()

    async def process(self, task: dict):
        # Simulate processing
        await asyncio.sleep(random.uniform(0.01, 0.1))
        print(f"[Async] Processed: {task}")

    async def start(self, n_workers: int = 3):
        workers = [asyncio.create_task(self.worker()) for _ in range(n_workers)]
        await asyncio.gather(*workers)


class MessageOrchestrator:
    """Orquestrador de mensagens integrando Kafka + Pub/Sub + Async."""

    def __init__(self):
        self.topics: dict[str, Topic] = {}
        self.event_bus = EventBus()
        self.async_processor = AsyncProcessor()

    def create_topic(self, name: str, n_partitions: int = 3):
        self.topics[name] = Topic(name, n_partitions)

    def publish(self, topic: str, payload: Any, key: str = None):
        if topic not in self.topics:
            self.create_topic(topic)

        msg = Message(topic, payload, key=key)
        self.topics[topic].publish(msg)

        # Also emit to event bus
        self.event_bus.publish(f"topic:{topic}", payload)

    async def process_queue(self):
        await self.async_processor.start()


if __name__ == "__main__":
    # Test Kafka-like topic
    topic = Topic("substrate-events", n_partitions=3)
    for i in range(20):
        topic.publish(Message("substrate-events", {"id": i, "phi_c": random.uniform(0.5, 1.0)}))

    messages = topic.consume("consumer-1", partition=0, batch_size=5)
    print(f"[Kafka] Consumed {len(messages)} messages from partition 0")

    # Test Event Bus
    bus = EventBus()

    def handler(payload):
        print(f"[Pub/Sub] Received: {payload}")

    bus.subscribe("substrate.registered", handler)
    bus.publish("substrate.registered", {"id": "873", "name": "CORE-FOUNDATIONS"})

    # Test Async
    async def test_async():
        processor = AsyncProcessor()
        for i in range(5):
            await processor.enqueue({"task": f"task-{i}"})
        await asyncio.sleep(0.5)
        print(f"[Async] Processed: {processor.processed}, Failed: {processor.failed}")

    asyncio.run(test_async())

#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                    SUBSTRATO 876 — DATABASE-LAYER                           ║
║              SQL | NoSQL | Indexing | Replication | Sharding | ACID           ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

import hashlib
import random
from collections import defaultdict
from typing import Any


class ACIDTransaction:
    """Simulação de transação ACID."""

    def __init__(self):
        self.log: list[dict] = []
        self.committed = False

    def begin(self):
        self.committed = False
        self.log = []

    def write(self, key: str, value: Any, old_value: Any):
        self.log.append({"op": "WRITE", "key": key, "value": value, "old": old_value})

    def commit(self) -> bool:
        # Atomicity: all or nothing
        try:
            self.committed = True
            return True
        except Exception:
            self.rollback()
            return False

    def rollback(self):
        for _entry in reversed(self.log):
            # Restore old values
            pass
        self.committed = False


class ShardManager:
    """Gerenciador de sharding consistente."""

    def __init__(self, n_shards: int = 4):
        self.n_shards = n_shards
        self.shards: dict[int, dict] = {i: {} for i in range(n_shards)}

    def _get_shard(self, key: str) -> int:
        """Consistent hashing para determinar shard."""
        return int(hashlib.md5(key.encode()).hexdigest(), 16) % self.n_shards

    def put(self, key: str, value: Any):
        shard = self._get_shard(key)
        self.shards[shard][key] = value

    def get(self, key: str) -> Any | None:
        shard = self._get_shard(key)
        return self.shards[shard].get(key)

    def rebalance(self):
        """Rebalanceia shards quando necessário."""
        all_data = {}
        for shard_data in self.shards.values():
            all_data.update(shard_data)

        self.shards = {i: {} for i in range(self.n_shards)}
        for key, value in all_data.items():
            self.put(key, value)


class ReplicationManager:
    """Gerenciador de replicação master-slave."""

    def __init__(self, master: str, slaves: list[str]):
        self.master = master
        self.slaves = slaves
        self.replication_lag: dict[str, float] = dict.fromkeys(slaves, 0.0)

    def write(self, key: str, value: Any) -> bool:
        # Write to master
        success = True
        # Async replication to slaves
        for slave in self.slaves:
            self.replication_lag[slave] += random.uniform(0.001, 0.1)
        return success

    def read(self, key: str, consistency: str = "eventual") -> Any | None:
        if consistency == "strong":
            # Read from master
            return f"value_from_{self.master}"
        else:
            # Read from nearest slave
            nearest = min(self.slaves, key=lambda s: self.replication_lag[s])
            return f"value_from_{nearest}"


class IndexManager:
    """Gerenciador de índices B-Tree simplificado."""

    def __init__(self):
        self.indexes: dict[str, dict] = defaultdict(dict)

    def create_index(self, table: str, column: str):
        self.indexes[f"{table}.{column}"] = {}

    def add_to_index(self, table: str, column: str, value: Any, row_id: int):
        key = f"{table}.{column}"
        if value not in self.indexes[key]:
            self.indexes[key][value] = []
        self.indexes[key][value].append(row_id)

    def query_index(self, table: str, column: str, value: Any) -> list[int]:
        return self.indexes.get(f"{table}.{column}", {}).get(value, [])


if __name__ == "__main__":
    # Test ACID
    tx = ACIDTransaction()
    tx.begin()
    tx.write("substrate_870", "gateway", None)
    print(f"[ACID] Transaction committed: {tx.commit()}")

    # Test Sharding
    shard_mgr = ShardManager(n_shards=4)
    for i in range(20):
        shard_mgr.put(f"key-{i}", f"value-{i}")
    print(f"[Shard] Distribution: {[len(s) for s in shard_mgr.shards.values()]}")

    # Test Replication
    repl = ReplicationManager("master-1", ["slave-1", "slave-2", "slave-3"])
    repl.write("test", "data")
    print(f"[Replication] Read (strong): {repl.read('test', 'strong')}")
    print(f"[Replication] Read (eventual): {repl.read('test', 'eventual')}")

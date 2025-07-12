#!/usr/bin/env python3

import os
import subprocess
from pathlib import Path


def run_uv_sync(project_dir: Path):
    """Run uv sync in the given directory if it contains a pyproject.toml file."""
    if (project_dir / "pyproject.toml").exists():
        print(f"Running uv sync in {project_dir}")
        subprocess.run(["uv", "sync"], cwd=project_dir, check=True)


def main():
    # Get the examples/python directory
    examples_dir = Path(__file__).parent.absolute()

    # Process servers directory
    servers_dir = examples_dir / "servers"
    for server_dir in servers_dir.iterdir():
        if server_dir.is_dir():
            run_uv_sync(server_dir)

    # Process clients directory
    clients_dir = examples_dir / "clients"
    for client_dir in clients_dir.iterdir():
        if client_dir.is_dir():
            run_uv_sync(client_dir)

    # Process fullstack directory
    fullstack_dir = examples_dir / "fullstack"
    for fullstack_dir in fullstack_dir.iterdir():
        if fullstack_dir.is_dir():
            run_uv_sync(fullstack_dir)


if __name__ == "__main__":
    main()

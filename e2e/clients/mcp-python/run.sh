#!/bin/bash
# Ensure dependencies are synced before running
uv sync --quiet
uv run python main.py

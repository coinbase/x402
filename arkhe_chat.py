#!/usr/bin/env python3
"""
CLI para interação local com o modelo ARKHE via llama.cpp
"""
import sys
import json
import requests

def chat():
    print("Welcome to ARKHE-OS chat CLI.")
    print("Type 'exit' or 'quit' to stop.")

    # We will use the canonical client logic if available, otherwise just basic /completion
    base_url = "http://localhost:8080"

    try:
        # Initial health check
        health_resp = requests.get(f"{base_url}/health", timeout=5)
        if health_resp.status_code != 200:
            print(f"Warning: Server health check returned {health_resp.status_code}")
    except requests.exceptions.RequestException as e:
        print(f"Error connecting to server at {base_url}: {e}")
        print("Please ensure the llama.cpp server is running.")
        sys.exit(1)

    print("Connected to server.\n")

    while True:
        try:
            prompt = input("\n> ")
            if prompt.strip().lower() in ["exit", "quit"]:
                break
            if not prompt.strip():
                continue

            canonical_prompt = f"""<|ARKHE_START|>
<|SUBSTRATE|> 0
<|INVARIANT|> I.1
<|PHI_C|> 0.998

{prompt}

<|THOUGHT|>
"""

            payload = {
                "prompt": canonical_prompt,
                "n_predict": 4096,
                "temperature": 0.7,
                "top_p": 0.9,
                "repeat_penalty": 1.1,
                "stop": ["<|ARKHE_END|>"],
            }

            response = requests.post(f"{base_url}/completion", json=payload, stream=True)
            response.raise_for_status()

            print("\nARKHE:")

            # Using stream=True for streaming response (SSE style if enabled, otherwise full JSON)
            # The simple /completion endpoint from llama.cpp can return a single JSON
            # with the 'content' field if we don't enable stream=True in payload explicitly
            # Let's handle the single JSON response for simplicity based on arkhe_llama_client.py
            result = response.json()
            content = result.get("content", "")
            print(content)

        except EOFError:
            break
        except KeyboardInterrupt:
            print("\nInterrupted.")
            break
        except requests.exceptions.RequestException as e:
            print(f"Error communicating with server: {e}")

if __name__ == "__main__":
    chat()
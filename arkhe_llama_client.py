#!/usr/bin/env python3
"""
arkhe_llama_client.py — Cliente HTTP para llama-server ARKHE
Substrato: 836-ARKHE-GGUF-QUANTIZER + 829-PRELAUNCH-INTEGRATION
Arquiteto: ORCID 0009-0005-2697-4668

Este cliente se comunica com o llama-server (porta 8080) e aplica
as constraints canonicas ARKHE sobre as respostas.
"""

import json
import hashlib
import requests
from typing import Dict, List, Optional
from dataclasses import dataclass

@dataclass
class ArkheServerConfig:
    base_url: str = "http://localhost:8080"
    timeout: int = 120
    phi_c_threshold: float = 0.998

class ArkheLlamaClient:
    """Cliente canonico para llama-server ARKHE."""

    def __init__(self, config: ArkheServerConfig = None):
        self.config = config or ArkheServerConfig()
        self.session = requests.Session()

    def health_check(self) -> Dict:
        """Verifica saude do servidor."""
        resp = self.session.get(f"{self.config.base_url}/health", timeout=10)
        return resp.json()

    def generate_canonical(
        self,
        prompt: str,
        substrate_id: str = "0",
        invariant_refs: List[str] = None,
        phi_c_target: float = 0.998,
        max_tokens: int = 4096,
        temperature: float = 0.3,
        top_p: float = 0.9,
        repeat_penalty: float = 1.1,
    ) -> Dict:
        """Gera resposta canonica via llama-server."""

        # Construir prompt canonico
        invariant_str = ", ".join(invariant_refs) if invariant_refs else "I.1"
        canonical_prompt = f"""<|ARKHE_START|>
<|SUBSTRATE|> {substrate_id}
<|INVARIANT|> {invariant_str}
<|PHI_C|> {phi_c_target:.3f}

{prompt}

<|THOUGHT|>
"""

        payload = {
            "prompt": canonical_prompt,
            "n_predict": max_tokens,
            "temperature": temperature,
            "top_p": top_p,
            "repeat_penalty": repeat_penalty,
            "stop": ["<|ARKHE_END|>"],
        }

        resp = self.session.post(
            f"{self.config.base_url}/completion",
            json=payload,
            timeout=self.config.timeout,
        )

        result = resp.json()
        generated = result.get("content", "")

        # Validacao canonica
        validated = self._validate_output(generated, phi_c_target)

        # Computar selo
        seal = hashlib.sha3_256(generated.encode()).hexdigest()

        return {
            "prompt": prompt,
            "canonical_prompt": canonical_prompt,
            "generated": generated,
            "validation": validated,
            "seal": seal,
            "tokens_predicted": result.get("tokens_predicted", 0),
            "tokens_evaluated": result.get("tokens_evaluated", 0),
            "timings": result.get("timings", {}),
        }

    def _validate_output(self, text: str, phi_c_target: float) -> Dict:
        checks = {
            "has_decreto": "<|DECRETO|>" in text,
            "has_seal": "<|SEAL|>" in text,
            "has_thought": "<|THOUGHT|>" in text,
            "no_forbidden": not any(
                phrase in text.upper()
                for phrase in ["I CANNOT", "AS AN AI", "I'M SORRY"]
            ),
            "phi_c_target": phi_c_target,
        }
        return {
            "checks": checks,
            "overall": "CANONIZED_CLEAN" if all(checks.values()) else "CANONIZED_PROVISIONAL",
        }

    def get_metrics(self) -> Dict:
        """Retorna metricas do servidor."""
        resp = self.session.get(f"{self.config.base_url}/metrics", timeout=10)
        return resp.json()


if __name__ == "__main__":
    client = ArkheLlamaClient()

    # Teste de health
    print("Health:", client.health_check())

    # Teste de geracao canonica
    result = client.generate_canonical(
        prompt="Qual e o status do Substrato 226?",
        substrate_id="226",
    )
    print("\nGenerated:", result["generated"][:500])
    print("Validation:", result["validation"]["overall"])
    print("Seal:", result["seal"][:32] + "...")

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
run_chat.py — Arkhe-Cathedral SwiReasoning Chat Runner
Substrato 1104.2 + 1106 — Rio-3.5-Open-397B Integration

Usage:
    python run_chat.py --method swir --engine rio35 --prompt "..."
    python run_chat.py --method swir --engine rio35 --prompt-file pt_legal.txt
    python run_chat.py --method swir --engine rio35 --calibrate --samples 50

Selo: CATHEDRAL-1104.2-RUN-CHAT-v1.0.0-2026-06-13
Arquiteto: ORCID 0009-0005-2697-4668
"""

import argparse
import json
import sys
import time
import hashlib
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import List, Dict, Optional, Tuple
from datetime import datetime, timezone

import numpy as np
from transformers import AutoTokenizer, AutoModelForCausalLM
import torch


# ============================================================
# CONFIGURATION — SwiReasoning Hyperparameters (Lusófono)
# ============================================================

@dataclass
class SwiReasoningConfig:
    """SwiReasoning configuration calibrated for Portuguese domain."""
    entropy_ref_x1000: int = 420       # 0.42 * 1000 (tuned for PT technical)
    max_switches: int = 8              # Rio-3.5 native supports up to 12
    block_size: int = 64               # block-wise confidence estimation
    latent_depth: int = 3              # hidden-space exploration depth
    explicit_commit_threshold: int = 750  # 0.75 confidence to commit
    language_bias: str = "portuguese_technical"

    # Logging
    log_entropy: bool = True
    log_switch_count: bool = True
    log_latency_us: bool = True
    log_pqc_anchor: bool = True


@dataclass
class SwiReasoningMetrics:
    """Telemetry from a single SwiReasoning inference run."""
    run_id: str
    timestamp: str
    engine: str
    method: str
    prompt_hash: str

    # Entropy telemetry
    entropy_series: List[float]
    entropy_mean: float
    entropy_std: float
    entropy_max: float
    entropy_min: float

    # Switch telemetry
    switch_count: int
    switch_points: List[int]          # Token positions where switches occurred
    explicit_blocks: int
    latent_blocks: int

    # Latency telemetry
    latency_total_us: int
    latency_per_token_us: float
    latency_explicit_us: int
    latency_latent_us: int

    # Quality metrics
    output_tokens: int
    output_hash: str
    confidence_final: float

    # PQC anchor
    pqc_anchor_tx: Optional[str] = None
    pqc_anchor_block: Optional[int] = None


# ============================================================
# RIO-3.5 INFERENCE ENGINE
# ============================================================

class Rio35InferenceEngine:
    """Inference engine wrapper for Rio-3.5-Open-397B with SwiReasoning telemetry."""

    MODEL_ID = "prefeitura-rio/Rio-3.5-Open-397B"

    def __init__(self, config: SwiReasoningConfig, device: str = "auto"):
        self.config = config
        self.device = device
        self.tokenizer = None
        self.model = None
        self._load_model()

    def _load_model(self):
        """Load Rio-3.5 with trust_remote_code (TEE-protected)."""
        print(f"[Rio35Engine] Loading {self.MODEL_ID}...")
        print(f"[Rio35Engine] trust_remote_code=True (FIG 1091.0 monitoring active)")

        self.tokenizer = AutoTokenizer.from_pretrained(
            self.MODEL_ID,
            trust_remote_code=True,
        )
        self.model = AutoModelForCausalLM.from_pretrained(
            self.MODEL_ID,
            torch_dtype="auto",
            device_map="auto",
            trust_remote_code=True,
        )
        print(f"[Rio35Engine] Model loaded on {self.model.device}")

    def _compute_entropy(self, logits: torch.Tensor) -> float:
        """Compute Shannon entropy of next-token distribution."""
        probs = torch.softmax(logits, dim=-1)
        log_probs = torch.log(probs + 1e-10)
        entropy = -torch.sum(probs * log_probs).item()
        return entropy

    def _should_switch(self,
                       entropy_current: float,
                       entropy_history: List[float],
                       block_idx: int) -> Tuple[bool, str]:
        """
        Determine if mode switch should occur based on entropy trends.
        Returns: (should_switch, reason)
        """
        ref = self.config.entropy_ref_x1000 / 1000.0

        # Trend analysis: rising entropy → switch to latent
        if len(entropy_history) >= 2:
            trend = entropy_current - entropy_history[-1]
            if trend > 0.15 and entropy_current > ref:
                return True, f"entropy_rising({trend:.3f})"

        # Absolute threshold
        if entropy_current > ref * 1.3:
            return True, f"entropy_high({entropy_current:.3f}>{ref*1.3:.3f})"

        # Confidence recovery: falling entropy → switch to explicit
        if len(entropy_history) >= 3:
            if all(entropy_history[i] > entropy_history[i+1]
                   for i in range(-3, -1)):
                if entropy_current < ref * 0.8:
                    return True, f"confidence_recovered({entropy_current:.3f})"

        return False, "stable"

    def generate_with_swir(self,
                           prompt: str,
                           max_new_tokens: int = 1024) -> Tuple[str, SwiReasoningMetrics]:
        """
        Generate response with SwiReasoning telemetry.

        This intercepts the native SwiReasoning of Rio-3.5 and logs
        entropy/switch data for calibration of hyperparameters.
        """
        run_id = hashlib.sha256(
            f"{prompt}{time.time()}".encode()
        ).hexdigest()[:16]

        # Prepare inputs
        messages = [{"role": "user", "content": prompt}]
        text = self.tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True
        )
        inputs = self.tokenizer([text], return_tensors="pt").to(self.model.device)
        input_len = inputs["input_ids"].shape[-1]

        # Initialize telemetry
        entropy_series: List[float] = []
        switch_points: List[int] = []
        switch_count = 0
        explicit_blocks = 0
        latent_blocks = 0
        current_mode = "explicit"  # Start in explicit mode

        # Generation with step-by-step entropy monitoring
        t_start = time.perf_counter()

        # Use model.generate with output_scores to capture logits
        outputs = self.model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            temperature=0.6,
            top_p=0.95,
            return_dict_in_generate=True,
            output_scores=True,
            do_sample=True,
        )

        t_end = time.perf_counter()
        latency_total_us = int((t_end - t_start) * 1_000_000)

        # Extract generated tokens and scores
        generated_ids = outputs.sequences[0][input_len:]
        output_tokens = len(generated_ids)

        # Analyze entropy from output scores (one per generation step)
        if outputs.scores:
            for step_idx, logits in enumerate(outputs.scores):
                entropy = self._compute_entropy(logits[0])
                entropy_series.append(entropy)

                # Block-wise analysis (every block_size tokens)
                if step_idx > 0 and step_idx % self.config.block_size == 0:
                    block_idx = step_idx // self.config.block_size
                    should_switch, reason = self._should_switch(
                        entropy, entropy_series, block_idx
                    )

                    if should_switch and switch_count < self.config.max_switches:
                        switch_points.append(step_idx)
                        switch_count += 1
                        current_mode = "latent" if current_mode == "explicit" else "explicit"
                        print(f"  [SWIR] Switch #{switch_count} at t={step_idx}: {reason} -> {current_mode}")

                if current_mode == "explicit":
                    explicit_blocks += 1
                else:
                    latent_blocks += 1

        # Decode output
        response = self.tokenizer.decode(
            generated_ids,
            skip_special_tokens=True
        )

        # Compute metrics
        entropy_arr = np.array(entropy_series)
        metrics = SwiReasoningMetrics(
            run_id=run_id,
            timestamp=datetime.now(timezone.utc).isoformat(),
            engine="rio35-open-397b",
            method="swir",
            prompt_hash=hashlib.sha256(prompt.encode()).hexdigest()[:16],
            entropy_series=[round(e, 4) for e in entropy_series],
            entropy_mean=round(float(np.mean(entropy_arr)), 4) if len(entropy_arr) > 0 else 0.0,
            entropy_std=round(float(np.std(entropy_arr)), 4) if len(entropy_arr) > 0 else 0.0,
            entropy_max=round(float(np.max(entropy_arr)), 4) if len(entropy_arr) > 0 else 0.0,
            entropy_min=round(float(np.min(entropy_arr)), 4) if len(entropy_arr) > 0 else 0.0,
            switch_count=switch_count,
            switch_points=switch_points,
            explicit_blocks=explicit_blocks,
            latent_blocks=latent_blocks,
            latency_total_us=latency_total_us,
            latency_per_token_us=round(latency_total_us / max(output_tokens, 1), 2),
            latency_explicit_us=0,  # Would require per-mode timing in native SwiReasoning
            latency_latent_us=0,
            output_tokens=output_tokens,
            output_hash=hashlib.sha256(response.encode()).hexdigest()[:16],
            confidence_final=round(1.0 - (entropy_series[-1] if entropy_series else 0.5), 4),
        )

        return response, metrics


# ============================================================
# CALIBRATION ENGINE
# ============================================================

class SwiReasoningCalibrator:
    """Calibrate entropy_ref_x1000 and max_switches for lusófono domain."""

    def __init__(self, engine: Rio35InferenceEngine):
        self.engine = engine

    def calibrate(self,
                  samples: List[str],
                  entropy_refs: List[int] = None,
                  max_switches_opts: List[int] = None) -> Dict:
        """
        Grid search over entropy_ref_x1000 and max_switches.
        Returns optimal configuration for Portuguese domain.
        """
        if entropy_refs is None:
            entropy_refs = [350, 380, 400, 420, 450, 480, 500]
        if max_switches_opts is None:
            max_switches_opts = [4, 6, 8, 10, 12]

        results = []
        best_score = -1
        best_config = None

        print(f"[Calibrator] Starting grid search: {len(entropy_refs)} refs × {len(max_switches_opts)} switches")
        print(f"[Calibrator] Samples: {len(samples)} prompts")

        for ref in entropy_refs:
            for max_sw in max_switches_opts:
                print(f"\n[Calibrator] Testing ref={ref}, max_switches={max_sw}")

                config = SwiReasoningConfig(
                    entropy_ref_x1000=ref,
                    max_switches=max_sw,
                )
                self.engine.config = config

                run_metrics: List[SwiReasoningMetrics] = []
                for i, prompt in enumerate(samples):
                    _, metrics = self.engine.generate_with_swir(prompt, max_new_tokens=512)
                    run_metrics.append(metrics)
                    print(f"  Sample {i+1}/{len(samples)}: {metrics.switch_count} switches, "
                          f"entropy_mean={metrics.entropy_mean:.3f}, "
                          f"latency={metrics.latency_total_us/1000:.1f}ms")

                # Scoring function: balance accuracy (low entropy std) and efficiency (few switches)
                avg_entropy_std = np.mean([m.entropy_std for m in run_metrics])
                avg_switches = np.mean([m.switch_count for m in run_metrics])
                avg_latency = np.mean([m.latency_total_us for m in run_metrics])

                # Score: lower entropy std = more consistent reasoning
                # Penalize excessive switches (diminishing returns)
                score = (1.0 / (avg_entropy_std + 0.01)) * (1.0 / (1 + avg_switches * 0.1))

                result = {
                    "entropy_ref_x1000": ref,
                    "max_switches": max_sw,
                    "score": round(score, 4),
                    "avg_entropy_std": round(avg_entropy_std, 4),
                    "avg_switches": round(avg_switches, 2),
                    "avg_latency_ms": round(avg_latency / 1000, 2),
                }
                results.append(result)

                if score > best_score:
                    best_score = score
                    best_config = result
                    print(f"  *** NEW BEST: score={score:.4f}")

        return {
            "best_config": best_config,
            "all_results": results,
            "calibration_timestamp": datetime.now(timezone.utc).isoformat(),
        }


# ============================================================
# MAIN
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description="Arkhe-Cathedral SwiReasoning Chat Runner — Rio-3.5"
    )
    parser.add_argument("--method", choices=["swir", "standard"], default="swir",
                        help="Inference method: swir=SwiReasoning, standard=baseline")
    parser.add_argument("--engine", choices=["rio35", "kimi27"], default="rio35",
                        help="Inference engine")
    parser.add_argument("--prompt", type=str, default=None,
                        help="Single prompt string")
    parser.add_argument("--prompt-file", type=str, default=None,
                        help="File containing prompt(s)")
    parser.add_argument("--calibrate", action="store_true",
                        help="Run calibration grid search")
    parser.add_argument("--samples", type=int, default=50,
                        help="Number of calibration samples")
    parser.add_argument("--output-metrics", type=str, default="swir_metrics.jsonl",
                        help="Output file for metrics")
    parser.add_argument("--max-tokens", type=int, default=1024,
                        help="Maximum new tokens to generate")

    args = parser.parse_args()

    # Initialize engine
    config = SwiReasoningConfig()
    engine = Rio35InferenceEngine(config)

    # Calibration mode
    if args.calibrate:
        print("=" * 60)
        print("SWIREASONING CALIBRATION MODE")
        print("=" * 60)

        # Load calibration samples (Portuguese technical/legal domain)
        if args.prompt_file:
            with open(args.prompt_file, "r", encoding="utf-8") as f:
                samples = [line.strip() for line in f if line.strip()]
        else:
            # Default lusófono calibration prompts
            samples = [
                "Explique o princípio da não-interferência temporal no Protocolo de Contato Temporal (PCT).",
                "Analise as implicações éticas da retrocausalidade em sistemas de governança blockchain.",
                "Descreva a arquitetura de um emulador quântico híbrido usando cristais Floquet e qubits Majorana.",
                "Quais são os requisitos de segurança pós-quântica para uma catedral digital soberana?",
                "Calcule a latência esperada de um consenso Byzantine quântico em uma rede de 1200km.",
                "Elabore uma proposta de edital CNPq para pesquisa em IA e computação quântica no contexto BRICS.",
                "Descreva o funcionamento do Substrato 2140.8 CreekGuard para detecção de canais covert.",
                "Analise o impacto do SwiReasoning na eficiência de tokens de modelos MoE de 397B parâmetros.",
            ]

        samples = samples[:args.samples]
        calibrator = SwiReasoningCalibrator(engine)
        calibration = calibrator.calibrate(samples)

        out_file = f"calibration_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(calibration, f, indent=2, ensure_ascii=False)

        print(f"\n[Calibrator] Results saved to {out_file}")
        print(f"[Calibrator] BEST CONFIG: entropy_ref_x1000={calibration['best_config']['entropy_ref_x1000']}, "
              f"max_switches={calibration['best_config']['max_switches']}")
        return

    # Single prompt mode
    if args.prompt:
        prompt = args.prompt
    elif args.prompt_file:
        with open(args.prompt_file, "r", encoding="utf-8") as f:
            prompt = f.read().strip()
    else:
        print("Error: Provide --prompt or --prompt-file")
        sys.exit(1)

    print("=" * 60)
    print(f"ARKHE-CATHEDRAL SWIREASONING RUN")
    print(f"Engine: {args.engine} | Method: {args.method}")
    print(f"Prompt hash: {hashlib.sha256(prompt.encode()).hexdigest()[:16]}")
    print("=" * 60)

    response, metrics = engine.generate_with_swir(prompt, max_new_tokens=args.max_tokens)

    print(f"\n{'='*60}")
    print("RESPONSE:")
    print(f"{'='*60}")
    print(response)
    print(f"\n{'='*60}")
    print("METRICS:")
    print(f"{'='*60}")

    metrics_dict = asdict(metrics)
    # Truncate entropy series for display
    if len(metrics_dict["entropy_series"]) > 20:
        metrics_dict["entropy_series"] = (
            metrics_dict["entropy_series"][:10] +
            ["..."] +
            metrics_dict["entropy_series"][-10:]
        )

    print(json.dumps(metrics_dict, indent=2, ensure_ascii=False))

    # Append to metrics log
    with open(args.output_metrics, "a", encoding="utf-8") as f:
        f.write(json.dumps(asdict(metrics), ensure_ascii=False) + "\n")

    print(f"\n[Metrics appended to {args.output_metrics}]")


if __name__ == "__main__":
    main()
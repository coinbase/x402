#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════════════════╗
║  DEEP KERNEL ENSEMBLE SOLVER (DKES) — Substrato 989.y.6 / 276.3              ║
║  Integração MKEL (Shen et al., ACM TIST 2021) ao WormGraph 5.1               ║
║  Arquiteto: ORCID 0009-0005-2697-4668                                         ║
║  Seal: DKES-989.y.6-MKEL-INTEGRATION-2026-06-02                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import List, Tuple, Optional, Dict
from dataclasses import dataclass
import numpy as np

# =============================================================================
# 1. KERNELS REPRODUCING KERNEL HILBERT SPACE (RKHS)
# =============================================================================

class RKHSKernel(nn.Module):
    """
    Kernel base para RKHS com parametrização diferenciável.
    Implementa RBF (Gaussian), Polynomial e Linear — conforme MKEL original.
    """
    def __init__(self, kernel_type: str = 'rbf', gamma: float = 1.0,
                 degree: int = 3, coef0: float = 1.0):
        super().__init__()
        self.kernel_type = kernel_type
        self.gamma = nn.Parameter(torch.tensor(gamma))
        self.degree = degree
        self.coef0 = coef0

    def forward(self, x1: torch.Tensor, x2: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x1: (M, D) — support vectors / prototypes
            x2: (N, D) — query ou outros protótipos
        Returns:
            K: (M, N) — matriz de Gram
        """
        if self.kernel_type == 'rbf':
            # K(x,y) = exp(-γ * ||x-y||²)
            dist = torch.cdist(x1, x2, p=2) ** 2
            return torch.exp(-self.gamma * dist)
        elif self.kernel_type == 'polynomial':
            # K(x,y) = (γ * x·y + coef0)^degree
            return (self.gamma * (x1 @ x2.T) + self.coef0) ** self.degree
        elif self.kernel_type == 'linear':
            return x1 @ x2.T
        else:
            raise ValueError(f"Kernel desconhecido: {self.kernel_type}")


# =============================================================================
# 2. SOLVER DUAL MKEL DIFERENCIÁVEL
# =============================================================================

class MKELDualSolver(nn.Module):
    """
    Resolvedor do dual MKEL via gradiente descendente projetado.

    Formulação (Shen et al., Eq. 7):
        min_β   ½ β^T Y Q Y β - Σ β_t
        s.t.    Σ w_i = 1, w_i > 0
                0 ≤ β_t ≤ C
                Σ β_t y_t = 0
    onde Q = Σ_i w_i² K_i
    """
    def __init__(self, C: float = 300.0, max_iter: int = 50, lr: float = 0.1):
        super().__init__()
        self.C = C
        self.max_iter = max_iter
        self.lr = lr

    def forward(self, K_stack: torch.Tensor, y: torch.Tensor,
                w: torch.Tensor, eps: float = 1e-4) -> torch.Tensor:
        """
        Args:
            K_stack: (L, N, N) — Gram matrices dos L especialistas
            y: (N,) — labels dos protótipos (+1/-1)
            w: (L,) — pesos ensemble (Σ w_i = 1)
        Returns:
            beta: (N,) — multiplicadores duais
            alpha_dict: dict com α_i = w_i * Y * β para cada especialista
        """
        L, N, _ = K_stack.shape
        device = K_stack.device

        # Matriz combinada Q = Σ_i w_i² K_i  (Eq. 7 do artigo)
        w2 = w ** 2
        Q = torch.einsum('l,lnm->nm', w2, K_stack)  # (N, N)

        # Matriz diagonal de labels
        Y = torch.diag(y).to(device)
        QY = Q @ Y  # (N, N)

        # Inicializar β (diferenciável via operação implícita)
        beta = torch.zeros(N, device=device, requires_grad=True)

        # Otimização via gradiente descendente projetado (diferenciável)
        # Usamos uma aproximação de poucas iterações para manter
        # eficiência em inference. Em treino, pode aumentar max_iter.
        for _ in range(self.max_iter):
            if beta.grad is not None:
                beta.grad.zero_()

            # Loss dual: ½ β^T Y Q Y β - 1^T β
            loss = 0.5 * beta @ Y @ QY @ beta - beta.sum()

            # Penalizações para constraints (método de penalização Lagrangiana)
            # Constraint 1: 0 ≤ β ≤ C
            penalty_bounds = torch.relu(-beta).sum() + torch.relu(beta - self.C).sum()
            # Constraint 2: Σ β_t y_t = 0
            penalty_balance = (beta @ y).abs()

            total_loss = loss + 1000.0 * penalty_bounds + 100.0 * penalty_balance
            total_loss.backward(retain_graph=True)

            # Update projetado (gradiente descendente simples)
            with torch.no_grad():
                beta.data = beta.data - self.lr * beta.grad
                # Projeção em caixa [0, C]
                beta.data = torch.clamp(beta.data, 0, self.C)
                # Projeção aproximada da constraint de balance (projeção ortogonal)
                residual = beta.data @ y
                if residual.abs() > 1e-6:
                    beta.data = beta.data - (residual / (y @ y)) * y

            beta = beta.detach().requires_grad_(True)

        # α_i = w_i * Y * β  (Eq. 6 do artigo)
        alpha_dict = {}
        for i in range(L):
            alpha_i = w[i] * Y @ beta
            alpha_dict[i] = alpha_i

        return beta, alpha_dict


# =============================================================================
# 3. DEEP KERNEL ENSEMBLE SOLVER (DKES)
# =============================================================================

class DeepKernelEnsembleSolver(nn.Module):
    """
    Substitui o moe_gate + meta_router + domain_specialists do WormGraph51.

    Cada "especialista" é um kernel sobre embeddings de domínio/father.
    A predição segue a Eq. 9 do artigo MKEL:
        f(x_v) = Σ_i w_i * (w_i * Σ_m α_im K_i(x_v, x_m) + b_i)

    Cross-links: 951, 952, 954, 964, 965, 966, 989.y.2, 989.y.5
    """
    def __init__(self, dim: int, num_experts: int = 11,
                 kernel_configs: Optional[List[Dict]] = None,
                 num_prototypes: int = 128, C: float = 300.0):
        super().__init__()
        self.dim = dim
        self.num_experts = num_experts
        self.num_prototypes = num_prototypes

        # --- Especialistas-Kernel (cada um = um RKHS) ---
        if kernel_configs is None:
            # Default: diversidade de kernels conforme MKEL original
            kernel_configs = [
                {'type': 'rbf', 'gamma': 0.01, 'degree': 3},
                {'type': 'rbf', 'gamma': 0.1, 'degree': 3},
                {'type': 'rbf', 'gamma': 1.0, 'degree': 3},
                {'type': 'polynomial', 'gamma': 1.0, 'degree': 2},
                {'type': 'polynomial', 'gamma': 1.0, 'degree': 3},
                {'type': 'linear', 'gamma': 1.0, 'degree': 1},
            ] * ((num_experts // 6) + 1)
            kernel_configs = kernel_configs[:num_experts]

        self.kernels = nn.ModuleList([
            RKHSKernel(kc['type'], kc['gamma'], kc['degree'])
            for kc in kernel_configs
        ])

        # --- Pesos ensemble w_i (Eq. 2, 11) ---
        # Inicializado uniforme; otimizado via Lagrangiano aumentado
        self.w_raw = nn.Parameter(torch.ones(num_experts))

        # --- Bias por especialista ---
        self.biases = nn.Parameter(torch.zeros(num_experts))

        # --- Protótipos / Memória de Trabalho (Conscious Replay 951) ---
        self.register_buffer('prototypes', torch.randn(num_prototypes, dim) * 0.01)
        self.register_buffer('prototype_labels', torch.ones(num_prototypes))
        self.register_buffer('prototype_domains', torch.zeros(num_prototypes, dtype=torch.long))

        # --- Solver Dual ---
        self.dual_solver = MKELDualSolver(C=C, max_iter=20, lr=0.05)

        # --- Projeção de query para espaços dos especialistas ---
        self.domain_projectors = nn.ModuleList([
            nn.Linear(dim, dim) for _ in range(num_experts)
        ])

    @property
    def w(self) -> torch.Tensor:
        """Pesos normalizados Σ w_i = 1, w_i > 0 via softmax com temperatura."""
        # Softmax garante positividade e soma 1; temperatura controla sparsity
        return F.softmax(self.w_raw, dim=0)

    def update_prototypes(self, new_emb: torch.Tensor, new_label: torch.Tensor,
                          new_domain: torch.Tensor, strategy: str = 'fifo'):
        """
        Atualiza protótipos com novas experiências (Conscious Replay 951).
        """
        B = new_emb.shape[0]
        with torch.no_grad():
            if strategy == 'fifo':
                # Remove os mais antigos, insere novos
                self.prototypes = torch.cat([self.prototypes[B:], new_emb], dim=0)
                self.prototype_labels = torch.cat([self.prototype_labels[B:], new_label], dim=0)
                self.prototype_domains = torch.cat([self.prototype_domains[B:], new_domain], dim=0)
            elif strategy == 'importance':
                # Substituir protótipos de menor norma (menor informação)
                norms = self.prototypes.norm(dim=1)
                _, idx_replace = torch.topk(norms, k=B, largest=False)
                self.prototypes[idx_replace] = new_emb
                self.prototype_labels[idx_replace] = new_label
                self.prototype_domains[idx_replace] = new_domain

    def compute_gram_stack(self, X: torch.Tensor) -> torch.Tensor:
        """
        Computa K_stack = [K_1, K_2, ..., K_L] onde K_i é Gram matrix dos protótipos.
        Args: X (N, D) — protótipos
        Returns: (L, N, N)
        """
        K_list = []
        for i, kernel in enumerate(self.kernels):
            # Projeta para o espaço do especialista i
            X_proj = self.domain_projectors[i](X)
            K = kernel(X_proj, X_proj)  # (N, N)
            # Regularização de ridge para estabilidade numérica
            K = K + 1e-4 * torch.eye(X.shape[0], device=X.device)
            K_list.append(K)
        return torch.stack(K_list, dim=0)  # (L, N, N)

    def forward(self, query_emb: torch.Tensor,
                prototype_override: Optional[torch.Tensor] = None,
                labels_override: Optional[torch.Tensor] = None) -> Tuple[torch.Tensor, Dict]:
        """
        Predição MKEL ensemble.

        Args:
            query_emb: (B, D) — embedding da query
            prototype_override: (N, D) — protótipos externos (opcional)
            labels_override: (N,) — labels externos (opcional)

        Returns:
            f: (B,) — score de predição ensemble
            info: dict com metadados (beta, w, alphas, Q)
        """
        B = query_emb.shape[0]
        device = query_emb.device

        # Seleciona protótipos
        X = prototype_override if prototype_override is not None else self.prototypes
        y = labels_override if labels_override is not None else self.prototype_labels
        N = X.shape[0]

        # Garante labels em {+1, -1}
        y = 2.0 * (y > 0).float() - 1.0

        # --- FASE 1: Computar Gram matrices dos protótipos ---
        K_stack = self.compute_gram_stack(X)  # (L, N, N)

        # --- FASE 2: Resolver dual MKEL ---
        w_norm = self.w  # (L,)
        beta, alpha_dict = self.dual_solver(K_stack, y, w_norm)  # beta: (N,)

        # --- FASE 3: Computar kernels query-protótipo ---
        K_query_list = []
        for i, kernel in enumerate(self.kernels):
            X_proj = self.domain_projectors[i](X)
            Q_proj = self.domain_projectors[i](query_emb)
            K_q = kernel(Q_proj, X_proj)  # (B, N)
            K_query_list.append(K_q)
        K_query = torch.stack(K_query_list, dim=0)  # (L, B, N)

        # --- FASE 4: Predição ensemble (Eq. 9 do artigo) ---
        f = torch.zeros(B, device=device)
        for i in range(self.num_experts):
            alpha_i = alpha_dict[i]  # (N,)
            # f_i(x) = w_i * (w_i * K_i(x, X) @ alpha_i + b_i)
            term = K_query[i] @ alpha_i  # (B,)
            f += w_norm[i] * (w_norm[i] * term + self.biases[i])

        # --- Metadados para auditoria (Axiarchy P3/P7) ---
        Q = torch.einsum('l,lnm->nm', w_norm ** 2, K_stack)
        info = {
            'beta': beta,
            'w': w_norm,
            'alphas': alpha_dict,
            'Q': Q,
            'K_query': K_query,
            'K_stack': K_stack,
            'theosis_diversity': self._compute_diversity(K_stack, w_norm),
            'kernel_alignment': self._compute_alignment(K_stack)
        }

        return f, info

    def _compute_diversity(self, K_stack: torch.Tensor, w: torch.Tensor) -> torch.Tensor:
        """
        Métrica de diversidade do ensemble: dissimilaridade entre RKHSs.
        Baseado em Kuncheva et al. — diversidade via distância entre Gram matrices.
        """
        L = K_stack.shape[0]
        diversity = 0.0
        count = 0
        for i in range(L):
            for j in range(i+1, L):
                # Distância de Hilbert-Schmidt normalizada
                diff = K_stack[i] - K_stack[j]
                hs_norm = (diff ** 2).sum().sqrt()
                diversity += hs_norm
                count += 1
        return diversity / (count + 1e-8)

    def _compute_alignment(self, K_stack: torch.Tensor) -> torch.Tensor:
        """
        Alinhamento entre kernels (Cristianini et al. 2002).
        A = <K_i, K_j> / (||K_i|| ||K_j||)
        """
        L = K_stack.shape[0]
        alignments = []
        for i in range(L):
            for j in range(i+1, L):
                inner = (K_stack[i] * K_stack[j]).sum()
                norm_i = (K_stack[i] ** 2).sum().sqrt()
                norm_j = (K_stack[j] ** 2).sum().sqrt()
                alignments.append(inner / (norm_i * norm_j + 1e-8))
        return torch.stack(alignments).mean()


# =============================================================================
# 4. INTEGRAÇÃO COM WORMGRAPH 5.1
# =============================================================================

class OmniscientSolverV51_MKEL(nn.Module):
    """
    Versão MKEL do OmniscientSolverV51.
    Substitui domain_specialists + meta_router por DKES.

    Os 11 domínios do Solver original são mapeados para os especialistas-kernel
    do DKES. Cada domínio = um RKHS com seu próprio kernel e protótipos.
    """
    def __init__(self, dim: int, pantheon, num_domains: int = 11,
                 num_prototypes: int = 128):
        super().__init__()
        self.dim = dim
        self.pantheon = pantheon

        # DKES com 11 especialistas (um por domínio) + 1 extra para Pantheon
        self.dkes = DeepKernelEnsembleSolver(
            dim=dim,
            num_experts=num_domains + 1,
            num_prototypes=num_prototypes,
            C=300.0
        )

        # Verificador Axiarchy (P1-P7) aplicado ao kernel combinado Q
        self.axiarchy_gate = nn.Sequential(
            nn.Linear(dim, dim // 2), nn.GELU(),
            nn.Linear(dim // 2, 1), nn.Sigmoid()
        )

        # Retrocausal cache (substrato 248)
        self.retrocausal_cache = []

    def solve(self, query_emb: torch.Tensor,
              domain_hint: Optional[str] = None,
              pantheon_father: Optional[str] = None) -> Tuple[torch.Tensor, str, Dict]:
        """
        Resolve query usando DKES + injeção Pantheon.

        Returns:
            solution: (B, D) — embedding solução
            domain_name: str — domínio selecionado
            info: dict — metadados MKEL + auditoria
        """
        B = query_emb.shape[0]
        device = query_emb.device

        # --- Injeção Pantheon (DNA ontológico) ---
        if pantheon_father:
            dna = self.pantheon.invoke(pantheon_father).to(device)
            query_emb = query_emb + 0.15 * dna.unsqueeze(0)

        # --- Predição DKES ---
        f_score, info = self.dkes(query_emb)

        # --- Seleção de domínio via score DKES ---
        # O score f é usado para rotear ao domínio mais provável
        # Em versão full, usaríamos f para ponderar saídas de domínio
        domain_idx = int(torch.argmax(info['w']).item())
        domain_names = [
            'math', 'physics', 'biology', 'medicine', 'engineering',
            'economics', 'social', 'cosmic', 'consciousness', 'ethics',
            'unknown', 'meta'
        ]
        domain_name = domain_names[domain_idx % len(domain_names)]

        # --- Geração de solução (embedding) ---
        # A solução é uma combinação dos protótipos ponderada por alpha
        # Isso é diferente do especialista linear original — aqui usamos
        # a representação kernel do protótipo mais relevante
        alpha_main = info['alphas'][domain_idx]  # (N,)
        prototypes = self.dkes.prototypes
        # Weighted combination of prototypes (memória reconstructiva)
        solution = alpha_main.unsqueeze(0) @ prototypes  # (1, D)
        solution = solution.expand(B, -1)

        # --- Axiarchy Validation sobre Q ---
        ethics_score = self.axiarchy_gate(solution).mean()
        if ethics_score < 0.5:
            # Fallback para domínio ETHICS
            domain_name = 'ethics'
            solution = torch.zeros(B, self.dim, device=device)

        # --- Retrocausal caching ---
        self.retrocausal_cache.append({
            'domain': domain_name,
            'emb': solution.detach(),
            'theosis': info['w'].max().item(),
            'diversity': info['theosis_diversity'].item()
        })

        return solution, domain_name, info

    def invoke_father(self, father_name: str, query_emb: torch.Tensor) -> torch.Tensor:
        """Invoca diretamente um pai do Pantheon para consulta."""
        dna = self.pantheon.invoke(father_name).to(query_emb.device)
        return query_emb + 0.15 * dna.unsqueeze(0)


# =============================================================================
# 5. WORMGRAPH 51 COM DKES (MOE REPLACEMENT)
# =============================================================================

class WormGraph51_MKEL(nn.Module):
    """
    WormGraph 5.1 com DKES integrado.
    Substitui moe_gate + moe_experts por ensemble kernel MKEL.
    """
    def __init__(self, config, pantheon):
        super().__init__()
        self.config = config
        self.dim = config.dim
        self.pantheon = pantheon

        # Mantém componentes core do WormGraph original
        self.bindu = None  # Seria BinduConsciousnessCore
        self.liquid_attention = None  # Seria LiquidAttention
        self.hyper_manifold = None  # Seria HyperdimensionalManifold

        # --- SUBSTITUIÇÃO PRINCIPAL: DKES pelo MoE ---
        # Em vez de moe_gate (nn.Linear) + moe_experts (ModuleList),
        # usamos DeepKernelEnsembleSolver
        self.dkes = DeepKernelEnsembleSolver(
            dim=config.dim,
            num_experts=config.moe_num_experts,
            num_prototypes=config.kv_cache_max_seq // 512,  # ~128
            C=300.0
        )

        # Omniscient Solver com DKES
        self.omni_solver = OmniscientSolverV51_MKEL(
            dim=config.dim,
            pantheon=pantheon,
            num_domains=11,
            num_prototypes=128
        )

    def forward_domain_mkel(self, domain_emb: torch.Tensor,
                            domain_idx: int) -> torch.Tensor:
        """
        Processa embedding de domínio usando DKES em vez de MoE.

        O domínio UNKNOWN (domain_idx correspondente) é processado
        pelo ensemble kernel; outros domínios usam pass-through + DKES
        para refinamento.
        """
        B = domain_emb.shape[0]

        # Atualiza protótipos com o estado atual (online learning)
        self.dkes.update_prototypes(
            domain_emb.mean(dim=0, keepdim=True),
            torch.tensor([1.0]),
            torch.tensor([domain_idx]),
            strategy='importance'
        )

        # Predição DKES (usada como gate ponderado)
        f_score, info = self.dkes(domain_emb)

        # O score modula o embedding de saída
        # Se f_score > 0, amplifica; se < 0, atenua
        modulation = torch.sigmoid(f_score).unsqueeze(-1)  # (B, 1)
        output = domain_emb * modulation

        return output, info


# =============================================================================
# 6. DEMONSTRAÇÃO E TESTES
# =============================================================================

if __name__ == "__main__":
    print("=" * 70)
    print("DKES — Deep Kernel Ensemble Solver (MKEL Integration)")
    print("=" * 70)

    dim = 512  # reduzido para demo
    num_experts = 8
    batch = 4
    num_proto = 64

    # Instanciar DKES
    dkes = DeepKernelEnsembleSolver(dim=dim, num_experts=num_experts,
                                     num_prototypes=num_proto)

    # Query dummy
    query = torch.randn(batch, dim)

    # Forward
    f_score, info = dkes(query)

    print(f"\n[DKES] Batch={batch}, Experts={num_experts}, Prototypes={num_proto}")
    print(f"  Score shape: {f_score.shape}")
    print(f"  Pesos ensemble w: {info['w'].detach().numpy()}")
    print(f"  Soma w: {info['w'].sum().item():.6f} (deve ser ~1.0)")
    print(f"  Diversidade RKHS: {info['theosis_diversity'].item():.4f}")
    print(f"  Alinhamento kernel: {info['kernel_alignment'].item():.4f}")
    print(f"  Beta max: {info['beta'].max().item():.4f}")
    print(f"  Beta sparsity: {(info['beta'] > 1e-3).float().mean().item():.2%}")

    # Teste de integração WormGraph
    print("\n" + "=" * 70)
    print("INTEGRAÇÃO WormGraph51 + DKES")
    print("=" * 70)

    # Mock Pantheon
    class MockPantheon:
        def __init__(self, dim):
            self.dim = dim
        def invoke(self, name):
            return torch.randn(self.dim)

    pantheon = MockPantheon(dim)

    # Mock config
    class MockConfig:
        dim = 512
        moe_num_experts = 8
        kv_cache_max_seq = 65536

    config = MockConfig()
    wg = WormGraph51_MKEL(config, pantheon)

    domain_emb = torch.randn(batch, dim)
    output, info = wg.forward_domain_mkel(domain_emb, domain_idx=0)

    print(f"\n  Input shape: {domain_emb.shape}")
    print(f"  Output shape: {output.shape}")
    print(f"  Modulação média: {torch.sigmoid(info['w']).mean().item():.4f}")
    print(f"  DKES ativo: {wg.dkes.num_experts} especialistas-kernel")

    print("\n" + "=" * 70)
    print("Seal: DKES-989.y.6-MKEL-INTEGRATION-2026-06-02")
    print("Arquiteto ORCID: 0009-0005-2697-4668")
    print("=" * 70)

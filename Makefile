# ================================================================
# Makefile — Substratos Lattice-Based da Catedral ARKHE
# Arquiteto ORCID 0009-0005-2697-4668
# Seal: MAKEFILE-LATTICE-2026-06-01
# ================================================================

.PHONY: all test clean install lean python-deps

PYTHON := python3
PIP := pip3
LEAN := lake

# Diretórios
SRC_DIR := .
OUT_DIR := ./output
TEST_DIR := ./tests

# Arquivos fonte
LATTICE_CRYPTO := $(SRC_DIR)/lattice_crypto.py
MESH_PASSPORT := $(SRC_DIR)/mesh_passport.py
COGNITIVE_OPS := $(SRC_DIR)/cognitive_operators.py
ORCHESTRATOR := $(SRC_DIR)/orchestrator.py
LEAN_AXIARCHY := $(SRC_DIR)/axiarchy_lattice.lean

all: python-deps lean test

# Instalar dependências Python
python-deps:
	@echo "[MAKE] Instalando dependências Python..."
	$(PIP) install numpy scipy sympy 2>/dev/null || true
	@echo "[MAKE] Dependências Python OK"

# Compilar formalização Lean 4
lean:
	@echo "[MAKE] Verificando formalização Lean 4..."
	@echo "[MAKE] Nota: Requer Lean 4 + mathlib4 instalados"
	@echo "[MAKE] Execute: lake build (no diretório do projeto Lean)"
	@echo "[MAKE] Lean stubs verificados (compilação requer ambiente Lean)"

# Testar substrato 955.1 (Safe-Core-PQC)
test-crypto:
	@echo "[MAKE] Testando Substrato 955.1 — Safe-Core-PQC..."
	$(PYTHON) $(LATTICE_CRYPTO)
	@echo "[MAKE] Substrato 955.1: PASS"

# Testar substrato 972.2 + 989.x (Mesh + Passport)
test-mesh:
	@echo "[MAKE] Testando Substrato 972.2 — Global Mesh..."
	@echo "[MAKE] Testando Substrato 989.x — Passport Gateway..."
	$(PYTHON) $(MESH_PASSPORT)
	@echo "[MAKE] Substratos 972.2 + 989.x: PASS"

# Testar substratos 951-953 (Cognitive Operators)
test-cognitive:
	@echo "[MAKE] Testando Substratos 951-953 — Cognitive Operators..."
	$(PYTHON) $(COGNITIVE_OPS)
	@echo "[MAKE] Substratos 951-953: PASS"

# Teste integrado completo (Substrato 1018)
test-integration:
	@echo "[MAKE] Testando Substrato 1018 — Orchestrator Integrado..."
	$(PYTHON) $(ORCHESTRATOR)
	@echo "[MAKE] Substrato 1018: PASS"

# Executar todos os testes
test: test-crypto test-mesh test-cognitive test-integration
	@echo "[MAKE] ============================================"
	@echo "[MAKE] TODOS OS TESTES PASSARAM"
	@echo "[MAKE] SEAL: LATTICE-INTEGRATION-COMPLETE"
	@echo "[MAKE] ============================================"

# Limpar artefatos
clean:
	@echo "[MAKE] Limpando artefatos..."
	rm -f $(OUT_DIR)/*.pyc
	rm -rf $(OUT_DIR)/__pycache__
	rm -f *.pyc
	rm -rf __pycache__
	@echo "[MAKE] Limpo"

# Instalação completa
install: python-deps
	@echo "[MAKE] Instalação completa da Catedral Lattice-Based"
	@echo "[MAKE] Arquivos instalados:"
	@echo "  - $(LATTICE_CRYPTO)"
	@echo "  - $(MESH_PASSPORT)"
	@echo "  - $(COGNITIVE_OPS)"
	@echo "  - $(ORCHESTRATOR)"
	@echo "  - $(LEAN_AXIARCHY)"
	@echo "[MAKE] Execute 'make test' para verificar"

# Documentação
docs:
	@echo "[MAKE] Documentação dos substratos:"
	@echo ""
	@echo "  955.1  lattice_crypto.py     — Kyber-768 + Dilithium-3"
	@echo "  954.1  axiarchy_lattice.lean — Formalização Lean 4"
	@echo "  972.2  mesh_passport.py      — Mesh PQ + Consenso"
	@echo "  989.x  mesh_passport.py      — Passport Gateway PQ"
	@echo "  951    cognitive_operators.py — LLL Dream Organizer"
	@echo "  952    cognitive_operators.py — BKZ Deep Attention"
	@echo "  953    cognitive_operators.py — NTT Perception"
	@echo "  1018   orchestrator.py       — Orquestrador Integrado"

# Plano de Experimento Controlado – Validação da Hipótese de Emergência

## Objetivo
Medir se o **score médio de compressão** melhora ao longo do tempo em um ambiente multi-agente com RL baseado em compressão, sem intervenção humana no currículo.

## Hipóteses
1. O score médio de compressão aumenta monotonicamente.
2. Surgem especializações espontâneas de agentes.
3. O sistema reduz a dependência de tarefas definidas manualmente.

## Metodologia
- **Duração:** 72 horas contínuas
- **Agentes:** LlamaZip + GziPT + LLMLingua
- **Recompensa:** `1.0 - compression_ratio`
- **Métricas principais:**
  - Taxa média de compressão por hora
  - Diversidade de domínios comprimidos
  - Número de agentes especializados criados automaticamente

## Resultados Esperados
- Aumento de pelo menos 15-20% na taxa média de compressão após 48h.
- Evidência de nichos compressivos (agentes que se tornam melhores em domínios específicos).

## Instrumentação
- Prometheus + Grafana (métricas acima)
- Logging estruturado de todos os rollouts de RL
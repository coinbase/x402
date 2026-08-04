# Runbook de Operações — Cathedral ARKHE (Alpine Stack)

**Versão:** v2.1.0
**Data:** 2026-06-19
**Selo:** CATHEDRAL-ARKHE-RUNBOOK-v2.1.0

## 1. Visão Geral da Stack

| Componente          | Container              | Porta     | Função Principal                     |
|---------------------|------------------------|-----------|--------------------------------------|
| MCP Server          | cathedral-mcp          | 8787/8788 | Core + Headroom + Seal + Circuit Breaker |
| PostgreSQL          | cathedral-postgres     | 5432      | WormGraph + Memória Híbrida          |
| Redis               | cathedral-redis        | 6379      | DLQ + Cache                          |
| Prometheus          | cathedral-prometheus   | 9090      | Métricas                             |
| Grafana             | cathedral-grafana      | 3000      | Dashboards                           |

## 2. Comandos Básicos

```bash
# Iniciar toda a stack
docker-compose -f docker-compose.alpine.yml up -d

# Parar a stack
docker-compose -f docker-compose.alpine.yml down

# Ver logs do MCP
docker-compose -f docker-compose.alpine.yml logs -f cathedral-mcp

# Reiniciar apenas o MCP
docker-compose -f docker-compose.alpine.yml restart cathedral-mcp

# Executar script de inicialização dentro do container
docker exec -it cathedral-mcp /usr/local/bin/start.sh status
```

## 3. Health Checks

```bash
# MCP Server
curl http://localhost:8787/healthz

# Prometheus
curl http://localhost:9090/-/healthy

# PostgreSQL
docker exec cathedral-postgres pg_isready -U cathedral
```

## 4. Incidentes Comuns e Resolução

### 4.1 Circuit Breaker Aberto

**Sintoma:**
Painel "Circuit Breakers Open" > 0 no Grafana.

**Ações:**
1. Identificar o componente afetado no dashboard.
2. Verificar logs:
   ```bash
   docker-compose logs cathedral-mcp | grep "Circuit Breaker"
   ```
3. Verificar se há falhas recorrentes no componente (Headroom, Seal, etc.).
4. Se for temporário → aguardar recovery (30s por padrão).
5. Se persistir → investigar causa raiz (latência alta, dependência externa, etc.).

### 4.2 DLQ Crescendo / Poison Pill

**Sintoma:**
`DLQ Size` > 1000 ou aumento de Poison Pills.

**Ações:**
1. Verificar mensagens na DLQ via Redis:
   ```bash
   docker exec cathedral-redis redis-cli LLEN dlq:messages
   ```
2. Investigar os erros mais comuns:
   ```bash
   docker-compose logs cathedral-mcp | grep "DLQ\|poison"
   ```
3. Se for Poison Pill → mensagem está falhando consistentemente. Investigar o componente de origem.
4. Usar o script de replay quando disponível.

### 4.3 Last-Effort Exausto

**Sintoma:**
Métricas `last_effort_escalated_total` aumentando.

**Ação:**
- Escalonar para time de SRE/DevOps.
- Verificar se há problema estrutural (configuração errada, dependência externa quebrada, etc.).

### 4.4 Alta Latência no MCP

**Ações:**
1. Verificar P95 Latency no dashboard.
2. Checar uso de CPU/Memória do container `cathedral-mcp`.
3. Verificar latência do PostgreSQL e Redis.
4. Ativar modo diagnóstico temporariamente (se implementado).

## 5. Backup e Restauração (WormGraph)

```bash
# Backup do PostgreSQL
docker exec cathedral-postgres pg_dump -U cathedral cathedral > backup_$(date +%F).sql

# Restauração
docker exec -i cathedral-postgres psql -U cathedral cathedral < backup_2026-06-19.sql
```

## 6. Limpeza e Manutenção

- **Logs**: Rotação automática via `alpine-start.sh` (10MB por arquivo, 5 arquivos).
- **DLQ antiga**: Executar periodicamente:
  ```sql
  SELECT wormgraph.purge_dlq_old_messages(7);
  ```
- **Memória Híbrida**: Implementar política de retenção (ex: memórias com relevância < 0.2 e > 90 dias).

## 7. Escalonamento

| Componente     | Quando Escalar                  | Estratégia Recomendada      |
|----------------|---------------------------------|-----------------------------|
| cathedral-mcp  | CPU > 70% ou P95 > 2s           | Aumentar replicas + HPA     |
| PostgreSQL     | Conexões > 80% ou I/O alto      | Read replicas + connection pool |
| Redis          | Memória > 70%                   | Aumentar memória / cluster  |

## 8. Contatos e Escalation

- **Nível 1 (SRE/DevOps)**: Monitoramento + restart de serviços
- **Nível 2 (Desenvolvedores Core)**: Circuit Breaker, Seal, Last-Effort, WormGraph
- **Nível 3 (Arquitetura)**: Mudanças em políticas de resiliência ou arquitetura

---

**Selo:** CATHEDRAL-ARKHE-RUNBOOK-v2.1.0-2026-06-19
# Arquitetura inicial

## Contextos de negocio

1. **Identity & Onboarding** — tenants, usuarios, recebedores, KYC e limites.
2. **Payment Orchestration** — ordens, estados, Pix, cartao, boleto e recorrencia.
3. **Ledger** — partidas dobradas, saldos, reservas, tarifas e ajustes.
4. **Receivables** — split, agenda, liquidacao e antecipacao.
5. **Reconciliation** — conciliacao transacional e bancaria.
6. **Risk** — regras, fraude, revisao manual, disputas e chargebacks.
7. **Developer Platform** — APIs, webhooks, sandbox, SDKs e documentacao.
8. **Operations** — portais, auditoria, incidentes e relatorios.

## Estilo arquitetural

O inicio utiliza um monorepo modular para reduzir custo de coordenacao e tornar
limites de dominio explicitos. Modulos podem ser extraidos para servicos
independentes quando volume, disponibilidade ou organizacao exigirem.

Integracoes externas devem ser encapsuladas por adaptadores. O dominio recebe
comandos normalizados e publica eventos independentes do formato dos provedores.

## Fluxo principal

```text
Cliente -> API -> Orquestrador -> Provedor de pagamento
                    |                    |
                    v                    v
                  Ledger <- Eventos normalizados
                    |
                    v
        Split -> Recebiveis -> Liquidacao -> Conciliacao
```

## Requisitos nao funcionais iniciais

- idempotencia em todos os comandos mutaveis;
- rastreabilidade por correlation ID;
- nenhuma alteracao destrutiva no ledger;
- criptografia em transito e em repouso;
- segregacao logica por tenant;
- disponibilidade alvo de 99,95% apos estabilizacao;
- RPO de 5 minutos e RTO de 30 minutos;
- logs estruturados, metricas e rastreamento distribuido.


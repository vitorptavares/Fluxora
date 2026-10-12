# Roadmap de desenvolvimento — 12 meses

| Mes | Entrega principal | Capacidades |
|---:|---|---|
| 1 | Fundacao | CI/CD, ambientes, identidade, observabilidade e padroes |
| 2 | Onboarding | tenants, usuarios, recebedores, KYC, contas e limites |
| 3 | Core financeiro | ledger, saldos, reservas, tarifas e auditoria |
| 4 | Pix | orquestracao, cobranca, confirmacao e devolucao |
| 5 | Cartoes | tokenizacao, autorizacao, captura, parcelamento e estorno |
| 6 | Boleto e recorrencia | emissao, baixa, planos, ciclos e retentativas |
| 7 | Recebiveis | split, tabelas de tarifa, agenda e liquidacao |
| 8 | Conciliacao | arquivos, extratos, matching e divergencias |
| 9 | Risco | antifraude, regras, 3DS, chargebacks e disputas |
| 10 | Experiencia | portal administrativo, portal do cliente e sandbox |
| 11 | Escala | multiprovedor, roteamento, failover e testes de carga |
| 12 | Producao | hardening, auditoria, piloto e liberacao gradual |

## Primeiro incremento

- PP-001: pipeline de integracao continua;
- PP-002: API com health check e erros padronizados;
- PP-003: modelo de tenant e usuario;
- PP-004: autenticacao de maquina por chave de API;
- PP-005: correlation ID e logs estruturados;
- PP-006: contrato inicial de criacao de pagamento;
- PP-007: persistencia local para desenvolvimento;
- PP-008: teste de arquitetura dos limites entre modulos.


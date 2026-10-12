# Contribuindo

## Fluxo de trabalho

1. Crie uma branch curta a partir da branch principal.
2. Implemente a mudanca com testes automatizados.
3. Execute `npm run typecheck`, `npm test` e `npm run build`.
4. Abra uma revisao descrevendo impacto funcional, riscos e plano de rollback.

## Convencoes

- commits pequenos, coesos e com mensagem no imperativo;
- regras de negocio ficam em `packages/domain`;
- adaptadores HTTP e de provedores ficam fora do dominio;
- APIs publicas sao versionadas;
- logs nao podem conter credenciais nem dados sensiveis de pagamento;
- alteracoes financeiras precisam preservar auditabilidade e idempotencia.


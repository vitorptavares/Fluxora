# Payment Platform

Monorepo para uma plataforma enterprise de pagamentos com Pix, cartoes, boleto,
recorrencia, split, ledger de partidas dobradas, conciliacao, liquidacao, risco e
chargebacks.

## Estado atual

O repositorio contem a fundacao do primeiro ciclo de desenvolvimento:

- API HTTP executavel sem dependencias externas;
- endpoints de clientes, estabelecimentos, usuarios e permissoes;
- cadastro protegido de contas bancarias;
- configuracao de Pix, cartao e boleto;
- credenciais de API com rotacao e revogacao;
- endpoint de saude e metadados do servico;
- decisoes arquiteturais registradas;
- roadmap de desenvolvimento de 12 meses;
- configuracao de integracao continua.

## Requisitos

- Node.js 22 ou superior;
- npm 10 ou superior.

## Executar

```bash
npm install
npm run dev
```

Em outro terminal:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/v1
```

## Estrutura

```text
apps/api/              API publica e administrativa
packages/domain/       Regras e tipos centrais de negocio
docs/architecture/     Arquitetura e decisoes tecnicas
docs/roadmap/          Plano de desenvolvimento
infra/                 Infraestrutura como codigo (proximos ciclos)
```

## Principios

- valores monetarios sao representados em unidades inteiras da menor moeda;
- toda operacao mutavel deve aceitar uma chave de idempotencia;
- eventos e lancamentos financeiros sao imutaveis;
- correcoes financeiras usam lancamentos compensatorios;
- dados e operacoes sao segregados por tenant;
- nenhuma integracao externa invade o dominio central diretamente.

Consulte [a arquitetura](docs/architecture/overview.md) e o
[roadmap de 12 meses](docs/roadmap/12-month-plan.md). O guia de
[cadastro e contas](docs/registration-and-accounts.md) documenta os endpoints,
o bootstrap do primeiro usuario e exemplos de verificacao.


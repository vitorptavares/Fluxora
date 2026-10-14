# API de onboarding: clientes e estabelecimentos

Primeiro incremento do contexto **Identity & Onboarding** (mes 2 do roadmap).

## Convencoes comuns

| Cabecalho | Obrigatorio | Descricao |
|---|---|---|
| `X-Tenant-Id` | todas as rotas `/v1/customers` e `/v1/establishments` | Tenant dono dos dados. Temporario ate a autenticacao por chave de API (PP-004), que passara a derivar o tenant da credencial. |
| `Idempotency-Key` | todo `POST` | Ate 255 caracteres ASCII visiveis. Escopo: tenant + rota. |

**Idempotencia**

- mesma chave + mesmo corpo: devolve a resposta original (mesmo status e corpo) com `Idempotent-Replayed: true`;
- mesma chave + corpo diferente: `409 idempotency_key_reused`;
- erros de validacao (`422`) nao sao memorizados, para que o cliente corrija o corpo e reenvie com a mesma chave;
- conflitos (`409`) sao memorizados.

**Erros** seguem sempre o formato:

```json
{ "error": { "code": "validation_error", "message": "...", "details": [{ "field": "address.postalCode", "code": "invalid_format", "message": "..." }] } }
```

| Status | `code` |
|---:|---|
| 400 | `tenant_required`, `idempotency_key_required`, `invalid_json`, `invalid_body`, `invalid_parameter` |
| 404 | `customer_not_found`, `establishment_not_found`, `route_not_found` |
| 405 | `method_not_allowed` (com cabecalho `Allow`) |
| 409 | `customer_already_registered`, `establishment_already_registered`, `idempotency_key_reused` |
| 413 | `payload_too_large` (limite de 1 MiB) |
| 422 | `validation_error` |

**Listagem**: `GET` na colecao aceita `limit` (1–100, padrao 20) e `starting_after`
(id do ultimo item da pagina anterior). Resposta: `{ "object": "list", "data": [...], "hasMore": bool }`.

**Documentos**: CPF e CNPJ sao aceitos com ou sem mascara e armazenados
normalizados. O CNPJ alfanumerico (IN RFB 2.229/2024, vigente desde julho de
2026) e suportado. O documento e unico por tenant em cada cadastro.

## Clientes

Pagadores, pessoa fisica (CPF) ou juridica (CNPJ).

| Metodo | Rota |
|---|---|
| `POST` | `/v1/customers` |
| `GET` | `/v1/customers` |
| `GET` | `/v1/customers/{id}` |

| Campo | Tipo | Regras |
|---|---|---|
| `name` | string | obrigatorio, 2–150 caracteres |
| `email` | string | obrigatorio, armazenado em minusculas |
| `document` | string | obrigatorio, CPF ou CNPJ valido; define `type` (`individual`/`company`) |
| `phone` | string | opcional; E.164 ou numero nacional com DDD, armazenado em E.164 |

```bash
curl -X POST http://localhost:3000/v1/customers \
  -H 'content-type: application/json' \
  -H 'x-tenant-id: ten_demo' \
  -H 'idempotency-key: 6f1c2b8e-cliente-1' \
  -d '{"name":"Maria Silva","email":"maria@example.com","document":"529.982.247-25"}'
```

```json
{
  "id": "cus_...",
  "tenantId": "ten_demo",
  "type": "individual",
  "name": "Maria Silva",
  "email": "maria@example.com",
  "document": { "type": "cpf", "number": "52998224725" },
  "status": "active",
  "createdAt": "2026-10-13T12:00:00.000Z",
  "updatedAt": "2026-10-13T12:00:00.000Z"
}
```

## Estabelecimentos

Recebedores pessoa juridica. Todo estabelecimento nasce em `pending_review` e
so podera transacionar apos o KYC (proximo incremento).

| Metodo | Rota |
|---|---|
| `POST` | `/v1/establishments` |
| `GET` | `/v1/establishments` |
| `GET` | `/v1/establishments/{id}` |

| Campo | Tipo | Regras |
|---|---|---|
| `legalName` | string | obrigatorio, razao social, 2–150 caracteres |
| `tradeName` | string | opcional, nome fantasia; padrao = `legalName` |
| `document` | string | obrigatorio, CNPJ valido (numerico ou alfanumerico) |
| `mcc` | string | obrigatorio, 4 digitos |
| `email` | string | obrigatorio |
| `phone` | string | opcional, como em clientes |
| `address` | objeto | obrigatorio: `street`, `number`, `district`, `city`, `state` (UF), `postalCode` (CEP, 8 digitos); `complement` opcional |

```bash
curl -X POST http://localhost:3000/v1/establishments \
  -H 'content-type: application/json' \
  -H 'x-tenant-id: ten_demo' \
  -H 'idempotency-key: 6f1c2b8e-estab-1' \
  -d '{
    "legalName": "Clinica Exemplo Ltda",
    "document": "12.ABC.345/01DE-35",
    "mcc": "8011",
    "email": "financeiro@clinica.com.br",
    "address": {
      "street": "Av. Djalma Batista", "number": "1000", "district": "Chapada",
      "city": "Manaus", "state": "AM", "postalCode": "69050-010"
    }
  }'
```

## Limitacoes conhecidas

- persistencia em memoria: os dados somem ao reiniciar a API (PP-007 trara a persistencia local);
- tenant por cabecalho, sem autenticacao (PP-004);
- sem atualizacao/encerramento de cadastro, dados bancarios ou KYC — proximos incrementos do onboarding.

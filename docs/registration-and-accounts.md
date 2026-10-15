# Registration and accounts

This milestone implements the in-memory domain and HTTP API for:

- customers and merchants;
- users and role-based permissions;
- bank accounts with masked sensitive data;
- payment method configuration and merchant overrides;
- API credentials with one-time secret disclosure, rotation and revocation.

The in-memory repository is intentional for this milestone. A persistent adapter
can replace it without moving business rules out of the domain package.

## API conventions

All endpoints use JSON. Protected endpoints require the acting user ID in the
`x-actor-id` header. Errors have a stable shape:

```json
{
  "error": {
    "code": "validation_error",
    "message": "email is invalid",
    "details": { "field": "email" }
  }
}
```

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/v1/customers` | Create a customer |
| GET | `/v1/customers` | List customers |
| GET, PATCH | `/v1/customers/:customerId` | Read or update a customer |
| POST, GET | `/v1/customers/:customerId/merchants` | Create or list merchants |
| GET, PATCH | `/v1/customers/:customerId/merchants/:merchantId` | Read or update a merchant |
| POST, GET | `/v1/customers/:customerId/users` | Create or list users |
| GET, PATCH | `/v1/customers/:customerId/users/:userId` | Read or update a user |
| POST, GET | `/v1/customers/:customerId/bank-accounts` | Create or list bank accounts |
| GET, PATCH | `/v1/customers/:customerId/bank-accounts/:accountId` | Read or update a pending account |
| PATCH | `/v1/customers/:customerId/bank-accounts/:accountId/status` | Verify, activate or disable an account |
| POST, GET | `/v1/customers/:customerId/payment-methods` | Configure or list payment methods |
| PATCH | `/v1/customers/:customerId/payment-methods/:configurationId` | Update a configuration |
| GET | `/v1/customers/:customerId/merchants/:merchantId/payment-methods/effective` | Resolve defaults and overrides |
| POST, GET | `/v1/customers/:customerId/credentials` | Create or list credentials |
| GET | `/v1/customers/:customerId/credentials/:credentialId` | Read safe credential metadata |
| POST | `/v1/customers/:customerId/credentials/:credentialId/rotate` | Rotate a secret |
| POST | `/v1/customers/:customerId/credentials/:credentialId/revoke` | Revoke a credential |

## Bootstrap

Create a customer first. The first user for that customer may then be created
without an actor header and must normally be the owner used for later requests.
After the first user exists, user creation requires an authorized actor.

```bash
curl -sS -X POST http://localhost:3000/v1/customers \
  -H 'content-type: application/json' \
  -d '{
    "legalName":"Example Commerce Ltda",
    "tradingName":"Example Shop",
    "taxId":"12.345.678/0001-90",
    "email":"finance@example.test",
    "phone":"+55 11 99999-0000",
    "address":{"country":"BR","city":"Sao Paulo"},
    "businessClassification":"retail"
  }'
```

Use the returned customer ID to create its first owner:

```bash
curl -sS -X POST http://localhost:3000/v1/customers/CUSTOMER_ID/users \
  -H 'content-type: application/json' \
  -d '{"name":"Account Owner","email":"owner@example.test","role":"owner"}'
```

Pass the returned user ID on protected operations:

```bash
curl -sS http://localhost:3000/v1/customers/CUSTOMER_ID/users \
  -H 'x-actor-id: OWNER_USER_ID'
```

## Verification

```bash
npm install
npm run typecheck
npm test
npm run dev
```

Credential secrets appear only in create and rotate responses. Bank account
responses contain masked tax IDs and account numbers. Neither raw value is
written to audit events.


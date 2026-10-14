import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app.js";
import { createApiServer } from "../src/server.js";

function newApp() {
  let next = 0;
  return createApp({
    clock: () => new Date("2026-10-13T12:00:00Z"),
    idGenerator: (prefix) => `${prefix}_${++next}`
  });
}

const tenant = { "x-tenant-id": "ten_clinicas" };
const customerBody = { name: "Maria Silva", email: "maria@example.com", document: "529.982.247-25" };
const establishmentBody = {
  legalName: "Clinica Exemplo Ltda",
  document: "12.ABC.345/01DE-35",
  mcc: "8011",
  email: "financeiro@clinica.com.br",
  address: {
    street: "Av. Djalma Batista",
    number: "1000",
    district: "Chapada",
    city: "Manaus",
    state: "AM",
    postalCode: "69050-010"
  }
};

function post(app, path, body, key = "key-1", headers = tenant) {
  return app.routeRequest("POST", path, { headers: { ...headers, "idempotency-key": key }, body });
}

test("POST /v1/customers registers a customer", () => {
  const app = newApp();
  const response = post(app, "/v1/customers", customerBody);
  assert.equal(response.status, 201);
  assert.equal(response.body.id, "cus_1");
  assert.equal(response.body.tenantId, "ten_clinicas");
  assert.equal(response.body.type, "individual");
});

test("GET /v1/customers/:id retrieves within tenant only", () => {
  const app = newApp();
  const { body } = post(app, "/v1/customers", customerBody);
  assert.equal(app.routeRequest("GET", `/v1/customers/${body.id}`, { headers: tenant }).status, 200);

  const other = app.routeRequest("GET", `/v1/customers/${body.id}`, { headers: { "x-tenant-id": "other" } });
  assert.equal(other.status, 404);
  assert.equal(other.body.error.code, "customer_not_found");
});

test("POST /v1/establishments registers an establishment with alphanumeric CNPJ", () => {
  const app = newApp();
  const response = post(app, "/v1/establishments", establishmentBody);
  assert.equal(response.status, 201);
  assert.equal(response.body.id, "est_1");
  assert.equal(response.body.status, "pending_review");
  assert.deepEqual(response.body.document, { type: "cnpj", number: "12ABC34501DE35" });
});

test("validation errors return 422 with field details", () => {
  const app = newApp();
  const response = post(app, "/v1/establishments", { ...establishmentBody, mcc: "x", email: "bad" });
  assert.equal(response.status, 422);
  assert.equal(response.body.error.code, "validation_error");
  assert.deepEqual(response.body.error.details.map((d) => d.field).sort(), ["email", "mcc"]);
});

test("duplicate document returns 409", () => {
  const app = newApp();
  post(app, "/v1/customers", customerBody, "k1");
  const response = post(app, "/v1/customers", customerBody, "k2");
  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, "customer_already_registered");
});

test("same Idempotency-Key and body replays the original response", () => {
  const app = newApp();
  const first = post(app, "/v1/customers", customerBody, "retry-1");
  const second = post(app, "/v1/customers", customerBody, "retry-1");
  assert.equal(second.status, 201);
  assert.deepEqual(second.body, first.body);
  assert.equal(second.headers["idempotent-replayed"], "true");

  const list = app.routeRequest("GET", "/v1/customers", { headers: tenant });
  assert.equal(list.body.data.length, 1, "replay must not create a second customer");
});

test("same Idempotency-Key with a different body is rejected", () => {
  const app = newApp();
  post(app, "/v1/customers", customerBody, "retry-1");
  const response = post(app, "/v1/customers", { ...customerBody, name: "Outra" }, "retry-1");
  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, "idempotency_key_reused");
});

test("validation failures are not memorized, so the key can be reused after fixing", () => {
  const app = newApp();
  assert.equal(post(app, "/v1/customers", { ...customerBody, email: "bad" }, "k").status, 422);
  assert.equal(post(app, "/v1/customers", customerBody, "k").status, 201);
});

test("idempotency keys are scoped per tenant", () => {
  const app = newApp();
  post(app, "/v1/customers", customerBody, "shared");
  const response = post(app, "/v1/customers", customerBody, "shared", { "x-tenant-id": "ten_2" });
  assert.equal(response.status, 201);
  assert.equal(response.body.tenantId, "ten_2");
});

test("mutations require tenant and Idempotency-Key", () => {
  const app = newApp();
  const noTenant = app.routeRequest("POST", "/v1/customers", {
    headers: { "idempotency-key": "k" },
    body: customerBody
  });
  assert.equal(noTenant.body.error.code, "tenant_required");

  const noKey = app.routeRequest("POST", "/v1/customers", { headers: tenant, body: customerBody });
  assert.equal(noKey.status, 400);
  assert.equal(noKey.body.error.code, "idempotency_key_required");
});

test("list is paginated with limit and starting_after", () => {
  const app = newApp();
  post(app, "/v1/customers", customerBody, "a");
  post(app, "/v1/customers", { ...customerBody, document: "11.222.333/0001-81" }, "b");
  post(app, "/v1/customers", { ...customerBody, document: "12.ABC.345/01DE-35" }, "c");

  const first = app.routeRequest("GET", "/v1/customers?limit=2", { headers: tenant });
  assert.deepEqual(first.body.data.map((c) => c.id), ["cus_1", "cus_2"]);
  assert.equal(first.body.hasMore, true);

  const second = app.routeRequest("GET", "/v1/customers?limit=2&starting_after=cus_2", { headers: tenant });
  assert.deepEqual(second.body.data.map((c) => c.id), ["cus_3"]);
  assert.equal(second.body.hasMore, false);

  assert.equal(app.routeRequest("GET", "/v1/customers?limit=0", { headers: tenant }).status, 400);
});

test("unsupported method returns 405 with Allow header", () => {
  const app = newApp();
  const response = app.routeRequest("DELETE", "/v1/customers/cus_1", { headers: tenant });
  assert.equal(response.status, 405);
  assert.equal(response.headers.allow, "GET");
});

test("HTTP server parses JSON, rejects malformed bodies and sets replay header", async (t) => {
  const server = createApiServer(newApp());
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());
  const base = `http://localhost:${server.address().port}`;
  const headers = { ...tenant, "content-type": "application/json", "idempotency-key": "http-1" };

  const created = await fetch(`${base}/v1/establishments`, {
    method: "POST",
    headers,
    body: JSON.stringify(establishmentBody)
  });
  assert.equal(created.status, 201);
  assert.equal((await created.json()).tradeName, "Clinica Exemplo Ltda");

  const replay = await fetch(`${base}/v1/establishments`, {
    method: "POST",
    headers,
    body: JSON.stringify(establishmentBody)
  });
  assert.equal(replay.headers.get("idempotent-replayed"), "true");

  const malformed = await fetch(`${base}/v1/customers`, {
    method: "POST",
    headers: { ...headers, "idempotency-key": "http-2" },
    body: "{not json"
  });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error.code, "invalid_json");

  const tooLarge = await fetch(`${base}/v1/customers`, {
    method: "POST",
    headers: { ...headers, "idempotency-key": "http-3" },
    body: JSON.stringify({ name: "x".repeat(1024 * 1024 + 1) })
  });
  assert.equal(tooLarge.status, 413);
});

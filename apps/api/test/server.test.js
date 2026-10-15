import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import { Registry } from "@payments/domain";
import { handleRequest, routeRequest } from "../src/server.js";

function request(method, url, body, headers = {}) {
  const stream = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  stream.method = method;
  stream.url = url;
  stream.headers = headers;
  return stream;
}

test("GET /health reports readiness", () => {
  assert.deepEqual(routeRequest("GET", "/health"), {
    status: 200,
    body: { status: "ok" }
  });
});

test("unknown route returns a stable error", () => {
  const response = routeRequest("GET", "/missing");
  assert.equal(response, null);
});

test("customer bootstrap and protected user listing work through the API", async () => {
  const registry = new Registry();
  const customerResponse = await handleRequest(request("POST", "/v1/customers", {
    legalName: "API Ltda", tradingName: "API", taxId: "12.345.678/0001-90",
    email: "api@test.dev", phone: "123", address: {}, businessClassification: "software"
  }), registry);
  assert.equal(customerResponse.status, 201);

  const ownerResponse = await handleRequest(request("POST", `/v1/customers/${customerResponse.body.id}/users`, {
    name: "Owner", email: "owner@test.dev", role: "owner"
  }), registry);
  assert.equal(ownerResponse.status, 201);

  const usersResponse = await handleRequest(request("GET", `/v1/customers/${customerResponse.body.id}/users`, undefined, {
    "x-actor-id": ownerResponse.body.id
  }), registry);
  assert.equal(usersResponse.status, 200);
  assert.equal(usersResponse.body.length, 1);
});

test("customer reads reject actors from another tenant", async () => {
  const registry = new Registry();
  const first = registry.createCustomer({ legalName: "First Ltda", tradingName: "First", taxId: "123.456.789-01", email: "first@test.dev", phone: "123", address: {}, businessClassification: "services" });
  const second = registry.createCustomer({ legalName: "Second Ltda", tradingName: "Second", taxId: "98.765.432/0001-10", email: "second@test.dev", phone: "456", address: {}, businessClassification: "services" });
  const owner = registry.createUser(first.id, { name: "Owner", email: "owner@first.test", role: "owner" });
  await assert.rejects(() => handleRequest(request("GET", `/v1/customers/${second.id}`, undefined, { "x-actor-id": owner.id }), registry), (error) => error.code === "forbidden");
});

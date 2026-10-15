import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { DomainError, Registry } from "@payments/domain";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const host = process.env.HOST ?? "127.0.0.1";

export function routeRequest(method, url) {
  if (method === "GET" && url === "/health") return { status: 200, body: { status: "ok" } };
  if (method === "GET" && url === "/v1") {
    return { status: 200, body: { service: "payment-platform-api", version: "0.2.0", capabilities: ["customers", "merchants", "users", "bank-accounts", "payment-methods", "credentials"] } };
  }
  return null;
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_000_000) throw new DomainError("payload_too_large", "Request body is too large", 413);
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new DomainError("invalid_json", "Request body must be valid JSON", 400);
  }
}

const output = (status, body) => ({ status, body });
const actor = (request) => request.headers["x-actor-id"] ?? null;

export async function handleRequest(request, registry) {
  const basic = routeRequest(request.method, request.url);
  if (basic) return basic;
  const url = new URL(request.url, "http://localhost");
  const path = url.pathname;
  const body = ["POST", "PATCH", "PUT"].includes(request.method) ? await readJson(request) : {};
  let match;

  if (request.method === "POST" && path === "/v1/customers") return output(201, registry.createCustomer(body, actor(request)));
  if (request.method === "GET" && path === "/v1/customers") return output(200, [registry.customerForActor(actor(request))]);
  if ((match = path.match(/^\/v1\/customers\/([^/]+)$/))) {
    if (request.method === "GET") {
      registry.authorize(actor(request), match[1], "customers:read");
      return output(200, registry.getCustomer(match[1]));
    }
    if (request.method === "PATCH") {
      registry.authorize(actor(request), match[1], "customers:manage");
      return output(200, registry.updateCustomer(match[1], body, actor(request)));
    }
  }
  if ((match = path.match(/^\/v1\/customers\/([^/]+)\/merchants$/))) {
    if (request.method === "POST") {
      registry.authorize(actor(request), match[1], "merchants:manage");
      return output(201, registry.createMerchant(match[1], body, actor(request)));
    }
    if (request.method === "GET") {
      registry.authorize(actor(request), match[1], "merchants:read");
      return output(200, registry.listMerchants(match[1]));
    }
  }
  if ((match = path.match(/^\/v1\/customers\/([^/]+)\/merchants\/([^/]+)$/)) && request.method === "PATCH") {
    registry.authorize(actor(request), match[1], "merchants:manage", match[2]);
    return output(200, registry.updateMerchant(match[2], match[1], body, actor(request)));
  }
  if ((match = path.match(/^\/v1\/customers\/([^/]+)\/merchants\/([^/]+)$/)) && request.method === "GET") {
    registry.authorize(actor(request), match[1], "merchants:read", match[2]);
    return output(200, registry.getMerchant(match[2], match[1]));
  }
  if ((match = path.match(/^\/v1\/customers\/([^/]+)\/users$/))) {
    if (request.method === "POST") return output(201, registry.createUser(match[1], body, actor(request)));
    if (request.method === "GET") return output(200, registry.listUsers(match[1], actor(request)));
  }
  if ((match = path.match(/^\/v1\/customers\/([^/]+)\/users\/([^/]+)$/)) && request.method === "PATCH") return output(200, registry.updateUser(match[2], match[1], body, actor(request)));
  if ((match = path.match(/^\/v1\/customers\/([^/]+)\/users\/([^/]+)$/)) && request.method === "GET") return output(200, registry.getUser(match[2], match[1], actor(request)));
  if ((match = path.match(/^\/v1\/customers\/([^/]+)\/bank-accounts$/))) {
    if (request.method === "POST") return output(201, registry.createBankAccount(match[1], body, actor(request)));
    if (request.method === "GET") return output(200, registry.listBankAccounts(match[1], actor(request)));
  }
  if ((match = path.match(/^\/v1\/customers\/([^/]+)\/bank-accounts\/([^/]+)\/status$/)) && request.method === "PATCH") return output(200, registry.updateBankAccountStatus(match[2], match[1], body.status, actor(request)));
  if ((match = path.match(/^\/v1\/customers\/([^/]+)\/bank-accounts\/([^/]+)$/))) {
    if (request.method === "GET") return output(200, registry.getBankAccount(match[2], match[1], actor(request)));
    if (request.method === "PATCH") return output(200, registry.updateBankAccount(match[2], match[1], body, actor(request)));
  }
  if ((match = path.match(/^\/v1\/customers\/([^/]+)\/payment-methods$/))) {
    if (request.method === "POST") return output(201, registry.configurePaymentMethod(match[1], body, actor(request)));
    if (request.method === "GET") return output(200, registry.listPaymentMethods(match[1], actor(request), url.searchParams.get("merchantId")));
  }
  if ((match = path.match(/^\/v1\/customers\/([^/]+)\/merchants\/([^/]+)\/payment-methods\/effective$/)) && request.method === "GET") return output(200, registry.effectivePaymentMethods(match[1], match[2], actor(request)));
  if ((match = path.match(/^\/v1\/customers\/([^/]+)\/payment-methods\/([^/]+)$/)) && request.method === "PATCH") return output(200, registry.updatePaymentMethod(match[2], match[1], body, actor(request)));
  if ((match = path.match(/^\/v1\/customers\/([^/]+)\/credentials$/))) {
    if (request.method === "POST") return output(201, registry.createCredential(match[1], body, actor(request)));
    if (request.method === "GET") return output(200, registry.listCredentials(match[1], actor(request)));
  }
  if ((match = path.match(/^\/v1\/customers\/([^/]+)\/credentials\/([^/]+)\/(rotate|revoke)$/)) && request.method === "POST") return output(200, match[3] === "rotate" ? registry.rotateCredential(match[2], match[1], actor(request)) : registry.revokeCredential(match[2], match[1], actor(request)));
  if ((match = path.match(/^\/v1\/customers\/([^/]+)\/credentials\/([^/]+)$/)) && request.method === "GET") return output(200, registry.getCredential(match[2], match[1], actor(request)));
  return output(404, { error: { code: "route_not_found", message: "Route not found" } });
}

export function createApiServer({ registry = new Registry() } = {}) {
  return createServer(async (request, response) => {
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.setHeader("x-content-type-options", "nosniff");
    try {
      const result = await handleRequest(request, registry);
      response.writeHead(result.status);
      response.end(JSON.stringify(result.body));
    } catch (error) {
      const known = error instanceof DomainError;
      response.writeHead(known ? error.status : 500);
      response.end(JSON.stringify({ error: { code: known ? error.code : "internal_error", message: known ? error.message : "Internal server error", ...(known && error.details ? { details: error.details } : {}) } }));
    }
  });
}

const isEntryPoint = process.argv[1] === fileURLToPath(import.meta.url);
if (isEntryPoint) createApiServer().listen(port, host, () => console.log(`payment-platform-api listening on http://${host}:${port}`));

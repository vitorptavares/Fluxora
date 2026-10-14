import { randomUUID } from "node:crypto";
import {
  getCustomer,
  getEstablishment,
  registerCustomer,
  registerEstablishment
} from "@payments/domain";
import { errorResponse, fromDomainError } from "./http/errors.js";
import { InMemoryIdempotencyStore, InMemoryTenantRepository } from "./infrastructure/memory-store.js";

const TENANT_ID = /^[A-Za-z0-9_-]{1,64}$/;
const IDEMPOTENCY_KEY = /^[\x21-\x7E]{1,255}$/;

function header(headers, name) {
  const value = headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}

function parseLimit(raw) {
  if (raw === null) {
    return 20;
  }
  const limit = Number(raw);
  return Number.isInteger(limit) && limit >= 1 && limit <= 100 ? limit : null;
}

/**
 * Monta a aplicacao com suas dependencias. Testes injetam relogio e gerador
 * de ids deterministicos; producao usa os padroes.
 */
export function createApp({
  clock = () => new Date(),
  idGenerator = (prefix) => `${prefix}_${randomUUID()}`,
  customers = new InMemoryTenantRepository(),
  establishments = new InMemoryTenantRepository(),
  idempotency = new InMemoryIdempotencyStore()
} = {}) {
  const resources = {
    customers: {
      repository: customers,
      register: registerCustomer,
      get: getCustomer
    },
    establishments: {
      repository: establishments,
      register: registerEstablishment,
      get: getEstablishment
    }
  };

  function create(resource, request, tenantId, scope) {
    if (request.bodyError) {
      return errorResponse(400, "invalid_json", "Request body must be valid JSON");
    }
    if (request.body === null || typeof request.body !== "object" || Array.isArray(request.body)) {
      return errorResponse(400, "invalid_body", "Request body must be a JSON object");
    }

    const idempotencyKey = header(request.headers, "idempotency-key");
    if (!idempotencyKey || !IDEMPOTENCY_KEY.test(idempotencyKey)) {
      return errorResponse(
        400,
        "idempotency_key_required",
        "Idempotency-Key header is required for mutating requests"
      );
    }

    const fingerprint = InMemoryIdempotencyStore.fingerprint(request.body);
    const previous = idempotency.get(tenantId, scope, idempotencyKey);
    if (previous) {
      if (previous.fingerprint !== fingerprint) {
        return errorResponse(
          409,
          "idempotency_key_reused",
          "Idempotency-Key was already used with a different request body"
        );
      }
      return { ...previous.response, headers: { "idempotent-replayed": "true" } };
    }

    let response;
    try {
      const entity = resource.register(resource.repository, request.body, {
        tenantId,
        idGenerator,
        clock
      });
      response = { status: 201, body: entity };
    } catch (error) {
      // Erros de validacao nao sao memorizados: o cliente pode corrigir o
      // corpo e reenviar com a mesma chave. Conflitos sao memorizados para
      // que retries recebam sempre a mesma resposta.
      response = fromDomainError(error);
      if (response.status === 422) {
        return response;
      }
    }

    idempotency.save(tenantId, scope, idempotencyKey, { fingerprint, response });
    return response;
  }

  function list(resource, tenantId, searchParams) {
    const limit = parseLimit(searchParams.get("limit"));
    if (limit === null) {
      return errorResponse(400, "invalid_parameter", "limit must be an integer between 1 and 100");
    }
    const startingAfter = searchParams.get("starting_after") ?? undefined;
    const page = resource.repository.list(tenantId, { limit, startingAfter });
    return { status: 200, body: { object: "list", data: page.data, hasMore: page.hasMore } };
  }

  function retrieve(resource, tenantId, id) {
    try {
      return { status: 200, body: resource.get(resource.repository, { tenantId, id }) };
    } catch (error) {
      return fromDomainError(error);
    }
  }

  function routeRequest(method, rawUrl, request = {}) {
    const url = new URL(rawUrl, "http://localhost");
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (method === "GET" && path === "/health") {
      return { status: 200, body: { status: "ok" } };
    }

    if (method === "GET" && path === "/v1") {
      return {
        status: 200,
        body: {
          service: "payment-platform-api",
          version: "0.1.0",
          capabilities: ["accounts", "customers", "establishments", "payments", "ledger"]
        }
      };
    }

    const match = /^\/v1\/(customers|establishments)(?:\/([^/]+))?$/.exec(path);
    if (!match) {
      return errorResponse(404, "route_not_found", "Route not found");
    }

    const [, resourceName, id] = match;
    const resource = resources[resourceName];
    const allowed = id ? ["GET"] : ["GET", "POST"];
    if (!allowed.includes(method)) {
      return {
        ...errorResponse(405, "method_not_allowed", "Method not allowed"),
        headers: { allow: allowed.join(", ") }
      };
    }

    // Ate a autenticacao por chave de API (PP-004), o tenant e informado
    // explicitamente por cabecalho.
    const tenantId = header(request.headers, "x-tenant-id");
    if (!tenantId || !TENANT_ID.test(tenantId)) {
      return errorResponse(400, "tenant_required", "X-Tenant-Id header is required");
    }

    if (method === "POST") {
      return create(resource, request, tenantId, `POST ${path}`);
    }
    if (id) {
      return retrieve(resource, tenantId, id);
    }
    return list(resource, tenantId, url.searchParams);
  }

  return { routeRequest };
}

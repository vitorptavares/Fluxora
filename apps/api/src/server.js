import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { errorResponse } from "./http/errors.js";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const MAX_BODY_BYTES = 1024 * 1024;

const defaultApp = createApp();

/** Mantido para compatibilidade: roteia usando a aplicacao padrao. */
export function routeRequest(method, url, request) {
  return defaultApp.routeRequest(method, url, request);
}

class PayloadTooLargeError extends Error {}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new PayloadTooLargeError();
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function toAppRequest(request) {
  if (request.method !== "POST") {
    return { headers: request.headers };
  }
  const raw = await readBody(request);
  try {
    return { headers: request.headers, body: raw.length === 0 ? null : JSON.parse(raw) };
  } catch {
    return { headers: request.headers, bodyError: true };
  }
}

export function createApiServer(app = defaultApp) {
  return createServer(async (request, response) => {
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.setHeader("x-content-type-options", "nosniff");

    let result;
    try {
      const appRequest = await toAppRequest(request);
      result = app.routeRequest(request.method, request.url, appRequest);
    } catch (error) {
      result =
        error instanceof PayloadTooLargeError
          ? errorResponse(413, "payload_too_large", "Request body exceeds 1 MiB")
          : errorResponse(500, "internal_error", "Unexpected error");
      if (!(error instanceof PayloadTooLargeError)) {
        // Somente o tipo do erro: nunca registrar corpo/cabecalhos da requisicao.
        console.error(JSON.stringify({ level: "error", event: "unhandled_error", type: error?.name }));
      }
    }

    for (const [name, value] of Object.entries(result.headers ?? {})) {
      response.setHeader(name, value);
    }
    response.writeHead(result.status);
    response.end(JSON.stringify(result.body));
  });
}

const isEntryPoint = process.argv[1] === fileURLToPath(import.meta.url);

if (isEntryPoint) {
  createApiServer().listen(port, () => {
    console.log(`payment-platform-api listening on http://localhost:${port}`);
  });
}

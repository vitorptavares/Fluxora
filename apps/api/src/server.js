import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);

export function routeRequest(method, url) {
  if (method === "GET" && url === "/health") {
    return { status: 200, body: { status: "ok" } };
  }

  if (method === "GET" && url === "/v1") {
    return {
      status: 200,
      body: {
        service: "payment-platform-api",
        version: "0.1.0",
        capabilities: ["accounts", "payments", "ledger"]
      }
    };
  }

  return {
    status: 404,
    body: { error: { code: "route_not_found", message: "Route not found" } }
  };
}

export function createApiServer() {
  return createServer((request, response) => {
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.setHeader("x-content-type-options", "nosniff");
    const result = routeRequest(request.method, request.url);
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

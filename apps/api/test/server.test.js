import assert from "node:assert/strict";
import test from "node:test";
import { routeRequest } from "../src/server.js";

test("GET /health reports readiness", () => {
  assert.deepEqual(routeRequest("GET", "/health"), {
    status: 200,
    body: { status: "ok" }
  });
});

test("unknown route returns a stable error", () => {
  const response = routeRequest("GET", "/missing");
  assert.equal(response.status, 404);
  assert.equal(response.body.error.code, "route_not_found");
});

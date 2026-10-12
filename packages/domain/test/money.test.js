import assert from "node:assert/strict";
import test from "node:test";
import { createMoney } from "../src/index.js";

test("creates immutable money in minor units", () => {
  assert.deepEqual(createMoney(1099), { amount: 1099, currency: "BRL" });
});

test("rejects floating point money", () => {
  assert.throws(() => createMoney(10.99), /safe integer/);
});


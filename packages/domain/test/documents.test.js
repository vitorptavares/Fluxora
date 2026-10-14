import assert from "node:assert/strict";
import test from "node:test";
import { isValidCnpj, isValidCpf, parseDocument } from "../src/index.js";

test("validates CPF check digits, with or without mask", () => {
  assert.equal(isValidCpf("529.982.247-25"), true);
  assert.equal(isValidCpf("52998224725"), true);
  assert.equal(isValidCpf("529.982.247-24"), false);
});

test("rejects CPF with repeated digits or wrong length", () => {
  assert.equal(isValidCpf("111.111.111-11"), false);
  assert.equal(isValidCpf("5299822472"), false);
});

test("validates numeric CNPJ", () => {
  assert.equal(isValidCnpj("11.222.333/0001-81"), true);
  assert.equal(isValidCnpj("11.222.333/0001-82"), false);
  assert.equal(isValidCnpj("00000000000000"), false);
});

test("validates alphanumeric CNPJ (IN RFB 2.229/2024)", () => {
  assert.equal(isValidCnpj("12.ABC.345/01DE-35"), true);
  assert.equal(isValidCnpj("12.abc.345/01de-35"), true);
  assert.equal(isValidCnpj("12ABC34501DE34"), false);
  assert.equal(isValidCnpj("12ABC34501DEA5"), false, "check digits must be numeric");
});

test("parseDocument detects type and normalizes", () => {
  assert.deepEqual(parseDocument("529.982.247-25"), { type: "cpf", number: "52998224725" });
  assert.deepEqual(parseDocument("12.abc.345/01de-35"), { type: "cnpj", number: "12ABC34501DE35" });
  assert.equal(parseDocument("123"), null);
  assert.equal(parseDocument(12345678909), null);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  createCustomer,
  createEstablishment,
  getCustomer,
  registerCustomer,
  registerEstablishment
} from "../src/index.js";

const context = { tenantId: "ten_1", id: "cus_1", now: new Date("2026-10-13T12:00:00Z") };

function fakeRepository() {
  const items = new Map();
  return {
    findById: (tenantId, id) => {
      const item = items.get(id);
      return item && item.tenantId === tenantId ? item : null;
    },
    findByDocument: (tenantId, number) =>
      [...items.values()].find((i) => i.tenantId === tenantId && i.document.number === number) ?? null,
    insert: (entity) => items.set(entity.id, entity)
  };
}

function sequence() {
  let next = 0;
  return (prefix) => `${prefix}_${++next}`;
}

const validEstablishment = {
  legalName: "Clinica Exemplo Ltda",
  tradeName: "Clinica Exemplo",
  document: "11.222.333/0001-81",
  mcc: "8011",
  email: "Financeiro@Clinica.com.br",
  phone: "(92) 98765-4321",
  address: {
    street: "Av. Djalma Batista",
    number: "1000",
    district: "Chapada",
    city: "Manaus",
    state: "am",
    postalCode: "69050-010"
  }
};

test("creates an individual customer from a CPF", () => {
  const customer = createCustomer(
    { name: "  Maria   Silva ", email: "Maria@Example.com", document: "529.982.247-25" },
    context
  );
  assert.equal(customer.type, "individual");
  assert.equal(customer.name, "Maria Silva");
  assert.equal(customer.email, "maria@example.com");
  assert.deepEqual(customer.document, { type: "cpf", number: "52998224725" });
  assert.equal(customer.status, "active");
  assert.equal(customer.createdAt, "2026-10-13T12:00:00.000Z");
  assert.ok(Object.isFrozen(customer));
});

test("creates a company customer from a CNPJ and normalizes phone to E.164", () => {
  const customer = createCustomer(
    { name: "ACME", email: "a@acme.com", document: "11222333000181", phone: "11 98765-4321" },
    context
  );
  assert.equal(customer.type, "company");
  assert.equal(customer.phone, "+5511987654321");
});

test("reports every invalid customer field at once", () => {
  assert.throws(
    () => createCustomer({ name: "", email: "nope", document: "123", phone: "12" }, context),
    (error) => {
      assert.ok(error instanceof ValidationError);
      assert.deepEqual(
        error.details.map((d) => d.field).sort(),
        ["document", "email", "name", "phone"]
      );
      return true;
    }
  );
});

test("rejects duplicate customer document within the same tenant only", () => {
  const repository = fakeRepository();
  const deps = { tenantId: "ten_1", idGenerator: sequence(), clock: () => context.now };
  const input = { name: "Maria", email: "m@x.com", document: "52998224725" };

  registerCustomer(repository, input, deps);
  assert.throws(() => registerCustomer(repository, input, deps), ConflictError);
  assert.doesNotThrow(() => registerCustomer(repository, input, { ...deps, tenantId: "ten_2" }));
});

test("getCustomer does not leak entities across tenants", () => {
  const repository = fakeRepository();
  const customer = registerCustomer(
    repository,
    { name: "Maria", email: "m@x.com", document: "52998224725" },
    { tenantId: "ten_1", idGenerator: sequence(), clock: () => context.now }
  );
  assert.equal(getCustomer(repository, { tenantId: "ten_1", id: customer.id }), customer);
  assert.throws(() => getCustomer(repository, { tenantId: "ten_2", id: customer.id }), NotFoundError);
});

test("creates an establishment pending review", () => {
  const establishment = createEstablishment(validEstablishment, { ...context, id: "est_1" });
  assert.equal(establishment.status, "pending_review");
  assert.equal(establishment.email, "financeiro@clinica.com.br");
  assert.equal(establishment.phone, "+5592987654321");
  assert.deepEqual(establishment.address, {
    street: "Av. Djalma Batista",
    number: "1000",
    district: "Chapada",
    city: "Manaus",
    state: "AM",
    postalCode: "69050010"
  });
});

test("tradeName defaults to legalName", () => {
  const { tradeName, ...input } = validEstablishment;
  const establishment = createEstablishment(input, { ...context, id: "est_1" });
  assert.equal(establishment.tradeName, "Clinica Exemplo Ltda");
});

test("establishment requires a CNPJ, MCC and complete address", () => {
  assert.throws(
    () =>
      createEstablishment(
        { ...validEstablishment, document: "529.982.247-25", mcc: "80", address: { street: "Rua" } },
        { ...context, id: "est_1" }
      ),
    (error) => {
      const fields = error.details.map((d) => d.field);
      assert.ok(fields.includes("document"));
      assert.ok(fields.includes("mcc"));
      assert.ok(fields.includes("address.postalCode"));
      assert.ok(fields.includes("address.state"));
      return true;
    }
  );
});

test("rejects duplicate establishment CNPJ in the tenant", () => {
  const repository = fakeRepository();
  const deps = { tenantId: "ten_1", idGenerator: sequence(), clock: () => context.now };
  registerEstablishment(repository, validEstablishment, deps);
  assert.throws(
    () => registerEstablishment(repository, { ...validEstablishment, document: "11222333000181" }, deps),
    { code: "establishment_already_registered" }
  );
});

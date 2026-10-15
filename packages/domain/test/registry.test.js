import assert from "node:assert/strict";
import test from "node:test";
import { Registry } from "../src/index.js";

function fixture() {
  let sequence = 0;
  const registry = new Registry({
    id: () => `id-${++sequence}`,
    now: () => "2026-10-15T12:00:00.000Z",
    secret: () => `secret-${++sequence}`
  });
  const customer = registry.createCustomer({
    legalName: "Fluxora Commerce Ltda",
    tradingName: "Fluxora Shop",
    taxId: "12.345.678/0001-90",
    email: "finance@fluxora.test",
    phone: "+55 11 99999-0000",
    address: { country: "BR", city: "Sao Paulo" },
    businessClassification: "retail"
  });
  const owner = registry.createUser(customer.id, { name: "Owner", email: "owner@fluxora.test", role: "owner" });
  return { registry, customer, owner };
}

function merchantInput(taxId = "98.765.432/0001-10") {
  return {
    legalName: "Merchant Ltda", tradingName: "Merchant", taxId,
    email: "merchant@fluxora.test", phone: "+55 11 98888-0000",
    address: { country: "BR", city: "Sao Paulo" }, businessClassification: "services"
  };
}

test("registers customers and merchants and rejects duplicate tax IDs", () => {
  const { registry, customer } = fixture();
  const merchant = registry.createMerchant(customer.id, merchantInput());
  assert.equal(merchant.customerId, customer.id);
  assert.equal(registry.listMerchants(customer.id).length, 1);
  assert.throws(() => registry.createMerchant(customer.id, merchantInput()), (error) => error.code === "duplicate_tax_id");
});

test("enforces customer and merchant lifecycle transitions", () => {
  const { registry, customer } = fixture();
  registry.updateCustomer(customer.id, { status: "active" });
  registry.updateCustomer(customer.id, { status: "closed" });
  assert.throws(() => registry.updateCustomer(customer.id, { status: "active" }), (error) => error.code === "invalid_status_transition");
  assert.throws(() => registry.createMerchant(customer.id, merchantInput()), (error) => error.code === "customer_closed");
});

test("manages users, permissions, merchant access, and the last owner rule", () => {
  const { registry, customer, owner } = fixture();
  const merchant = registry.createMerchant(customer.id, merchantInput());
  const operator = registry.createUser(customer.id, { name: "Operator", email: "operator@fluxora.test", role: "operator", merchantIds: [merchant.id] }, owner.id);
  assert.equal(registry.listUsers(customer.id, owner.id).length, 2);
  assert.throws(() => registry.listUsers(customer.id, operator.id), (error) => error.code === "forbidden");
  assert.throws(() => registry.updateUser(owner.id, customer.id, { status: "disabled" }, owner.id), (error) => error.code === "last_owner");
});

test("requires the first customer user to be an owner", () => {
  const registry = new Registry();
  const customer = registry.createCustomer({ legalName: "First Ltda", tradingName: "First", taxId: "123.456.789-01", email: "first@test.dev", phone: "123", address: {}, businessClassification: "services" });
  assert.throws(() => registry.createUser(customer.id, { name: "Viewer", email: "viewer@test.dev", role: "viewer" }), (error) => error.code === "owner_required");
});

test("keeps user and merchant data isolated by customer", () => {
  const { registry, customer, owner } = fixture();
  const other = registry.createCustomer({ legalName: "Other Ltda", tradingName: "Other", taxId: "111.222.333-44", email: "other@test.dev", phone: "123", address: {}, businessClassification: "services" });
  const otherOwner = registry.createUser(other.id, { name: "Other Owner", email: "owner@other.test", role: "owner" });
  assert.throws(() => registry.listUsers(other.id, owner.id), (error) => error.code === "forbidden");
  assert.throws(() => registry.listUsers(customer.id, otherOwner.id), (error) => error.code === "forbidden");
});

test("registers bank accounts without exposing raw financial details", () => {
  const { registry, customer, owner } = fixture();
  const account = registry.createBankAccount(customer.id, {
    ownerType: "customer", ownerId: customer.id, holderName: "Fluxora Commerce Ltda",
    holderTaxId: "12.345.678/0001-90", bankCode: "001", branchNumber: "1234",
    accountNumber: "98765432", accountCheckDigit: "1", accountType: "checking"
  }, owner.id);
  assert.equal(account.accountNumber, "****5432");
  assert.equal(account.holderTaxId, "***0190");
  assert.equal("fingerprint" in account, false);
  assert.throws(() => registry.createBankAccount(customer.id, {
    ownerType: "customer", ownerId: customer.id, holderName: "Fluxora Commerce Ltda",
    holderTaxId: "12.345.678/0001-90", bankCode: "001", branchNumber: "1234",
    accountNumber: "98765432", accountType: "checking"
  }, owner.id), (error) => error.code === "duplicate_bank_account");
});

test("resolves customer payment defaults and merchant overrides", () => {
  const { registry, customer, owner } = fixture();
  registry.updateCustomer(customer.id, { status: "active" });
  const merchant = registry.createMerchant(customer.id, merchantInput());
  registry.configurePaymentMethod(customer.id, { method: "pix", status: "enabled", settings: { expirationSeconds: 900 } }, owner.id);
  registry.configurePaymentMethod(customer.id, { merchantId: merchant.id, method: "pix", status: "disabled", settings: {} }, owner.id);
  const effective = registry.effectivePaymentMethods(customer.id, merchant.id, owner.id);
  assert.deepEqual(effective.find((item) => item.method === "pix"), { method: "pix", status: "disabled", settings: { expirationSeconds: 900 }, source: "merchant" });
  assert.throws(() => registry.configurePaymentMethod(customer.id, { method: "card", status: "enabled", settings: { installments: 25 } }, owner.id), (error) => error.code === "validation_error");
});

test("reveals credential secrets once and enforces rotation and revocation", () => {
  const { registry, customer, owner } = fixture();
  const created = registry.createCredential(customer.id, { name: "Checkout", environment: "sandbox", scopes: ["payments:create"] }, owner.id);
  assert.match(created.secret, /^flx_sandbox_/);
  assert.equal(registry.listCredentials(customer.id, owner.id)[0].secret, undefined);
  assert.equal(registry.authenticateCredential(created.secret, "payments:create").id, created.id);
  const rotated = registry.rotateCredential(created.id, customer.id, owner.id);
  assert.throws(() => registry.authenticateCredential(created.secret, "payments:create"), (error) => error.code === "invalid_credential");
  assert.equal(registry.authenticateCredential(rotated.secret, "payments:create").id, created.id);
  registry.revokeCredential(created.id, customer.id, owner.id);
  assert.throws(() => registry.authenticateCredential(rotated.secret, "payments:create"), (error) => error.code === "invalid_credential");
});

test("records auditable changes without credential secrets", () => {
  const { registry, customer, owner } = fixture();
  const created = registry.createCredential(customer.id, { name: "Reporting", environment: "production", scopes: ["financial:read"] }, owner.id);
  const serialized = JSON.stringify(registry.auditLog);
  assert.equal(serialized.includes(created.secret), false);
  assert.ok(registry.auditLog.some((event) => event.action === "credential.created" && event.actorId === owner.id));
});

import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { assertDomain, DomainError } from "./errors.js";

export const accountStatuses = Object.freeze(["pending", "active", "suspended", "closed"]);
export const userStatuses = Object.freeze(["active", "suspended", "disabled"]);
export const roles = Object.freeze(["owner", "admin", "financial", "operator", "viewer"]);
export const paymentMethods = Object.freeze(["pix", "card", "boleto"]);

export const rolePermissions = Object.freeze({
  owner: ["*"],
  admin: ["customers:read", "merchants:*", "users:*", "bank_accounts:*", "payment_methods:*", "credentials:*"],
  financial: ["customers:read", "merchants:read", "bank_accounts:*", "payment_methods:read", "credentials:read"],
  operator: ["customers:read", "merchants:read", "payment_methods:read"],
  viewer: ["customers:read", "merchants:read", "bank_accounts:read", "payment_methods:read", "credentials:read"]
});

const transitions = Object.freeze({
  pending: ["active", "closed"],
  active: ["suspended", "closed"],
  suspended: ["active", "closed"],
  closed: []
});

const bankTransitions = Object.freeze({
  pending_verification: ["verified", "rejected", "disabled"],
  verified: ["active", "disabled"],
  active: ["disabled"],
  rejected: ["disabled"],
  disabled: []
});

const credentialStatuses = Object.freeze(["active", "revoked"]);
const credentialScopes = Object.freeze([
  "payments:read",
  "payments:create",
  "financial:read",
  "merchants:manage"
]);

function text(value, field) {
  assertDomain(typeof value === "string" && value.trim(), "validation_error", `${field} is required`, 422, { field });
  return value.trim();
}

function email(value) {
  const normalized = text(value, "email").toLowerCase();
  assertDomain(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized), "validation_error", "email is invalid", 422, { field: "email" });
  return normalized;
}

function taxId(value) {
  const normalized = text(value, "taxId").replace(/\D/g, "");
  assertDomain(normalized.length >= 11 && normalized.length <= 14, "validation_error", "taxId is invalid", 422, { field: "taxId" });
  return normalized;
}

function status(value, supported, field = "status") {
  assertDomain(supported.includes(value), "validation_error", `${field} is invalid`, 422, { field });
  return value;
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function clone(value) {
  return structuredClone(value);
}

function hasPermission(role, requested) {
  return (rolePermissions[role] ?? []).some((permission) => {
    if (permission === "*") return true;
    if (permission === requested) return true;
    return permission.endsWith(":*") && requested.startsWith(permission.slice(0, -1));
  });
}

export class Registry {
  constructor({ id = randomUUID, now = () => new Date().toISOString(), secret = () => randomBytes(24).toString("base64url") } = {}) {
    this.id = id;
    this.now = now;
    this.secret = secret;
    this.customers = new Map();
    this.merchants = new Map();
    this.users = new Map();
    this.bankAccounts = new Map();
    this.paymentConfigurations = new Map();
    this.credentials = new Map();
    this.auditLog = [];
  }

  audit(action, resource, resourceId, actorId = null, metadata = {}) {
    this.auditLog.push({ id: this.id(), action, resource, resourceId, actorId, metadata, occurredAt: this.now() });
  }

  createCustomer(input, actorId = null) {
    const normalizedTaxId = taxId(input.taxId);
    assertDomain(![...this.customers.values()].some((item) => item.taxId === normalizedTaxId), "duplicate_tax_id", "A customer with this taxId already exists", 409);
    const timestamp = this.now();
    const customer = {
      id: this.id(),
      legalName: text(input.legalName, "legalName"),
      tradingName: text(input.tradingName, "tradingName"),
      taxId: normalizedTaxId,
      email: email(input.email),
      phone: text(input.phone, "phone"),
      address: clone(input.address ?? {}),
      businessClassification: text(input.businessClassification, "businessClassification"),
      status: "pending",
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.customers.set(customer.id, customer);
    this.audit("customer.created", "customer", customer.id, actorId);
    return clone(customer);
  }

  getCustomer(id) {
    const item = this.customers.get(id);
    assertDomain(item, "customer_not_found", "Customer not found", 404);
    return clone(item);
  }

  listCustomers() {
    return [...this.customers.values()].map(clone);
  }

  customerForActor(actorId) {
    const actor = this.users.get(actorId);
    assertDomain(actor && actor.status === "active", "forbidden", "Access denied", 403);
    return this.getCustomer(actor.customerId);
  }

  updateCustomer(id, changes, actorId = null) {
    const item = this.customers.get(id);
    assertDomain(item, "customer_not_found", "Customer not found", 404);
    if (changes.status && changes.status !== item.status) {
      assertDomain(transitions[item.status].includes(changes.status), "invalid_status_transition", `Cannot change customer status from ${item.status} to ${changes.status}`, 409);
      item.status = changes.status;
    }
    for (const field of ["legalName", "tradingName", "phone", "businessClassification"]) {
      if (changes[field] !== undefined) item[field] = text(changes[field], field);
    }
    if (changes.email !== undefined) item.email = email(changes.email);
    if (changes.address !== undefined) item.address = clone(changes.address);
    item.updatedAt = this.now();
    this.audit("customer.updated", "customer", id, actorId, { fields: Object.keys(changes) });
    return clone(item);
  }

  createMerchant(customerId, input, actorId = null) {
    const customer = this.customers.get(customerId);
    assertDomain(customer, "customer_not_found", "Customer not found", 404);
    assertDomain(customer.status !== "closed", "customer_closed", "A closed customer cannot receive merchants", 409);
    const normalizedTaxId = taxId(input.taxId);
    assertDomain(![...this.merchants.values()].some((item) => item.taxId === normalizedTaxId), "duplicate_tax_id", "A merchant with this taxId already exists", 409);
    const timestamp = this.now();
    const merchant = {
      id: this.id(), customerId,
      legalName: text(input.legalName, "legalName"),
      tradingName: text(input.tradingName, "tradingName"),
      taxId: normalizedTaxId,
      email: email(input.email),
      phone: text(input.phone, "phone"),
      address: clone(input.address ?? {}),
      businessClassification: text(input.businessClassification, "businessClassification"),
      status: "pending", createdAt: timestamp, updatedAt: timestamp
    };
    this.merchants.set(merchant.id, merchant);
    this.audit("merchant.created", "merchant", merchant.id, actorId, { customerId });
    return clone(merchant);
  }

  getMerchant(id, customerId) {
    const item = this.merchants.get(id);
    assertDomain(item && (!customerId || item.customerId === customerId), "merchant_not_found", "Merchant not found", 404);
    return clone(item);
  }

  listMerchants(customerId) {
    this.getCustomer(customerId);
    return [...this.merchants.values()].filter((item) => item.customerId === customerId).map(clone);
  }

  updateMerchant(id, customerId, changes, actorId = null) {
    const item = this.merchants.get(id);
    assertDomain(item && item.customerId === customerId, "merchant_not_found", "Merchant not found", 404);
    if (changes.status && changes.status !== item.status) {
      assertDomain(transitions[item.status].includes(changes.status), "invalid_status_transition", `Cannot change merchant status from ${item.status} to ${changes.status}`, 409);
      item.status = changes.status;
    }
    for (const field of ["legalName", "tradingName", "phone", "businessClassification"]) {
      if (changes[field] !== undefined) item[field] = text(changes[field], field);
    }
    if (changes.email !== undefined) item.email = email(changes.email);
    if (changes.address !== undefined) item.address = clone(changes.address);
    item.updatedAt = this.now();
    this.audit("merchant.updated", "merchant", id, actorId, { fields: Object.keys(changes) });
    return clone(item);
  }

  createUser(customerId, input, actorId = null) {
    const customer = this.customers.get(customerId);
    assertDomain(customer && customer.status !== "closed", "customer_not_available", "Customer is not available", 409);
    const normalizedEmail = email(input.email);
    assertDomain(![...this.users.values()].some((item) => item.customerId === customerId && item.email === normalizedEmail), "duplicate_email", "A user with this email already exists", 409);
    status(input.role, roles, "role");
    if (actorId) this.authorize(actorId, customerId, "users:manage");
    else {
      assertDomain(![...this.users.values()].some((item) => item.customerId === customerId), "authorization_required", "An actor is required", 403);
      assertDomain(input.role === "owner", "owner_required", "The first customer user must be an owner", 422);
    }
    const merchantIds = [...new Set(input.merchantIds ?? [])];
    merchantIds.forEach((merchantId) => this.getMerchant(merchantId, customerId));
    const timestamp = this.now();
    const user = { id: this.id(), customerId, name: text(input.name, "name"), email: normalizedEmail, role: input.role, merchantIds, status: "active", createdAt: timestamp, updatedAt: timestamp };
    this.users.set(user.id, user);
    this.audit("user.created", "user", user.id, actorId, { customerId, role: user.role });
    return clone(user);
  }

  authorize(actorId, customerId, permission, merchantId) {
    const actor = this.users.get(actorId);
    assertDomain(actor && actor.status === "active" && actor.customerId === customerId, "forbidden", "Access denied", 403);
    assertDomain(hasPermission(actor.role, permission), "forbidden", "Access denied", 403);
    if (merchantId && actor.merchantIds.length) assertDomain(actor.merchantIds.includes(merchantId), "forbidden", "Access denied", 403);
    return actor;
  }

  listUsers(customerId, actorId) {
    this.authorize(actorId, customerId, "users:read");
    return [...this.users.values()].filter((item) => item.customerId === customerId).map(clone);
  }

  getUser(id, customerId, actorId) {
    this.authorize(actorId, customerId, "users:read");
    const user = this.users.get(id);
    assertDomain(user && user.customerId === customerId, "user_not_found", "User not found", 404);
    return clone(user);
  }

  updateUser(id, customerId, changes, actorId) {
    const actor = this.authorize(actorId, customerId, "users:manage");
    const user = this.users.get(id);
    assertDomain(user && user.customerId === customerId, "user_not_found", "User not found", 404);
    if (changes.role && changes.role !== user.role) {
      status(changes.role, roles, "role");
      assertDomain(actor.role === "owner", "forbidden", "Only an owner can change roles", 403);
      user.role = changes.role;
    }
    if (changes.status && changes.status !== user.status) {
      status(changes.status, userStatuses);
      if (user.role === "owner" && changes.status !== "active") {
        const otherOwners = [...this.users.values()].filter((item) => item.customerId === customerId && item.id !== id && item.role === "owner" && item.status === "active");
        assertDomain(otherOwners.length > 0, "last_owner", "The last active owner cannot be disabled", 409);
      }
      user.status = changes.status;
    }
    if (changes.name !== undefined) user.name = text(changes.name, "name");
    if (changes.merchantIds !== undefined) {
      changes.merchantIds.forEach((merchantId) => this.getMerchant(merchantId, customerId));
      user.merchantIds = [...new Set(changes.merchantIds)];
    }
    user.updatedAt = this.now();
    this.audit("user.updated", "user", id, actorId, { fields: Object.keys(changes) });
    return clone(user);
  }

  createBankAccount(customerId, input, actorId) {
    this.authorize(actorId, customerId, "bank_accounts:manage");
    const owner = input.ownerType === "customer" ? this.customers.get(input.ownerId) : this.merchants.get(input.ownerId);
    assertDomain(["customer", "merchant"].includes(input.ownerType) && owner && (input.ownerType === "customer" ? owner.id : owner.customerId) === customerId, "account_owner_not_found", "Bank account owner not found", 404);
    const bankCode = text(input.bankCode, "bankCode").replace(/\D/g, "");
    const branchNumber = text(input.branchNumber, "branchNumber").replace(/\D/g, "");
    const accountNumber = text(input.accountNumber, "accountNumber").replace(/\D/g, "");
    const fingerprint = hash(`${bankCode}:${branchNumber}:${accountNumber}:${input.ownerId}`);
    assertDomain(![...this.bankAccounts.values()].some((item) => item.fingerprint === fingerprint), "duplicate_bank_account", "This bank account is already registered", 409);
    assertDomain(["checking", "savings"].includes(input.accountType), "validation_error", "accountType is invalid", 422);
    const timestamp = this.now();
    const item = { id: this.id(), customerId, ownerType: input.ownerType, ownerId: input.ownerId, holderName: text(input.holderName, "holderName"), holderTaxId: taxId(input.holderTaxId), bankCode, branchNumber, branchCheckDigit: input.branchCheckDigit ?? null, accountLast4: accountNumber.slice(-4).padStart(4, "*"), accountCheckDigit: input.accountCheckDigit ?? null, accountType: input.accountType, fingerprint, status: "pending_verification", createdAt: timestamp, updatedAt: timestamp };
    this.bankAccounts.set(item.id, item);
    this.audit("bank_account.created", "bank_account", item.id, actorId, { ownerType: item.ownerType, ownerId: item.ownerId });
    return this.publicBankAccount(item);
  }

  publicBankAccount(item) {
    const { fingerprint, holderTaxId, ...safe } = item;
    return { ...clone(safe), holderTaxId: `***${holderTaxId.slice(-4)}`, accountNumber: `****${item.accountLast4}` };
  }

  listBankAccounts(customerId, actorId) {
    this.authorize(actorId, customerId, "bank_accounts:read");
    return [...this.bankAccounts.values()].filter((item) => item.customerId === customerId).map((item) => this.publicBankAccount(item));
  }

  getBankAccount(id, customerId, actorId) {
    this.authorize(actorId, customerId, "bank_accounts:read");
    const item = this.bankAccounts.get(id);
    assertDomain(item && item.customerId === customerId, "bank_account_not_found", "Bank account not found", 404);
    return this.publicBankAccount(item);
  }

  updateBankAccount(id, customerId, changes, actorId) {
    this.authorize(actorId, customerId, "bank_accounts:manage");
    const item = this.bankAccounts.get(id);
    assertDomain(item && item.customerId === customerId, "bank_account_not_found", "Bank account not found", 404);
    assertDomain(item.status === "pending_verification", "verified_account_immutable", "Verified or finalized bank details cannot be edited", 409);
    if (changes.holderName !== undefined) item.holderName = text(changes.holderName, "holderName");
    if (changes.holderTaxId !== undefined) item.holderTaxId = taxId(changes.holderTaxId);
    const changesCoordinates = ["bankCode", "branchNumber", "accountNumber"].some((field) => changes[field] !== undefined);
    if (changesCoordinates) {
      const bankCode = text(changes.bankCode, "bankCode").replace(/\D/g, "");
      const branchNumber = text(changes.branchNumber, "branchNumber").replace(/\D/g, "");
      const accountNumber = text(changes.accountNumber, "accountNumber").replace(/\D/g, "");
      const fingerprint = hash(`${bankCode}:${branchNumber}:${accountNumber}:${item.ownerId}`);
      assertDomain(![...this.bankAccounts.values()].some((candidate) => candidate.id !== id && candidate.fingerprint === fingerprint), "duplicate_bank_account", "This bank account is already registered", 409);
      item.bankCode = bankCode;
      item.branchNumber = branchNumber;
      item.accountLast4 = accountNumber.slice(-4).padStart(4, "*");
      item.fingerprint = fingerprint;
    }
    if (changes.accountType !== undefined) {
      assertDomain(["checking", "savings"].includes(changes.accountType), "validation_error", "accountType is invalid", 422);
      item.accountType = changes.accountType;
    }
    if (changes.branchCheckDigit !== undefined) item.branchCheckDigit = changes.branchCheckDigit;
    if (changes.accountCheckDigit !== undefined) item.accountCheckDigit = changes.accountCheckDigit;
    item.updatedAt = this.now();
    this.audit("bank_account.updated", "bank_account", id, actorId, { fields: Object.keys(changes) });
    return this.publicBankAccount(item);
  }

  updateBankAccountStatus(id, customerId, nextStatus, actorId) {
    this.authorize(actorId, customerId, "bank_accounts:manage");
    const item = this.bankAccounts.get(id);
    assertDomain(item && item.customerId === customerId, "bank_account_not_found", "Bank account not found", 404);
    assertDomain((bankTransitions[item.status] ?? []).includes(nextStatus), "invalid_status_transition", `Cannot change bank account status from ${item.status} to ${nextStatus}`, 409);
    item.status = nextStatus;
    item.updatedAt = this.now();
    this.audit("bank_account.status_changed", "bank_account", id, actorId, { status: nextStatus });
    return this.publicBankAccount(item);
  }

  validatePaymentSettings(method, settings) {
    const value = clone(settings ?? {});
    if (method === "card" && value.installments !== undefined) assertDomain(Number.isInteger(value.installments) && value.installments >= 1 && value.installments <= 24, "validation_error", "card installments must be between 1 and 24", 422);
    if (method === "pix" && value.expirationSeconds !== undefined) assertDomain(Number.isInteger(value.expirationSeconds) && value.expirationSeconds >= 60, "validation_error", "pix expirationSeconds must be at least 60", 422);
    if (method === "boleto" && value.expirationDays !== undefined) assertDomain(Number.isInteger(value.expirationDays) && value.expirationDays >= 1, "validation_error", "boleto expirationDays must be positive", 422);
    return value;
  }

  configurePaymentMethod(customerId, input, actorId) {
    this.authorize(actorId, customerId, "payment_methods:manage", input.merchantId);
    const customer = this.customers.get(customerId);
    assertDomain(customer && !["suspended", "closed"].includes(customer.status), "customer_not_available", "Customer cannot enable payment methods", 409);
    status(input.method, paymentMethods, "method");
    status(input.status, ["enabled", "disabled"]);
    if (input.merchantId) this.getMerchant(input.merchantId, customerId);
    const duplicate = [...this.paymentConfigurations.values()].find((item) => item.customerId === customerId && item.merchantId === (input.merchantId ?? null) && item.method === input.method);
    assertDomain(!duplicate, "duplicate_payment_configuration", "Payment method is already configured", 409);
    const timestamp = this.now();
    const item = { id: this.id(), customerId, merchantId: input.merchantId ?? null, method: input.method, status: input.status, settings: this.validatePaymentSettings(input.method, input.settings), createdAt: timestamp, updatedAt: timestamp };
    this.paymentConfigurations.set(item.id, item);
    this.audit("payment_method.configured", "payment_configuration", item.id, actorId, { method: item.method });
    return clone(item);
  }

  listPaymentMethods(customerId, actorId, merchantId = null) {
    this.authorize(actorId, customerId, "payment_methods:read", merchantId);
    return [...this.paymentConfigurations.values()].filter((item) => item.customerId === customerId && (merchantId === null || item.merchantId === merchantId)).map(clone);
  }

  updatePaymentMethod(id, customerId, changes, actorId) {
    const item = this.paymentConfigurations.get(id);
    assertDomain(item && item.customerId === customerId, "payment_configuration_not_found", "Payment configuration not found", 404);
    this.authorize(actorId, customerId, "payment_methods:manage", item.merchantId);
    if (changes.status !== undefined) item.status = status(changes.status, ["enabled", "disabled"]);
    if (changes.settings !== undefined) item.settings = this.validatePaymentSettings(item.method, changes.settings);
    item.updatedAt = this.now();
    this.audit("payment_method.updated", "payment_configuration", id, actorId, { fields: Object.keys(changes) });
    return clone(item);
  }

  effectivePaymentMethods(customerId, merchantId, actorId) {
    this.authorize(actorId, customerId, "payment_methods:read", merchantId);
    this.getMerchant(merchantId, customerId);
    return paymentMethods.map((method) => {
      const parent = [...this.paymentConfigurations.values()].find((item) => item.customerId === customerId && item.merchantId === null && item.method === method);
      const override = [...this.paymentConfigurations.values()].find((item) => item.customerId === customerId && item.merchantId === merchantId && item.method === method);
      if (!parent) return { method, status: "disabled", settings: {}, source: "default" };
      if (parent.status === "disabled") return { method, status: "disabled", settings: clone(parent.settings), source: "customer" };
      return { method, status: override?.status ?? parent.status, settings: { ...clone(parent.settings), ...clone(override?.settings ?? {}) }, source: override ? "merchant" : "customer" };
    });
  }

  createCredential(customerId, input, actorId) {
    this.authorize(actorId, customerId, "credentials:manage", input.merchantId);
    status(input.environment, ["sandbox", "production"], "environment");
    const scopes = [...new Set(input.scopes ?? [])];
    assertDomain(scopes.length > 0 && scopes.every((scope) => credentialScopes.includes(scope)), "validation_error", "One or more credential scopes are invalid", 422);
    if (input.merchantId) this.getMerchant(input.merchantId, customerId);
    const publicId = `cred_${this.id()}`;
    const rawSecret = `flx_${input.environment}_${this.secret()}`;
    const timestamp = this.now();
    const item = { id: publicId, customerId, merchantId: input.merchantId ?? null, name: text(input.name, "name"), environment: input.environment, scopes, secretHash: hash(rawSecret), secretPrefix: rawSecret.slice(0, 16), secretLast4: rawSecret.slice(-4), status: "active", expiresAt: input.expiresAt ?? null, createdAt: timestamp, updatedAt: timestamp };
    this.credentials.set(item.id, item);
    this.audit("credential.created", "credential", item.id, actorId, { environment: item.environment, scopes });
    return { ...this.publicCredential(item), secret: rawSecret };
  }

  publicCredential(item) {
    const { secretHash, ...safe } = item;
    return { ...clone(safe), maskedSecret: `${item.secretPrefix}...${item.secretLast4}` };
  }

  listCredentials(customerId, actorId) {
    this.authorize(actorId, customerId, "credentials:read");
    return [...this.credentials.values()].filter((item) => item.customerId === customerId).map((item) => this.publicCredential(item));
  }

  getCredential(id, customerId, actorId) {
    this.authorize(actorId, customerId, "credentials:read");
    const item = this.credentials.get(id);
    assertDomain(item && item.customerId === customerId, "credential_not_found", "Credential not found", 404);
    return this.publicCredential(item);
  }

  rotateCredential(id, customerId, actorId) {
    this.authorize(actorId, customerId, "credentials:manage");
    const item = this.credentials.get(id);
    assertDomain(item && item.customerId === customerId, "credential_not_found", "Credential not found", 404);
    assertDomain(item.status === "active", "credential_not_active", "Credential is not active", 409);
    const rawSecret = `flx_${item.environment}_${this.secret()}`;
    item.secretHash = hash(rawSecret);
    item.secretPrefix = rawSecret.slice(0, 16);
    item.secretLast4 = rawSecret.slice(-4);
    item.updatedAt = this.now();
    this.audit("credential.rotated", "credential", id, actorId);
    return { ...this.publicCredential(item), secret: rawSecret };
  }

  revokeCredential(id, customerId, actorId) {
    this.authorize(actorId, customerId, "credentials:manage");
    const item = this.credentials.get(id);
    assertDomain(item && item.customerId === customerId, "credential_not_found", "Credential not found", 404);
    status(item.status, credentialStatuses);
    assertDomain(item.status === "active", "credential_not_active", "Credential is not active", 409);
    item.status = "revoked";
    item.updatedAt = this.now();
    this.audit("credential.revoked", "credential", id, actorId);
    return this.publicCredential(item);
  }

  authenticateCredential(rawSecret, requiredScope) {
    const supplied = Buffer.from(hash(rawSecret));
    const item = [...this.credentials.values()].find((candidate) => timingSafeEqual(Buffer.from(candidate.secretHash), supplied));
    assertDomain(item && item.status === "active" && (!item.expiresAt || Date.parse(item.expiresAt) > Date.parse(this.now())), "invalid_credential", "Invalid credential", 401);
    assertDomain(item.scopes.includes(requiredScope), "insufficient_scope", "Credential does not allow this operation", 403);
    return this.publicCredential(item);
  }
}

export { DomainError };


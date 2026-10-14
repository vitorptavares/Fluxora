import { ConflictError, NotFoundError, Validator } from "../errors.js";
import { documentTypes, parseDocument } from "./documents.js";
import { optionalPhone, optionalText, requiredAddress, requiredEmail, requiredText } from "./fields.js";

/**
 * Estabelecimento: pessoa juridica (CNPJ) que recebe pagamentos atraves de
 * um tenant. Nasce em `pending_review` porque so pode transacionar apos o
 * KYC (proximo incremento do onboarding).
 */

export const establishmentStatuses = Object.freeze([
  "pending_review",
  "active",
  "suspended",
  "closed"
]);

export function validateEstablishmentInput(input) {
  const validator = new Validator();
  const data = input ?? {};

  const legalName = requiredText(validator, "legalName", data.legalName, { min: 2, max: 150 });
  const tradeName = optionalText(validator, "tradeName", data.tradeName, { min: 1, max: 150 });
  const email = requiredEmail(validator, "email", data.email);
  const phone = optionalPhone(validator, "phone", data.phone);
  const address = requiredAddress(validator, "address", data.address);

  let mcc;
  if (typeof data.mcc !== "string" || !/^\d{4}$/.test(data.mcc)) {
    validator.add("mcc", "invalid_format", "mcc must be a 4-digit Merchant Category Code");
  } else {
    mcc = data.mcc;
  }

  let document;
  if (data.document === undefined || data.document === null || data.document === "") {
    validator.add("document", "required", "document is required");
  } else {
    document = parseDocument(data.document);
    if (document === null || document.type !== documentTypes.CNPJ) {
      validator.add("document", "invalid_document", "document must be a valid CNPJ");
      document = undefined;
    }
  }

  validator.throwIfInvalid();
  return { legalName, tradeName, email, phone, address, mcc, document };
}

export function createEstablishment(input, { tenantId, id, now }) {
  const validator = new Validator();
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    validator.add("tenantId", "required", "tenantId is required");
  }
  validator.throwIfInvalid();

  const fields = validateEstablishmentInput(input);
  const timestamp = now.toISOString();

  const establishment = {
    id,
    tenantId,
    legalName: fields.legalName,
    tradeName: fields.tradeName ?? fields.legalName,
    document: fields.document,
    mcc: fields.mcc,
    email: fields.email,
    address: fields.address,
    status: "pending_review",
    createdAt: timestamp,
    updatedAt: timestamp
  };
  if (fields.phone !== undefined) {
    establishment.phone = fields.phone;
  }
  return Object.freeze(establishment);
}

export function registerEstablishment(repository, input, { tenantId, idGenerator, clock }) {
  const establishment = createEstablishment(input, {
    tenantId,
    id: idGenerator("est"),
    now: clock()
  });

  if (repository.findByDocument(tenantId, establishment.document.number)) {
    throw new ConflictError(
      "establishment_already_registered",
      "An establishment with this CNPJ is already registered for the tenant"
    );
  }

  repository.insert(establishment);
  return establishment;
}

export function getEstablishment(repository, { tenantId, id }) {
  const establishment = repository.findById(tenantId, id);
  if (!establishment) {
    throw new NotFoundError("establishment_not_found", "Establishment not found");
  }
  return establishment;
}

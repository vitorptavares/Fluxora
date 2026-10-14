import { ConflictError, NotFoundError, Validator } from "../errors.js";
import { documentTypes, parseDocument } from "./documents.js";
import { optionalPhone, requiredEmail, requiredText } from "./fields.js";

/**
 * Cliente: pessoa fisica (CPF) ou juridica (CNPJ) que paga por produtos ou
 * servicos dos estabelecimentos de um tenant.
 */

export const customerTypes = Object.freeze({ INDIVIDUAL: "individual", COMPANY: "company" });
export const customerStatuses = Object.freeze(["active", "blocked"]);

function validateTenant(validator, tenantId) {
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    validator.add("tenantId", "required", "tenantId is required");
  }
}

export function validateCustomerInput(input) {
  const validator = new Validator();
  const data = input ?? {};

  const name = requiredText(validator, "name", data.name, { min: 2, max: 150 });
  const email = requiredEmail(validator, "email", data.email);
  const phone = optionalPhone(validator, "phone", data.phone);

  let document;
  if (data.document === undefined || data.document === null || data.document === "") {
    validator.add("document", "required", "document is required");
  } else {
    document = parseDocument(data.document);
    if (document === null) {
      validator.add("document", "invalid_document", "document must be a valid CPF or CNPJ");
    }
  }

  validator.throwIfInvalid();
  return { name, email, phone, document };
}

export function createCustomer(input, { tenantId, id, now }) {
  const validator = new Validator();
  validateTenant(validator, tenantId);
  validator.throwIfInvalid();

  const { name, email, phone, document } = validateCustomerInput(input);
  const timestamp = now.toISOString();

  const customer = {
    id,
    tenantId,
    type: document.type === documentTypes.CPF ? customerTypes.INDIVIDUAL : customerTypes.COMPANY,
    name,
    email,
    document,
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp
  };
  if (phone !== undefined) {
    customer.phone = phone;
  }
  return Object.freeze(customer);
}

/**
 * Caso de uso de cadastro. `repository` e uma porta: qualquer adaptador de
 * persistencia que implemente findByDocument/insert serve.
 */
export function registerCustomer(repository, input, { tenantId, idGenerator, clock }) {
  const customer = createCustomer(input, {
    tenantId,
    id: idGenerator("cus"),
    now: clock()
  });

  if (repository.findByDocument(tenantId, customer.document.number)) {
    throw new ConflictError(
      "customer_already_registered",
      "A customer with this document is already registered for the tenant"
    );
  }

  repository.insert(customer);
  return customer;
}

export function getCustomer(repository, { tenantId, id }) {
  const customer = repository.findById(tenantId, id);
  if (!customer) {
    throw new NotFoundError("customer_not_found", "Customer not found");
  }
  return customer;
}

/**
 * Validadores de campos compartilhados pelos cadastros de onboarding.
 * Cada funcao registra problemas no Validator e devolve o valor normalizado
 * (ou `undefined` quando o campo e invalido/ausente).
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const brazilianStates = Object.freeze([
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT",
  "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP",
  "TO"
]);

export function requiredText(validator, field, value, { min = 1, max = 200 } = {}) {
  if (typeof value !== "string" || value.trim().length === 0) {
    validator.add(field, "required", `${field} is required`);
    return undefined;
  }
  const text = value.trim().replace(/\s+/g, " ");
  if (text.length < min || text.length > max) {
    validator.add(field, "invalid_length", `${field} must have between ${min} and ${max} characters`);
    return undefined;
  }
  return text;
}

export function optionalText(validator, field, value, options) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return requiredText(validator, field, value, options);
}

export function requiredEmail(validator, field, value) {
  const email = requiredText(validator, field, value, { max: 254 });
  if (email === undefined) {
    return undefined;
  }
  if (!EMAIL.test(email)) {
    validator.add(field, "invalid_format", `${field} must be a valid email address`);
    return undefined;
  }
  return email.toLowerCase();
}

/**
 * Aceita telefone em E.164 (+5511987654321) ou numero nacional com DDD
 * (11 98765-4321), sempre devolvido em E.164.
 */
export function optionalPhone(validator, field, value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    validator.add(field, "invalid_format", `${field} must be a string`);
    return undefined;
  }
  const digits = value.replace(/[\s()\-.]/g, "");
  if (/^\+[1-9]\d{7,14}$/.test(digits)) {
    return digits;
  }
  if (/^[1-9]{2}9?\d{8}$/.test(digits)) {
    return `+55${digits}`;
  }
  validator.add(field, "invalid_format", `${field} must be E.164 or a Brazilian number with area code`);
  return undefined;
}

export function requiredAddress(validator, field, value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    validator.add(field, "required", `${field} is required`);
    return undefined;
  }

  const address = {
    street: requiredText(validator, `${field}.street`, value.street, { max: 200 }),
    number: requiredText(validator, `${field}.number`, value.number, { max: 20 }),
    complement: optionalText(validator, `${field}.complement`, value.complement, { max: 100 }),
    district: requiredText(validator, `${field}.district`, value.district, { max: 100 }),
    city: requiredText(validator, `${field}.city`, value.city, { max: 100 }),
    state: undefined,
    postalCode: undefined
  };

  const state = typeof value.state === "string" ? value.state.trim().toUpperCase() : "";
  if (!brazilianStates.includes(state)) {
    validator.add(`${field}.state`, "invalid_value", `${field}.state must be a Brazilian state code (UF)`);
  } else {
    address.state = state;
  }

  const postalCode = typeof value.postalCode === "string" ? value.postalCode.replace(/\D/g, "") : "";
  if (!/^\d{8}$/.test(postalCode)) {
    validator.add(`${field}.postalCode`, "invalid_format", `${field}.postalCode must be a CEP with 8 digits`);
  } else {
    address.postalCode = postalCode;
  }

  if (address.complement === undefined) {
    delete address.complement;
  }
  return Object.freeze(address);
}

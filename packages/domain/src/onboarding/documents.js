/**
 * Documentos fiscais brasileiros (CPF e CNPJ).
 *
 * O CNPJ aceita o formato alfanumerico definido pela Receita Federal (IN RFB
 * 2.229/2024), vigente a partir de julho de 2026: as 12 primeiras posicoes
 * podem conter digitos ou letras maiusculas e os 2 digitos verificadores
 * continuam numericos. O calculo usa o valor ASCII do caractere menos 48, o
 * que mantem compatibilidade total com CNPJs puramente numericos.
 */

export const documentTypes = Object.freeze({ CPF: "cpf", CNPJ: "cnpj" });

const SEPARATORS = /[\s.\-/]/g;

export function normalizeDocument(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(SEPARATORS, "").toUpperCase();
}

function checkDigit(chars, weights) {
  const sum = weights.reduce(
    (total, weight, index) => total + (chars.charCodeAt(index) - 48) * weight,
    0
  );
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export function isValidCpf(value) {
  const cpf = normalizeDocument(value);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) {
    return false;
  }
  const first = checkDigit(cpf, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = checkDigit(cpf, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return cpf.endsWith(`${first}${second}`);
}

export function isValidCnpj(value) {
  const cnpj = normalizeDocument(value);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) {
    return false;
  }
  const first = checkDigit(cnpj, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = checkDigit(cnpj, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return cnpj.endsWith(`${first}${second}`);
}

/**
 * Identifica o tipo do documento pelo tamanho apos normalizacao e valida os
 * digitos verificadores. Retorna `null` quando o documento e invalido.
 */
export function parseDocument(value) {
  const number = normalizeDocument(value);
  if (number.length === 11 && isValidCpf(number)) {
    return Object.freeze({ type: documentTypes.CPF, number });
  }
  if (number.length === 14 && isValidCnpj(number)) {
    return Object.freeze({ type: documentTypes.CNPJ, number });
  }
  return null;
}

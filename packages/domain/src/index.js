export const paymentStatuses = Object.freeze([
  "created",
  "authorized",
  "captured",
  "settled",
  "cancelled",
  "refunded",
  "failed"
]);

export function createMoney(amount, currency = "BRL") {
  if (!Number.isSafeInteger(amount)) {
    throw new TypeError("Money amount must be a safe integer");
  }

  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new TypeError("Currency must be an ISO 4217 code");
  }

  return Object.freeze({ amount, currency });
}

export * from "./errors.js";
export * from "./registry.js";


export class DomainError extends Error {
  constructor(code, message, status = 400, details) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function assertDomain(condition, code, message, status = 400, details) {
  if (!condition) {
    throw new DomainError(code, message, status, details);
  }
}


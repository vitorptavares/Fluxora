import { ConflictError, NotFoundError, ValidationError } from "@payments/domain";

export function errorResponse(status, code, message, details) {
  const error = { code, message };
  if (details && details.length > 0) {
    error.details = details;
  }
  return { status, body: { error } };
}

/** Traduz erros de dominio para respostas HTTP padronizadas. */
export function fromDomainError(error) {
  if (error instanceof ValidationError) {
    return errorResponse(422, error.code, error.message, error.details);
  }
  if (error instanceof ConflictError) {
    return errorResponse(409, error.code, error.message);
  }
  if (error instanceof NotFoundError) {
    return errorResponse(404, error.code, error.message);
  }
  throw error;
}

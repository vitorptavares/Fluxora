/**
 * Erros de dominio. Adaptadores (HTTP, filas) traduzem estes erros para o
 * protocolo de transporte; o dominio nunca conhece codigos HTTP.
 */
export class DomainError extends Error {
  constructor(code, message, details = []) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends DomainError {
  constructor(details) {
    super("validation_error", "One or more fields are invalid", details);
  }
}

export class ConflictError extends DomainError {}

export class NotFoundError extends DomainError {}

/**
 * Acumula falhas de validacao campo a campo para que o cliente receba todos
 * os problemas de uma vez, e nao apenas o primeiro.
 */
export class Validator {
  #details = [];

  add(field, code, message) {
    this.#details.push({ field, code, message });
  }

  get hasErrors() {
    return this.#details.length > 0;
  }

  throwIfInvalid() {
    if (this.hasErrors) {
      throw new ValidationError([...this.#details]);
    }
  }
}

/**
 * Typed IR construction/validation errors.
 *
 * These are thrown at IR construction time (not lint time) so that an invalid
 * IR can never be built — in strict OR loose mode. Safety invariants are not
 * loosenable.
 */
export class AurixValidationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "AurixValidationError";
    this.code = code;
    // Restore prototype chain for instanceof across transpile targets.
    Object.setPrototypeOf(this, AurixValidationError.prototype);
  }
}

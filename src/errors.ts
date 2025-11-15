/** Stable machine-readable error codes exposed by Coloristic Core. */
export type ColoristicErrorCode =
  | "EMPTY_PALETTE"
  | "INVALID_ARGUMENT"
  | "INVALID_COLOR"
  | "INVALID_CONTRAST_TARGET"
  | "INVALID_COUNT"
  | "INVALID_INDEX"
  | "INVALID_PALETTE"
  | "PALETTE_TOO_LARGE"
  | "UNSUPPORTED_FORMAT";

/** Error thrown when a public Coloristic Core API receives invalid input. */
export class ColoristicError extends Error {
  /** A stable code suitable for programmatic error handling. */
  readonly code: ColoristicErrorCode;

  /** Creates a Coloristic Core error with a stable code and human-readable message. */
  constructor(code: ColoristicErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ColoristicError";
    this.code = code;
  }
}

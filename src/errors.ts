/**
 * Custom error types for Lithuanian Public Transport SDK
 * @module errors
 */

/**
 * Base error class for transport SDK errors.
 */
export abstract class TransportError extends Error {
  /** City associated with this error, if applicable */
  abstract readonly city: string | null;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    // Maintains proper stack trace for where error was thrown (V8 engines)
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Error thrown when a network request fails.
 */
export class TransportNetworkError extends TransportError {
  readonly city: string;

  constructor(
    message: string,
    public readonly cityId: string,
    public readonly statusCode?: number,
    public readonly cause?: Error
  ) {
    super(message);
    this.city = cityId;
  }
}

/**
 * Error thrown when GPS data is requested for a bronze-tier city.
 */
export class GpsNotAvailableError extends TransportError {
  readonly city: string;

  constructor(cityId: string) {
    super(`GPS data is not available for ${cityId} (bronze tier city). Use GTFS static data instead.`);
    this.city = cityId;
  }
}

/**
 * Error thrown when GTFS data is required but not yet synced.
 */
export class SyncRequiredError extends TransportError {
  readonly city: string;

  constructor(cityId: string) {
    super(`GTFS data for ${cityId} is not synced. Call sync('${cityId}') first.`);
    this.city = cityId;
  }
}

/**
 * Error thrown when GTFS sync fails.
 */
export class GtfsSyncError extends TransportError {
  readonly city: string;

  constructor(
    cityId: string,
    message: string,
    public readonly cause?: Error
  ) {
    super(`GTFS sync failed for ${cityId}: ${message}`);
    this.city = cityId;
  }
}

/**
 * Error thrown when parsing GPS or GTFS data fails.
 */
export class ParseError extends TransportError {
  readonly city: string | null;

  constructor(
    message: string,
    cityId?: string,
    public readonly line?: number,
    public readonly rawData?: string
  ) {
    const fullMessage = cityId !== undefined
      ? `Parse error for ${cityId}${line !== undefined ? ` at line ${String(line)}` : ''}: ${message}`
      : `Parse error: ${message}`;
    super(fullMessage);
    this.city = cityId ?? null;
  }
}

/**
 * Error thrown when an invalid city ID is provided.
 */
export class InvalidCityError extends TransportError {
  readonly city = null;

  constructor(providedCity: string) {
    super(`Invalid city ID: '${providedCity}'. Use getCities() to see available options.`);
  }
}

/**
 * Type guard to check if an error is a TransportError.
 */
export function isTransportError(error: unknown): error is TransportError {
  return error instanceof TransportError;
}

/**
 * Type guard to check if an error is a network error.
 */
export function isNetworkError(error: unknown): error is TransportNetworkError {
  return error instanceof TransportNetworkError;
}

/**
 * Coordinate normalization and validation utilities
 * @module utils/coordinates
 */

/**
 * Lithuania's geographic bounding box in WGS84 decimal degrees.
 * Used to validate coordinates are within expected range.
 */
export const LITHUANIA_BOUNDS = {
  /** Minimum latitude (southern border) */
  latMin: 53.89,
  /** Maximum latitude (northern border) */
  latMax: 56.45,
  /** Minimum longitude (western border) */
  lonMin: 20.93,
  /** Maximum longitude (eastern border) */
  lonMax: 26.83,
} as const;

/**
 * Coordinate divisor for stops.lt integer format.
 * Raw coordinates are multiplied by 1,000,000 to avoid floating point.
 */
const COORDINATE_DIVISOR = 1_000_000;

/**
 * Normalize a raw integer coordinate to WGS84 decimal degrees.
 * 
 * @param raw - Raw coordinate as integer (e.g., 25255492 for ~25.255492°)
 * @returns Normalized coordinate in decimal degrees
 * 
 * @example
 * normalizeCoordinate(25255492) // => 25.255492
 * normalizeCoordinate(54633886) // => 54.633886
 */
export function normalizeCoordinate(raw: number): number {
  return raw / COORDINATE_DIVISOR;
}

/**
 * Check if coordinates fall within Lithuania's bounding box.
 * 
 * @param lat - Latitude in WGS84 decimal degrees
 * @param lon - Longitude in WGS84 decimal degrees
 * @returns true if coordinates are within Lithuania
 * 
 * @example
 * isValidLithuaniaCoord(54.687, 25.279) // => true (Vilnius)
 * isValidLithuaniaCoord(48.856, 2.352)  // => false (Paris)
 */
export function isValidLithuaniaCoord(lat: number, lon: number): boolean {
  return (
    lat >= LITHUANIA_BOUNDS.latMin &&
    lat <= LITHUANIA_BOUNDS.latMax &&
    lon >= LITHUANIA_BOUNDS.lonMin &&
    lon <= LITHUANIA_BOUNDS.lonMax
  );
}

/**
 * Validate and normalize raw integer coordinates.
 * Returns null if coordinates are invalid or outside Lithuania.
 * 
 * @param rawLat - Raw latitude as integer
 * @param rawLon - Raw longitude as integer
 * @returns Object with normalized lat/lon, or null if invalid
 */
export function normalizeAndValidateCoordinates(
  rawLat: number,
  rawLon: number
): { latitude: number; longitude: number } | null {
  if (!Number.isFinite(rawLat) || !Number.isFinite(rawLon)) {
    return null;
  }

  const latitude = normalizeCoordinate(rawLat);
  const longitude = normalizeCoordinate(rawLon);

  if (!isValidLithuaniaCoord(latitude, longitude)) {
    return null;
  }

  return { latitude, longitude };
}

/**
 * Normalize bearing to 0-359 range.
 * 
 * @param bearing - Raw bearing value
 * @returns Normalized bearing in degrees
 */
export function normalizeBearing(bearing: number): number {
  if (!Number.isFinite(bearing)) {
    return 0;
  }
  // Handle negative values and wrap around
  return ((bearing % 360) + 360) % 360;
}

/**
 * Normalize speed to non-negative value.
 * 
 * @param speed - Raw speed value
 * @returns Speed in km/h, minimum 0
 */
export function normalizeSpeed(speed: number): number {
  if (!Number.isFinite(speed) || speed < 0) {
    return 0;
  }
  return speed;
}

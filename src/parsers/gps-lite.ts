/**
 * GPS Lite Format Parser for silver-tier cities
 * @module parsers/gps-lite
 * 
 * Handles the "lite" GPS format used by silver-tier cities (Panevėžys, Tauragė).
 * These streams have no header row and fewer columns.
 * 
 * Column counts by city (empirically verified):
 * - Panevėžys: 9 columns (no header, route often empty)
 * - Tauragė: 8 columns (no header, alphanumeric routes like S11, S19)
 */

import type { CityId, Vehicle, VehicleType } from '../types.js';
import {
  normalizeCoordinate,
  isValidLithuaniaCoord,
  normalizeBearing,
  normalizeSpeed,
} from '../utils/index.js';
import { gpsLitePanevezysSchema, gpsLiteTaurageSchema } from '../schemas.js';

// =============================================================================
// Format Definitions
// =============================================================================

/**
 * Panevėžys format (9 columns, no header):
 * [0] type        - Always "2" (bus?)
 * [1] route       - Route name (often empty)
 * [2] longitude   - Integer format (÷1,000,000)
 * [3] latitude    - Integer format (÷1,000,000)
 * [4] speed       - Speed or delay?
 * [5] azimuth     - Bearing in degrees
 * [6] (empty)     - Unknown
 * [7] vehicleId   - Vehicle identifier
 * [8] (empty)     - Unknown
 */

/**
 * Tauragė format (8 columns, no header):
 * [0] type        - Always "2" (bus?)
 * [1] route       - Route name (S11, S19) - ALPHANUMERIC!
 * [2] longitude   - Integer format (÷1,000,000)
 * [3] latitude    - Integer format (÷1,000,000)
 * [4] speed       - Speed in km/h
 * [5] azimuth     - Bearing in degrees
 * [6] vehicleId   - Vehicle identifier
 * [7] (empty)     - Unknown
 */

// =============================================================================
// Parser Options
// =============================================================================

/**
 * Options for GPS lite format parsing.
 */
export interface GpsLiteParseOptions {
  /** Whether to filter out records with invalid coordinates (default: true) */
  filterInvalidCoords?: boolean;
}

// =============================================================================
// City Type Guard
// =============================================================================

/**
 * Cities that use lite GPS format.
 */
export type LiteCityId = 'panevezys' | 'taurage';

/**
 * Check if a city uses lite GPS format.
 */
export function isLiteCity(city: CityId): city is LiteCityId {
  return city === 'panevezys' || city === 'taurage';
}

// =============================================================================
// Main Parser
// =============================================================================

/**
 * Parse GPS lite format stream from a silver-tier city.
 * 
 * @param text - Raw text content from gps.txt
 * @param city - City identifier (must be 'panevezys' or 'taurage')
 * @param options - Parse options
 * @returns Array of normalized Vehicle objects
 */
export function parseGpsLiteStream(
  text: string,
  city: LiteCityId,
  options: GpsLiteParseOptions = {}
): Vehicle[] {
  const { filterInvalidCoords = true } = options;

  const lines = text.split('\n').filter(line => line.trim());
  
  if (lines.length === 0) {
    return [];
  }

  const vehicles: Vehicle[] = [];

  for (const line of lines) {
    const cols = line.split(',');
    
    try {
      const vehicle = city === 'panevezys'
        ? parsePanevezysLine(cols, city)
        : parseTaurageLine(cols, city);
      
      if (vehicle) {
        if (filterInvalidCoords && !isValidLithuaniaCoord(vehicle.latitude, vehicle.longitude)) {
          continue;
        }
        vehicles.push(vehicle);
      }
    } catch {
      // Skip malformed lines
      continue;
    }
  }

  return vehicles;
}

// =============================================================================
// City-Specific Parsers
// =============================================================================

/**
 * Parse a line from Panevėžys GPS lite format (9 columns).
 */
function parsePanevezysLine(cols: string[], city: CityId): Vehicle | null {
  // Validate with Zod schema
  const parseResult = gpsLitePanevezysSchema.safeParse(cols);
  if (!parseResult.success) {
    return null;
  }
  
  const row = parseResult.data;
  const vehicleNumber = row[7];
  
  // Validate essential fields
  if (vehicleNumber === '' || !Number.isFinite(row[2]) || !Number.isFinite(row[3])) {
    return null;
  }

  const longitude = normalizeCoordinate(row[2]);
  const latitude = normalizeCoordinate(row[3]);
  const speed = normalizeSpeed(row[4]);
  const bearing = normalizeBearing(row[5]);
  const route = row[1];
  const id = `${city}-${vehicleNumber}`;

  return {
    id,
    vehicleNumber,
    route,
    type: 'bus' as VehicleType, // Lite format doesn't specify type
    latitude,
    longitude,
    bearing,
    speed,
    destination: null, // Needs GTFS enrichment
    delaySeconds: null,
    tripId: null,
    gtfsTripId: null,
    nextStopId: null,
    arrivalTimeSeconds: null,
    isStale: false, // No timestamp in lite format
    measuredAt: new Date(), // Use server receive time
  };
}

/**
 * Parse a line from Tauragė GPS lite format (8 columns).
 */
function parseTaurageLine(cols: string[], city: CityId): Vehicle | null {
  // Validate with Zod schema
  const parseResult = gpsLiteTaurageSchema.safeParse(cols);
  if (!parseResult.success) {
    return null;
  }
  
  const row = parseResult.data;
  const vehicleNumber = row[6];
  
  // Validate essential fields
  if (vehicleNumber === '' || !Number.isFinite(row[2]) || !Number.isFinite(row[3])) {
    return null;
  }

  const longitude = normalizeCoordinate(row[2]);
  const latitude = normalizeCoordinate(row[3]);
  const speed = normalizeSpeed(row[4]);
  const bearing = normalizeBearing(row[5]);
  const route = row[1];

  const id = `${city}-${vehicleNumber}`;

  return {
    id,
    vehicleNumber,
    route,
    type: 'bus' as VehicleType, // Lite format doesn't specify type
    latitude,
    longitude,
    bearing,
    speed,
    destination: null, // Needs GTFS enrichment
    delaySeconds: null,
    tripId: null,
    gtfsTripId: null,
    nextStopId: null,
    arrivalTimeSeconds: null,
    isStale: false, // No timestamp in lite format
    measuredAt: new Date(), // Use server receive time
  };
}

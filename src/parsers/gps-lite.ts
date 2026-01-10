/**
 * GPS Lite Format Parser for silver-tier cities
 * @module parsers/gps-lite
 * 
 * Handles the "lite" GPS format used by silver-tier cities.
 * These streams have no header row and use a data-driven format descriptor
 * to parse columns at specified indices.
 * 
 * This design allows users to:
 * - Add new cities without SDK updates
 * - Override formats when cities change their data structure
 */

import type { Vehicle, VehicleType } from '../types.js';
import type { LiteFormatDescriptor, CityConfig } from '../config.js';
import {
  normalizeCoordinate,
  isValidLithuaniaCoord,
  normalizeBearing,
  normalizeSpeed,
} from '../utils/index.js';

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
// Format Detection
// =============================================================================

/**
 * Get the lite format descriptor for a city.
 * The descriptor must be provided in the city config's liteFormat field.
 * 
 * @param cityId - The city identifier (unused, kept for API compatibility)
 * @param cityConfig - City config with liteFormat
 * @returns The format descriptor, or undefined if not found
 */
export function getLiteFormatDescriptor(
  _cityId: string,
  cityConfig?: CityConfig
): LiteFormatDescriptor | undefined {
  // liteFormat must be explicitly provided in city config
  return cityConfig?.liteFormat;
}

/**
 * Check if a city uses lite GPS format based on its config.
 * 
 * @param cityConfig - The city configuration
 * @returns True if the city uses lite format
 */
export function isLiteFormat(cityConfig: CityConfig): boolean {
  return cityConfig.gps.format === 'lite';
}

// =============================================================================
// Main Parser
// =============================================================================

/**
 * Parse GPS lite format stream using a format descriptor.
 * 
 * @param text - Raw text content from gps.txt
 * @param cityId - City identifier for vehicle ID prefixing
 * @param format - Format descriptor defining column indices
 * @param options - Parse options
 * @returns Array of normalized Vehicle objects
 */
export function parseGpsLiteStream(
  text: string,
  cityId: string,
  format: LiteFormatDescriptor,
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
      const vehicle = parseLiteLine(cols, cityId, format);
      
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
// Generic Line Parser
// =============================================================================

/**
 * Parse a single line using the format descriptor.
 * This is the core data-driven parser that uses column indices
 * from the descriptor instead of hardcoded positions.
 * 
 * @param cols - Array of column values from the CSV line
 * @param cityId - City identifier for vehicle ID prefixing
 * @param format - Format descriptor with column indices
 * @returns Parsed Vehicle or null if line is invalid
 */
function parseLiteLine(
  cols: string[],
  cityId: string,
  format: LiteFormatDescriptor
): Vehicle | null {
  // Check minimum column count
  if (cols.length < format.minColumns) {
    return null;
  }

  // Extract vehicle ID
  const vehicleNumber = cols[format.vehicleIdIndex]?.trim();
  if (vehicleNumber === undefined || vehicleNumber === '') {
    return null;
  }

  // Extract and validate coordinates
  const latRaw = Number(cols[format.coordIndices[0]]);
  const lonRaw = Number(cols[format.coordIndices[1]]);
  
  if (!Number.isFinite(latRaw) || !Number.isFinite(lonRaw)) {
    return null;
  }

  // Extract route (may be empty)
  const route = cols[format.routeIndex]?.trim() ?? '';

  // Extract speed and bearing
  const speedRaw = Number(cols[format.speedIndex]);
  const bearingRaw = Number(cols[format.bearingIndex]);

  // Normalize values
  const latitude = normalizeCoordinate(latRaw);
  const longitude = normalizeCoordinate(lonRaw);
  const speed = normalizeSpeed(Number.isFinite(speedRaw) ? speedRaw : 0);
  const bearing = normalizeBearing(Number.isFinite(bearingRaw) ? bearingRaw : 0);

  // Determine vehicle type (lite format typically doesn't specify, default to bus)
  const type: VehicleType = 'bus';

  const id = `${cityId}-${vehicleNumber}`;

  return {
    id,
    vehicleNumber,
    route,
    type,
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
 * @deprecated No built-in cities use lite format anymore.
 * Use isLiteFormat(cityConfig) to check if a city uses lite format.
 */
export type LiteCityId = never;

/**
 * @deprecated Use isLiteFormat(cityConfig) instead.
 * Always returns false since no built-in cities use lite format.
 */
// eslint-disable-next-line @typescript-eslint/no-deprecated
export function isLiteCity(_cityId: string): _cityId is LiteCityId {
  return false;
}

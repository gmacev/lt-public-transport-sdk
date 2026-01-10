/**
 * GPS Full Format Parser with dynamic header-based column mapping
 * @module parsers/gps-full
 * 
 * Handles the "full" GPS format used by gold-tier cities (Vilnius, Kaunas, Klaipėda, Alytus, Druskininkai).
 * Each city has different column layouts, so we parse headers dynamically.
 * 
 * Column counts by city (empirically verified):
 * - Vilnius: 18 columns
 * - Kaunas: 14 columns  
 * - Klaipėda: 12 columns
 * - Alytus: 13 columns
 * - Druskininkai: 13 columns
 */

import type { CityId, Vehicle, VehicleType } from '../types.js';
import { LT_TRANSPORT_TYPE_MAP } from '../types.js';
import {
  normalizeCoordinate,
  isValidLithuaniaCoord,
  normalizeBearing,
  normalizeSpeed,
  cleanTextField,
  secondsFromMidnightToDate,
  isDataStale,
} from '../utils/index.js';
import { gpsFullRowSchema, type GpsFullRow } from '../schemas.js';

// =============================================================================
// Known Column Names
// =============================================================================

/**
 * Known column header names across all city GPS formats.
 */
type KnownColumn =
  | 'Transportas'             // Vehicle type (all cities)
  | 'Marsrutas'               // Route (all cities)
  | 'ReisoID'                 // Trip ID (Vilnius, Klaipėda, Alytus, Druskininkai)
  | 'Grafikas'                // Schedule code (Kaunas only - replaces ReisoID)
  | 'MasinosNumeris'          // Vehicle number (all cities)
  | 'Ilguma'                  // Longitude as integer (all cities)
  | 'Platuma'                 // Latitude as integer (all cities)
  | 'Greitis'                 // Speed km/h (all cities)
  | 'Azimutas'                // Bearing degrees (all cities)
  | 'ReisoPradziaMinutemis'   // Trip start time in minutes (most cities)
  | 'NuokrypisSekundemis'     // Delay in seconds (most cities)
  | 'MatavimoLaikas'          // Measurement time seconds from midnight (Vilnius, Alytus, Druskininkai)
  | 'SekanciosStotelesNum'    // Next stop ID (Kaunas only)
  | 'AtvykimoLaikasSekundemis' // Arrival time seconds from midnight (Kaunas only - FUTURE prediction)
  | 'MasinosTipas'            // Vehicle equipment codes (some cities)
  | 'KryptiesTipas'           // Direction type A>D, D>A (Vilnius only)
  | 'KryptiesPavadinimas'     // Destination name (most cities)
  | 'ReisoIdGTFS'             // GTFS trip reference (Vilnius only)
  | 'IntervalasPries'         // Headway before (Vilnius only)
  | 'IntervalasPaskui';       // Headway after (Vilnius only)

/**
 * Column map for fast index lookup.
 */
interface ColumnMap {
  /** Get column index by name, or undefined if not present */
  get(column: KnownColumn): number | undefined;
  
  /** Get column index by name, throws if not present */
  getRequired(column: KnownColumn): number;
  
  /** Check if column exists */
  has(column: KnownColumn): boolean;
  
  /** All column names found */
  readonly columns: readonly string[];
}

/**
 * Build a column map from header row.
 */
function buildColumnMap(headers: string[]): ColumnMap {
  const indexMap = new Map<string, number>();
  
  headers.forEach((header, index) => {
    const trimmed = header.trim();
    if (trimmed) {
      indexMap.set(trimmed, index);
    }
  });

  return {
    get(column: KnownColumn): number | undefined {
      return indexMap.get(column);
    },
    getRequired(column: KnownColumn): number {
      const index = indexMap.get(column);
      if (index === undefined) {
        throw new Error(`Required column '${column}' not found in headers`);
      }
      return index;
    },
    has(column: KnownColumn): boolean {
      return indexMap.has(column);
    },
    columns: headers.map(h => h.trim()),
  };
}

/**
 * Parse vehicle type from Lithuanian transport name.
 */
function parseVehicleType(transportName: string): VehicleType {
  const type = LT_TRANSPORT_TYPE_MAP[transportName];
  return type ?? 'unknown';
}

// =============================================================================
// Main Parser
// =============================================================================

/**
 * Options for GPS full format parsing.
 */
export interface GpsFullParseOptions {
  /** Threshold in ms for marking data as stale (default: 5 minutes) */
  staleThresholdMs?: number;
  
  /** Whether to filter out stale records (default: false) */
  filterStale?: boolean;
  
  /** Whether to filter out records with invalid coordinates (default: true) */
  filterInvalidCoords?: boolean;
  
  /** 
   * Server response time for stable timestamps.
   * Used as fallback for cities without MatavimoLaikas.
   * If not provided, falls back to current client time.
   */
  serverTime?: Date;
}

/**
 * Parse GPS full format stream from a gold-tier city.
 * 
 * Uses header-based dynamic column mapping to handle different
 * column layouts across cities.
 * 
 * @param text - Raw text content from gps_full.txt
 * @param city - City identifier for context
 * @param options - Parse options
 * @returns Array of normalized Vehicle objects
 */
export function parseGpsFullStream(
  text: string,
  city: CityId,
  options: GpsFullParseOptions = {}
): Vehicle[] {
  const {
    staleThresholdMs = 5 * 60 * 1000,
    filterStale = false,
    filterInvalidCoords = true,
    serverTime = new Date(),
  } = options;

  const lines = text.split('\n').filter(line => line.trim());
  
  if (lines.length < 2) {
    // No data (only header or empty)
    return [];
  }

  // Parse header row
  const firstLine = lines[0];
  if (firstLine === undefined) {
    return [];
  }
  
  // Strip UTF-8 BOM if present (stops.lt sometimes includes BOM)
  const cleanHeader = firstLine.charCodeAt(0) === 0xFEFF 
    ? firstLine.slice(1) 
    : firstLine;
  
  const headers = cleanHeader.split(',');
  const columnMap = buildColumnMap(headers);

  // Validate required columns
  const requiredColumns: KnownColumn[] = [
    'Transportas',
    'Marsrutas', 
    'MasinosNumeris',
    'Ilguma',
    'Platuma',
  ];
  
  for (const col of requiredColumns) {
    if (!columnMap.has(col)) {
      throw new Error(`Required column '${col}' not found in ${city} GPS data`);
    }
  }

  // Parse data rows
  const vehicles: Vehicle[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined || line.trim() === '') continue;

    const cols = line.split(',');
    
    try {
      const vehicle = parseVehicleLine(cols, columnMap, city, staleThresholdMs, serverTime);
      
      if (vehicle) {
        // Apply filters
        if (filterInvalidCoords && !isValidLithuaniaCoord(vehicle.latitude, vehicle.longitude)) {
          continue;
        }
        if (filterStale && vehicle.isStale) {
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

/**
 * Build a row object from CSV columns using the column map.
 */
function buildRowObject(cols: string[], columnMap: ColumnMap): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const colName of columnMap.columns) {
    const idx = columnMap.get(colName as KnownColumn);
    if (idx !== undefined) {
      obj[colName] = cols[idx]?.trim() ?? '';
    }
  }
  return obj;
}

/**
 * Parse a single vehicle line from GPS full format.
 */
function parseVehicleLine(
  cols: string[],
  columnMap: ColumnMap,
  city: CityId,
  staleThresholdMs: number,
  serverTime: Date
): Vehicle | null {
  // Build row object from columns for Zod validation
  const rowObject = buildRowObject(cols, columnMap);
  
  // Validate with Zod schema - this catches format changes early
  const parseResult = gpsFullRowSchema.safeParse(rowObject);
  if (!parseResult.success) {
    // Row doesn't match expected schema - skip it
    return null;
  }
  
  const row = parseResult.data;
  
  // Skip if missing essential data
  if (row.MasinosNumeris === '') {
    return null;
  }

  // Normalize coordinates
  const longitude = normalizeCoordinate(row.Ilguma);
  const latitude = normalizeCoordinate(row.Platuma);

  // Extract optional fields
  const speed = normalizeSpeed(row.Greitis);
  const bearing = normalizeBearing(row.Azimutas);
  const delaySeconds = row.NuokrypisSekundemis ?? null;
  
  // Trip ID - different column name for Kaunas
  const tripId = row.ReisoID ?? row.Grafikas ?? null;

  // Destination name
  const destination = row.KryptiesPavadinimas !== undefined && row.KryptiesPavadinimas !== '' 
    ? cleanTextField(row.KryptiesPavadinimas) 
    : null;

  // GTFS trip reference (Vilnius only)
  const gtfsTripId = row.ReisoIdGTFS ?? null;

  // Next stop ID (Kaunas only)
  const nextStopId = row.SekanciosStotelesNum !== undefined 
    ? String(row.SekanciosStotelesNum) 
    : null;

  // Arrival time (Kaunas only) - this is FUTURE prediction, not measurement time
  const arrivalTimeSeconds = row.AtvykimoLaikasSekundemis ?? null;

  // Calculate measurement time
  const measuredAt = calculateMeasuredAtFromRow(row, serverTime);
  const isStale = isDataStale(measuredAt, staleThresholdMs);

  // Generate unique ID
  const vehicleNumber = row.MasinosNumeris;
  const route = row.Marsrutas;
  const id = `${city}-${vehicleNumber}-${route}`;

  return {
    id,
    vehicleNumber,
    route,
    type: parseVehicleType(row.Transportas),
    latitude,
    longitude,
    bearing,
    speed,
    destination,
    delaySeconds,
    tripId,
    gtfsTripId,
    nextStopId,
    arrivalTimeSeconds,
    isStale,
    measuredAt,
  };
}

/**
 * Calculate measurement time from validated row data.
 * @param row - Parsed row data
 * @param fallbackTime - Server time to use when row has no timestamp field
 */
function calculateMeasuredAtFromRow(row: GpsFullRow, fallbackTime: Date): Date {
  // Try MatavimoLaikas first (Vilnius, Alytus, Druskininkai)
  if (row.MatavimoLaikas !== undefined && row.MatavimoLaikas > 0) {
    return secondsFromMidnightToDate(row.MatavimoLaikas);
  }

  // Kaunas: AtvykimoLaikasSekundemis is FUTURE arrival, not measurement time.
  // Klaipėda: No time field available.
  // Use server response time for stable timestamps across network latency variance.
  return fallbackTime;
}

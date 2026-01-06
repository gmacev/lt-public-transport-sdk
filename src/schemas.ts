/**
 * Zod schemas for runtime validation of external data
 * @module schemas
 * 
 * These schemas validate data from stops.lt GPS streams and GTFS files.
 * They provide:
 * - Type coercion (string → number)
 * - Clear error messages when format changes
 * - Documentation of expected data structure
 */

import { z } from 'zod';

// =============================================================================
// Coordinate Validation
// =============================================================================

/** Lithuania bounding box for coordinate validation */
const LITHUANIA_LAT_MIN = 53.5;
const LITHUANIA_LAT_MAX = 56.5;
const LITHUANIA_LON_MIN = 20.5;
const LITHUANIA_LON_MAX = 27.0;

/**
 * Validates a raw integer coordinate (needs division by 1,000,000).
 */
const rawCoordinateSchema = z.coerce.number().int();

/**
 * Validates a WGS84 latitude within Lithuania bounds.
 */
const latitudeSchema = z.coerce.number()
  .refine(
    (val) => val >= LITHUANIA_LAT_MIN && val <= LITHUANIA_LAT_MAX,
    { message: 'Latitude outside Lithuania bounds' }
  );

/**
 * Validates a WGS84 longitude within Lithuania bounds.
 */
const longitudeSchema = z.coerce.number()
  .refine(
    (val) => val >= LITHUANIA_LON_MIN && val <= LITHUANIA_LON_MAX,
    { message: 'Longitude outside Lithuania bounds' }
  );

// =============================================================================
// GPS Full Format Schema
// =============================================================================

/**
 * Schema for a GPS full format row.
 * Columns vary by city but these are the core fields present in all cities.
 */
export const gpsFullRowSchema = z.object({
  // Required fields (all cities)
  Transportas: z.string().min(1, 'Transport type required'),
  Marsrutas: z.string(), // Can be empty for some vehicles
  MasinosNumeris: z.string().min(1, 'Vehicle number required'),
  Ilguma: rawCoordinateSchema,
  Platuma: rawCoordinateSchema,
  Greitis: z.coerce.number().nonnegative().default(0),
  Azimutas: z.coerce.number().min(0).max(360).default(0),
  
  // Optional fields (city-specific)
  ReisoID: z.string().optional(),
  Grafikas: z.string().optional(), // Kaunas only
  ReisoPradziaMinutemis: z.coerce.number().optional(),
  NuokrypisSekundemis: z.coerce.number().optional(),
  MatavimoLaikas: z.coerce.number().optional(), // Vilnius, Alytus, Druskininkai
  SekanciosStotelesNum: z.coerce.number().optional(), // Kaunas only
  AtvykimoLaikasSekundemis: z.coerce.number().optional(), // Kaunas only
  MasinosTipas: z.string().optional(),
  KryptiesTipas: z.string().optional(), // Vilnius only
  KryptiesPavadinimas: z.string().optional(),
  ReisoIdGTFS: z.string().optional(), // Vilnius only
  IntervalasPries: z.coerce.number().optional(), // Vilnius only
  IntervalasPaskui: z.coerce.number().optional(), // Vilnius only
}).loose(); // Allow unknown columns from different cities

export type GpsFullRow = z.infer<typeof gpsFullRowSchema>;

// =============================================================================
// GPS Lite Format Schemas
// =============================================================================

/**
 * Schema for Panevėžys GPS lite format (9 columns, no header).
 * Columns: type, route, lon, lat, speed, azimuth, ?, vehicleId, ?
 */
export const gpsLitePanevezysSchema = z.tuple([
  z.string(), // [0] type
  z.string(), // [1] route (can be empty)
  z.coerce.number(), // [2] longitude (raw int)
  z.coerce.number(), // [3] latitude (raw int)
  z.coerce.number(), // [4] speed
  z.coerce.number(), // [5] azimuth
  z.string(), // [6] unknown
  z.string().min(1), // [7] vehicleId
  z.string(), // [8] unknown
]);

/**
 * Schema for Tauragė GPS lite format (8 columns, no header).
 * Columns: type, route, lon, lat, speed, azimuth, vehicleId, ?
 */
export const gpsLiteTaurageSchema = z.tuple([
  z.string(), // [0] type
  z.string(), // [1] route (can be alphanumeric like S11)
  z.coerce.number(), // [2] longitude (raw int)
  z.coerce.number(), // [3] latitude (raw int)
  z.coerce.number(), // [4] speed
  z.coerce.number(), // [5] azimuth
  z.string().min(1), // [6] vehicleId
  z.string(), // [7] unknown
]);

export type GpsLitePanevezysRow = z.infer<typeof gpsLitePanevezysSchema>;
export type GpsLiteTaurageRow = z.infer<typeof gpsLiteTaurageSchema>;

// =============================================================================
// GTFS Routes Schema
// =============================================================================

/**
 * Schema for a GTFS routes.txt row.
 */
export const gtfsRouteSchema = z.object({
  route_id: z.string().min(1, 'Route ID required'),
  route_short_name: z.string().min(1, 'Route short name required'),
  route_long_name: z.string().default(''),
  route_type: z.coerce.number().int(),
  route_color: z.string().default('FFFFFF'),
  route_text_color: z.string().default('000000'),
  // Optional fields
  agency_id: z.string().optional(),
  route_desc: z.string().optional(),
  route_url: z.string().optional(),
}).loose();

export type GtfsRoute = z.infer<typeof gtfsRouteSchema>;

// =============================================================================
// GTFS Stops Schema
// =============================================================================

/**
 * Schema for a GTFS stops.txt row.
 */
export const gtfsStopSchema = z.object({
  stop_id: z.string().min(1, 'Stop ID required'),
  stop_name: z.string().min(1, 'Stop name required'),
  stop_lat: latitudeSchema,
  stop_lon: longitudeSchema,
  // Optional fields
  stop_code: z.string().optional(),
  stop_desc: z.string().optional(),
  location_type: z.coerce.number().optional(),
  parent_station: z.string().optional(),
}).loose();

export type GtfsStop = z.infer<typeof gtfsStopSchema>;

// =============================================================================
// Client Config Schema
// =============================================================================

/**
 * Schema for LtTransport client configuration.
 */
export const clientConfigSchema = z.object({
  /** Directory for caching GTFS data */
  cacheDir: z.string().optional(),

  /** Request timeout in milliseconds (must be positive) */
  requestTimeout: z.number().int().positive().default(10000),

  /** User-Agent header for HTTP requests */
  userAgent: z.string().default('lt-public-transport-sdk/1.0.0'),

  /** Threshold in milliseconds for marking data as stale (must be positive) */
  staleThresholdMs: z.number().int().positive().default(300000),

  /** Whether to automatically enrich silver-tier cities with GTFS data */
  autoEnrich: z.boolean().default(true),

  /** Whether to filter out vehicles with invalid coordinates */
  filterInvalidCoords: z.boolean().default(true),

  /** Whether to filter out stale data */
  filterStale: z.boolean().default(false),
}).strict();

export type ValidatedClientConfig = z.infer<typeof clientConfigSchema>;

// =============================================================================
// Parsed Vehicle Schema
// =============================================================================

/**
 * Schema for a fully parsed and normalized Vehicle object.
 * Used to validate output before returning to user.
 */
export const vehicleSchema = z.object({
  id: z.string().min(1),
  vehicleNumber: z.string().min(1),
  route: z.string(),
  type: z.enum(['bus', 'trolleybus', 'ferry', 'unknown']),
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  bearing: z.number().min(0).max(360),
  speed: z.number().nonnegative(),
  destination: z.string().nullable(),
  delaySeconds: z.number().nullable(),
  tripId: z.string().nullable(),
  gtfsTripId: z.string().nullable(),
  nextStopId: z.string().nullable(),
  arrivalTimeSeconds: z.number().nullable(),
  isStale: z.boolean(),
  measuredAt: z.date(),
});

export type ValidatedVehicle = z.infer<typeof vehicleSchema>;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Safely parse a value with a Zod schema, returning null on failure.
 */
export function safeParse<T>(schema: z.ZodType<T>, data: unknown): T | null {
  const result = schema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Parse a value with a Zod schema, throwing a detailed error on failure.
 */
export function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown, context?: string): T {
  const result = schema.safeParse(data);
  if (result.success) {
    return result.data;
  }
  const errors = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(', ');
  throw new Error(`${context ?? 'Validation failed'}: ${errors}`);
}

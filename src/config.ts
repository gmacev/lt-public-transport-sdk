/**
 * City configuration matrix for Lithuanian Public Transport SDK
 * @module config
 */

// =============================================================================
// City Tier Type
// =============================================================================

/**
 * City data tier classification based on data quality and availability.
 * - gold: Full GPS streams with rich metadata (destination, delay, equipment)
 * - silver: Lite GPS streams requiring GTFS enrichment
 * - bronze: GTFS data only, no real-time GPS
 */
export type CityTier = 'gold' | 'silver' | 'bronze';

// =============================================================================
// Lite Format Descriptor
// =============================================================================

/**
 * Describes how to parse a lite GPS format.
 * Used by silver-tier cities with headerless CSV data.
 * 
 * This enables data-driven parsing instead of hardcoded city-specific logic,
 * allowing users to add new cities or adapt to format changes.
 */
export interface LiteFormatDescriptor {
  /** Minimum number of columns expected in each row */
  readonly minColumns: number;
  
  /** Column index (0-based) for vehicle ID */
  readonly vehicleIdIndex: number;
  
  /** Column index (0-based) for route name */
  readonly routeIndex: number;
  
  /** 
   * Column indices for coordinates [latitude, longitude].
   * Coordinates are expected in integer format (divide by 1,000,000 for decimal).
   */
  readonly coordIndices: readonly [latIdx: number, lonIdx: number];
  
  /** Column index (0-based) for speed */
  readonly speedIndex: number;
  
  /** Column index (0-based) for bearing/azimuth */
  readonly bearingIndex: number;
  
  /** Optional: Column index for vehicle type */
  readonly typeIndex?: number;
  
  /** Optional: Column index for timestamp */
  readonly timestampIndex?: number;
}

/**
 * Built-in lite format descriptors for known cities.
 * Users can override these or define new ones via config.
 */
export const LITE_FORMAT_DESCRIPTORS: Readonly<Record<string, LiteFormatDescriptor>> = {
  /**
   * Panevėžys format (9 columns, no header):
   * [0] type, [1] route, [2] lon, [3] lat, [4] speed, [5] azimuth, [6] ?, [7] vehicleId, [8] ?
   */
  panevezys: {
    minColumns: 9,
    vehicleIdIndex: 7,
    routeIndex: 1,
    coordIndices: [3, 2] as const, // lat at 3, lon at 2
    speedIndex: 4,
    bearingIndex: 5,
    typeIndex: 0,
  },
  
  /**
   * Tauragė format (8 columns, no header):
   * [0] type, [1] route, [2] lon, [3] lat, [4] speed, [5] azimuth, [6] vehicleId, [7] ?
   */
  taurage: {
    minColumns: 8,
    vehicleIdIndex: 6,
    routeIndex: 1,
    coordIndices: [3, 2] as const, // lat at 3, lon at 2
    speedIndex: 4,
    bearingIndex: 5,
    typeIndex: 0,
  },
} as const;

// =============================================================================
// Configuration Interfaces
// =============================================================================

/**
 * GPS data stream configuration for a city.
 */
export interface GpsConfig {
  /** Whether GPS data is available for this city */
  readonly enabled: boolean;

  /**
   * Format of GPS data stream.
   * - 'full': Header-based CSV with rich metadata (gold tier)
   * - 'lite': Headerless CSV with minimal data (silver tier)
   * - null: No GPS data available (bronze tier)
   */
  readonly format: 'full' | 'lite' | null;

  /** URL to fetch GPS data, or null if not available */
  readonly url: string | null;
}

/**
 * GTFS static data configuration for a city.
 */
export interface GtfsConfig {
  /** Whether GTFS data is available for this city */
  readonly enabled: boolean;

  /**
   * URL to download GTFS ZIP archive.
   * Pattern: https://www.stops.lt/${city}/${city}/gtfs.zip
   */
  readonly url: string;
}

/**
 * Complete configuration for a city's transport data.
 * Note: 'id' field is typed as string here but CityId union is derived from CITY_CONFIGS keys.
 */
export interface CityConfig {
  /** City identifier */
  readonly id: string;

  /** Data quality tier */
  readonly tier: CityTier;

  /** GPS stream configuration */
  readonly gps: GpsConfig;

  /** GTFS static data configuration */
  readonly gtfs: GtfsConfig;
  
  /** 
   * Lite format descriptor for silver-tier cities.
   * Required when gps.format is 'lite'.
   * If not provided, falls back to LITE_FORMAT_DESCRIPTORS lookup.
   */
  readonly liteFormat?: LiteFormatDescriptor;
}

// =============================================================================
// City Configuration Matrix
// =============================================================================

/**
 * Base URL for stops.lt infrastructure.
 */
const BASE_URL = 'https://www.stops.lt';

/**
 * Helper to build GPS full URL.
 */
function gpsFullUrl(city: string): string {
  return `${BASE_URL}/${city}/gps_full.txt`;
}

/**
 * Helper to build GPS lite URL.
 */
function gpsLiteUrl(city: string): string {
  return `${BASE_URL}/${city}/gps.txt`;
}

/**
 * Helper to build GTFS URL.
 * Note: URL pattern uses double city name: /city/city/gtfs.zip
 */
function gtfsUrl(city: string): string {
  return `${BASE_URL}/${city}/${city}/gtfs.zip`;
}

/**
 * City configuration matrix with all supported cities.
 * 
 * Data Quality Tiers:
 * - Gold: Full GPS streams with 12-18 columns including destination, delay, equipment
 * - Silver: Lite GPS streams with 8-9 columns, requires GTFS enrichment for destinations
 * - Bronze: GTFS only, no real-time GPS data available
 * 
 * Column Counts (empirically verified 2026-01-05):
 * - Vilnius: 18 columns (MatavimoLaikas, KryptiesTipas, ReisoIdGTFS)
 * - Kaunas: 14 columns (Grafikas, SekanciosStotelesNum, AtvykimoLaikasSekundemis - NO MatavimoLaikas)
 * - Klaipėda: 12 columns (minimal format)
 * - Alytus: 13 columns
 * - Druskininkai: 13 columns
 * - Panevėžys: 9 columns lite (no header)
 * - Tauragė: 8 columns lite (no header, alphanumeric routes like S11)
 */
const CITY_CONFIGS_INTERNAL = {
  vilnius: {
    id: 'vilnius',
    tier: 'gold',
    gps: {
      enabled: true,
      format: 'full',
      url: gpsFullUrl('vilnius'),
    },
    gtfs: {
      enabled: true,
      url: gtfsUrl('vilnius'),
    },
  },

  kaunas: {
    id: 'kaunas',
    tier: 'gold',
    gps: {
      enabled: true,
      format: 'full',
      url: gpsFullUrl('kaunas'),
    },
    gtfs: {
      enabled: true,
      url: gtfsUrl('kaunas'),
    },
  },

  klaipeda: {
    id: 'klaipeda',
    tier: 'gold',
    gps: {
      enabled: true,
      format: 'full',
      url: gpsFullUrl('klaipeda'),
    },
    gtfs: {
      enabled: true,
      url: gtfsUrl('klaipeda'),
    },
  },

  alytus: {
    id: 'alytus',
    tier: 'gold',
    gps: {
      enabled: true,
      format: 'full',
      url: gpsFullUrl('alytus'),
    },
    gtfs: {
      enabled: true,
      url: gtfsUrl('alytus'),
    },
  },

  druskininkai: {
    id: 'druskininkai',
    tier: 'gold',
    gps: {
      enabled: true,
      format: 'full',
      url: gpsFullUrl('druskininkai'),
    },
    gtfs: {
      enabled: true,
      url: gtfsUrl('druskininkai'),
    },
  },

  panevezys: {
    id: 'panevezys',
    tier: 'silver',
    gps: {
      enabled: true,
      format: 'lite',
      url: gpsLiteUrl('panevezys'),
    },
    gtfs: {
      enabled: true,
      url: gtfsUrl('panevezys'),
    },
    liteFormat: LITE_FORMAT_DESCRIPTORS.panevezys,
  },

  taurage: {
    id: 'taurage',
    tier: 'silver',
    gps: {
      enabled: true,
      format: 'lite',
      url: gpsLiteUrl('taurage'),
    },
    gtfs: {
      enabled: true,
      url: gtfsUrl('taurage'),
    },
    liteFormat: LITE_FORMAT_DESCRIPTORS.taurage,
  },

  siauliai: {
    id: 'siauliai',
    tier: 'bronze',
    gps: {
      enabled: false,
      format: null,
      url: null,
    },
    gtfs: {
      enabled: true,
      url: gtfsUrl('siauliai'),
    },
  },

  utena: {
    id: 'utena',
    tier: 'bronze',
    gps: {
      enabled: false,
      format: null,
      url: null,
    },
    gtfs: {
      enabled: true,
      url: gtfsUrl('utena'),
    },
  },
} as const;

/**
 * Supported city identifiers derived from configuration keys.
 * Each city has specific GPS and GTFS data availability.
 */
export type CityId = keyof typeof CITY_CONFIGS_INTERNAL;

/**
 * City configuration matrix with all supported cities.
 */
export const CITY_CONFIGS: Readonly<Record<CityId, CityConfig>> = CITY_CONFIGS_INTERNAL;

/**
 * List of all supported city IDs.
 */
export const ALL_CITY_IDS: readonly CityId[] = Object.keys(CITY_CONFIGS) as CityId[];

/**
 * Get configuration for a specific city.
 * @throws Error if city ID is invalid
 */
export function getCityConfig(city: CityId): CityConfig {
  return CITY_CONFIGS[city];
}

/**
 * Get all cities of a specific tier.
 */
export function getCitiesByTier(tier: CityTier): CityId[] {
  return ALL_CITY_IDS.filter(city => CITY_CONFIGS[city].tier === tier);
}

/**
 * Check if a city has GPS data available.
 */
export function hasGpsData(city: CityId): boolean {
  return CITY_CONFIGS[city].gps.enabled;
}

/**
 * Check if a city has GTFS data available.
 */
export function hasGtfsData(city: CityId): boolean {
  return CITY_CONFIGS[city].gtfs.enabled;
}

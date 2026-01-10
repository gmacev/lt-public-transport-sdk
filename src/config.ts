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
const STOPS_LT_BASE_URL = 'https://www.stops.lt';

/**
 * Base URL for visimarsrutai.lt infrastructure.
 */
const VISIMARSRUTAI_BASE_URL = 'https://www.visimarsrutai.lt';

/**
 * Helper to build GPS full URL (stops.lt).
 */
function gpsFullUrl(city: string): string {
  return `${STOPS_LT_BASE_URL}/${city}/gps_full.txt`;
}

/**
 * Helper to build GPS lite URL (stops.lt).
 */
function gpsLiteUrl(city: string): string {
  return `${STOPS_LT_BASE_URL}/${city}/gps.txt`;
}

/**
 * Helper to build GTFS URL (visimarsrutai.lt).
 * Used for bronze-tier cities (GTFS-only, no GPS).
 */
function gtfsUrl(dataset: string): string {
  return `${VISIMARSRUTAI_BASE_URL}/gtfs/${dataset}.zip`;
}

/**
 * Helper to build GTFS URL (stops.lt).
 * Used for gold/silver-tier cities to ensure GPS ↔ GTFS ID compatibility.
 */
function stopsLtGtfsUrl(city: string): string {
  return `${STOPS_LT_BASE_URL}/${city}/${city}/gtfs.zip`;
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
      url: stopsLtGtfsUrl('vilnius'),
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
      url: stopsLtGtfsUrl('kaunas'),
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
      url: stopsLtGtfsUrl('klaipeda'),
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
      url: stopsLtGtfsUrl('alytus'),
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
      url: stopsLtGtfsUrl('druskininkai'),
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
      url: stopsLtGtfsUrl('panevezys'),
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
      url: stopsLtGtfsUrl('taurage'),
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
      url: gtfsUrl('SiauliuM'),
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
      url: gtfsUrl('UtenosR'),
    },
  },

  /**
   * National intercity bus data from LTSAR (Lietuvos transporto saugos administracija).
   * Covers all of Lithuania, not a single city.
   */
  intercity: {
    id: 'intercity',
    tier: 'bronze',
    gps: { enabled: false, format: null, url: null },
    gtfs: { enabled: true, url: gtfsUrl('LTSAR') },
  },

  // ==========================================================================
  // Regional / District Bus Networks (visimarsrutai.lt)
  // All bronze tier - GTFS only, no live GPS
  // ==========================================================================

  // Cities / Municipalities
  palanga: {
    id: 'palanga',
    tier: 'bronze',
    gps: { enabled: false, format: null, url: null },
    gtfs: { enabled: true, url: gtfsUrl('PalangosM') },
  },
  visaginas: {
    id: 'visaginas',
    tier: 'bronze',
    gps: { enabled: false, format: null, url: null },
    gtfs: { enabled: true, url: gtfsUrl('VisaginoM') },
  },
  marijampole: {
    id: 'marijampole',
    tier: 'bronze',
    gps: { enabled: false, format: null, url: null },
    gtfs: { enabled: true, url: gtfsUrl('Marijampoles') },
  },
  elektrenai: {
    id: 'elektrenai',
    tier: 'bronze',
    gps: { enabled: false, format: null, url: null },
    gtfs: { enabled: true, url: gtfsUrl('Elektrenu') },
  },
  neringa: {
    id: 'neringa',
    tier: 'bronze',
    gps: { enabled: false, format: null, url: null },
    gtfs: { enabled: true, url: gtfsUrl('neringa') },
  },
  birstonas: {
    id: 'birstonas',
    tier: 'bronze',
    gps: { enabled: false, format: null, url: null },
    gtfs: { enabled: true, url: gtfsUrl('BirstonoSav') },
  },

  // Districts (Rajonai)
  akmene: {
    id: 'akmene',
    tier: 'bronze',
    gps: { enabled: false, format: null, url: null },
    gtfs: { enabled: true, url: gtfsUrl('AkmenesR') },
  },
  alytus_region: {
    id: 'alytus_region',
    tier: 'bronze',
    gps: { enabled: false, format: null, url: null },
    gtfs: { enabled: true, url: gtfsUrl('AlytausR') },
  },
  anyksciai: {
    id: 'anyksciai',
    tier: 'bronze',
    gps: { enabled: false, format: null, url: null },
    gtfs: { enabled: true, url: gtfsUrl('AnyksciuR') },
  },
  birzai: {
    id: 'birzai',
    tier: 'bronze',
    gps: { enabled: false, format: null, url: null },
    gtfs: { enabled: true, url: gtfsUrl('BirzuR') },
  },
  ignalina: {
    id: 'ignalina',
    tier: 'bronze',
    gps: { enabled: false, format: null, url: null },
    gtfs: { enabled: true, url: gtfsUrl('IgnalinosR') },
  },
  jonava: {
    id: 'jonava',
    tier: 'bronze',
    gps: { enabled: false, format: null, url: null },
    gtfs: { enabled: true, url: gtfsUrl('JonavosR') },
  },
  joniskis: {
    id: 'joniskis',
    tier: 'bronze',
    gps: { enabled: false, format: null, url: null },
    gtfs: { enabled: true, url: gtfsUrl('JoniskioR') },
  },
  jurbarkas: {
    id: 'jurbarkas',
    tier: 'bronze',
    gps: { enabled: false, format: null, url: null },
    gtfs: { enabled: true, url: gtfsUrl('JurbarkoR') },
  },
  kaunas_region: {
    id: 'kaunas_region',
    tier: 'bronze',
    gps: { enabled: false, format: null, url: null },
    gtfs: { enabled: true, url: gtfsUrl('KaunoR') },
  },
  kedainiai: {
    id: 'kedainiai',
    tier: 'bronze',
    gps: { enabled: false, format: null, url: null },
    gtfs: { enabled: true, url: gtfsUrl('KedainiuR') },
  },
  kelme: {
    id: 'kelme',
    tier: 'bronze',
    gps: { enabled: false, format: null, url: null },
    gtfs: { enabled: true, url: gtfsUrl('KelmesR') },
  },
  kaisiadorys: {
    id: 'kaisiadorys',
    tier: 'bronze',
    gps: { enabled: false, format: null, url: null },
    gtfs: { enabled: true, url: gtfsUrl('KiasiadoriuR') },
  },
  kretinga: {
    id: 'kretinga',
    tier: 'bronze',
    gps: { enabled: false, format: null, url: null },
    gtfs: { enabled: true, url: gtfsUrl('KretingosR') },
  },
  kupiskis: {
    id: 'kupiskis',
    tier: 'bronze',
    gps: { enabled: false, format: null, url: null },
    gtfs: { enabled: true, url: gtfsUrl('KupiskioR') },
  },
  lazdijai: {
    id: 'lazdijai',
    tier: 'bronze',
    gps: { enabled: false, format: null, url: null },
    gtfs: { enabled: true, url: gtfsUrl('LazdijuR') },
  },
  mazeikiai: {
    id: 'mazeikiai',
    tier: 'bronze',
    gps: { enabled: false, format: null, url: null },
    gtfs: { enabled: true, url: gtfsUrl('MazeikiuR') },
  },
  moletai: {
    id: 'moletai',
    tier: 'bronze',
    gps: { enabled: false, format: null, url: null },
    gtfs: { enabled: true, url: gtfsUrl('MoletuR') },
  },
  pakruojis: {
    id: 'pakruojis',
    tier: 'bronze',
    gps: { enabled: false, format: null, url: null },
    gtfs: { enabled: true, url: gtfsUrl('PakruojoR') },
  },
  panevezys_region: {
    id: 'panevezys_region',
    tier: 'bronze',
    gps: { enabled: false, format: null, url: null },
    gtfs: { enabled: true, url: gtfsUrl('PanevezioR') },
  },
  pasvalys: {
    id: 'pasvalys',
    tier: 'bronze',
    gps: { enabled: false, format: null, url: null },
    gtfs: { enabled: true, url: gtfsUrl('PasvalioR') },
  },
  plunge: {
    id: 'plunge',
    tier: 'bronze',
    gps: { enabled: false, format: null, url: null },
    gtfs: { enabled: true, url: gtfsUrl('PlungesR') },
  },
  radviliskis: {
    id: 'radviliskis',
    tier: 'bronze',
    gps: { enabled: false, format: null, url: null },
    gtfs: { enabled: true, url: gtfsUrl('RadviliskioR') },
  },
  raseiniai: {
    id: 'raseiniai',
    tier: 'bronze',
    gps: { enabled: false, format: null, url: null },
    gtfs: { enabled: true, url: gtfsUrl('RaseiniuR') },
  },
  rokiskis: {
    id: 'rokiskis',
    tier: 'bronze',
    gps: { enabled: false, format: null, url: null },
    gtfs: { enabled: true, url: gtfsUrl('RokiskioR') },
  },
  salcininkai: {
    id: 'salcininkai',
    tier: 'bronze',
    gps: { enabled: false, format: null, url: null },
    gtfs: { enabled: true, url: gtfsUrl('SalcininkuR') },
  },
  siauliai_region: {
    id: 'siauliai_region',
    tier: 'bronze',
    gps: { enabled: false, format: null, url: null },
    gtfs: { enabled: true, url: gtfsUrl('SiauliuR') },
  },
  silute: {
    id: 'silute',
    tier: 'bronze',
    gps: { enabled: false, format: null, url: null },
    gtfs: { enabled: true, url: gtfsUrl('SilutesR') },
  },
  sirvintos: {
    id: 'sirvintos',
    tier: 'bronze',
    gps: { enabled: false, format: null, url: null },
    gtfs: { enabled: true, url: gtfsUrl('SirvintuR') },
  },
  skuodas: {
    id: 'skuodas',
    tier: 'bronze',
    gps: { enabled: false, format: null, url: null },
    gtfs: { enabled: true, url: gtfsUrl('SkuodoR') },
  },
  svencionys: {
    id: 'svencionys',
    tier: 'bronze',
    gps: { enabled: false, format: null, url: null },
    gtfs: { enabled: true, url: gtfsUrl('SvencioniuR') },
  },
  trakai: {
    id: 'trakai',
    tier: 'bronze',
    gps: { enabled: false, format: null, url: null },
    gtfs: { enabled: true, url: gtfsUrl('TrakuR') },
  },
  ukmerge: {
    id: 'ukmerge',
    tier: 'bronze',
    gps: { enabled: false, format: null, url: null },
    gtfs: { enabled: true, url: gtfsUrl('UkmergesR') },
  },
  varena: {
    id: 'varena',
    tier: 'bronze',
    gps: { enabled: false, format: null, url: null },
    gtfs: { enabled: true, url: gtfsUrl('VarenosR') },
  },
  vilnius_region: {
    id: 'vilnius_region',
    tier: 'bronze',
    gps: { enabled: false, format: null, url: null },
    gtfs: { enabled: true, url: gtfsUrl('VilniausR') },
  },
  zarasai: {
    id: 'zarasai',
    tier: 'bronze',
    gps: { enabled: false, format: null, url: null },
    gtfs: { enabled: true, url: gtfsUrl('ZarasuR') },
  },

  // Ferry
  smiltyne: {
    id: 'smiltyne',
    tier: 'bronze',
    gps: { enabled: false, format: null, url: null },
    gtfs: { enabled: true, url: gtfsUrl('SmiltynesP') },
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

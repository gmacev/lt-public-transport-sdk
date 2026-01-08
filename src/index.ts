/**
 * Lithuanian Public Transport SDK
 * 
 * A production-grade TypeScript SDK for accessing real-time Lithuanian
 * public transport data from stops.lt infrastructure.
 * 
 * @example
 * ```typescript
 * import { LtTransport } from 'lt-public-transport-sdk';
 * 
 * const transport = new LtTransport();
 * 
 * // Sync GTFS data (required for enrichment)
 * await transport.sync('vilnius');
 * 
 * // Get real-time vehicle positions
 * const vehicles = await transport.getVehicles('vilnius');
 * 
 * // Get static stop data
 * const stops = await transport.getStops('vilnius');
 * ```
 * 
 * @module
 */

import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { CityId, Route, Stop, SyncResult, Vehicle } from './types.js';
import { CITY_CONFIGS, ALL_CITY_IDS, type CityConfig } from './config.js';
import {
  TransportNetworkError,
  GpsNotAvailableError,
  SyncRequiredError,
  InvalidCityError,
} from './errors.js';
import { parseGpsFullStream } from './parsers/gps-full.js';
import { parseGpsLiteStream, getLiteFormatDescriptor } from './parsers/gps-lite.js';
import { syncGtfs, loadGtfsCache, loadCachedRoutes, loadCachedStops } from './gtfs/sync.js';
import { enrichVehicles, buildRouteCache, type RouteCache } from './enrichment/route-matcher.js';
import { clientConfigSchema } from './schemas.js';

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Configuration options for LtTransport client.
 */
export interface LtTransportConfig {
  /** 
   * Directory for caching GTFS data.
   * Defaults to system temp directory.
   */
  cacheDir?: string;

  /** 
   * Request timeout in milliseconds.
   * @default 10000
   */
  requestTimeout?: number;

  /** 
   * User-Agent header for HTTP requests.
   * @default 'lt-public-transport-sdk/1.0.0'
   */
  userAgent?: string;

  /** 
   * Threshold in milliseconds for marking data as stale.
   * @default 300000 (5 minutes)
   */
  staleThresholdMs?: number;
  
  /**
   * Whether to automatically enrich silver-tier cities with GTFS data.
   * Requires prior sync() call for the city.
   * @default true
   */
  autoEnrich?: boolean;
  
  /**
   * Whether to filter out vehicles with invalid (out of Lithuania) coordinates.
   * @default true
   */
  filterInvalidCoords?: boolean;
  
  /**
   * Whether to filter out stale data.
   * @default false
   */
  filterStale?: boolean;
  
  // ===========================================================================
  // Extension Points
  // ===========================================================================
  
  /**
   * Add custom cities not yet included in the SDK.
   * Allows using new cities immediately without waiting for SDK updates.
   * 
   * @example
   * ```typescript
   * const transport = new LtTransport({
   *   customCities: {
   *     marijampole: {
   *       id: 'marijampole',
   *       tier: 'silver',
   *       gps: { enabled: true, format: 'lite', url: 'https://www.stops.lt/marijampole/gps.txt' },
   *       gtfs: { enabled: true, url: 'https://www.stops.lt/marijampole/marijampole/gtfs.zip' },
   *       liteFormat: { minColumns: 9, vehicleIdIndex: 7, routeIndex: 1, coordIndices: [3, 2], speedIndex: 4, bearingIndex: 5 }
   *     }
   *   }
   * });
   * ```
   */
  customCities?: Record<string, CityConfig>;
  
  /**
   * Override configuration for existing built-in cities.
   * Useful when a city changes its data format before SDK is updated.
   * Overrides are deeply merged with the built-in configuration.
   * 
   * @example
   * ```typescript
   * const transport = new LtTransport({
   *   cityOverrides: {
   *     panevezys: {
   *       liteFormat: { minColumns: 10, vehicleIdIndex: 8, ... } // They added a column
   *     }
   *   }
   * });
   * ```
   */
  cityOverrides?: Partial<Record<CityId, Partial<CityConfig>>>;
}

// =============================================================================
// Default Values
// =============================================================================

const DEFAULT_TIMEOUT = 10000;
const DEFAULT_USER_AGENT = 'lt-public-transport-sdk/1.0.0';
const DEFAULT_STALE_THRESHOLD = 5 * 60 * 1000; // 5 minutes

/**
 * Get default cache directory.
 */
function getDefaultCacheDir(): string {
  return join(tmpdir(), 'lt-transport-sdk-cache');
}

// =============================================================================
// Main Client Class
// =============================================================================

/**
 * Lithuanian Public Transport SDK client.
 * 
 * Provides unified access to real-time GPS vehicle positions and
 * static GTFS data for Lithuanian cities.
 * 
 * @example
 * ```typescript
 * const transport = new LtTransport();
 * 
 * // Get vehicles from Vilnius (gold tier - rich data)
 * const vilniusVehicles = await transport.getVehicles('vilnius');
 * 
 * // Get vehicles from Panevėžys (silver tier - needs enrichment)
 * await transport.sync('panevezys'); // Sync GTFS first
 * const panevezysVehicles = await transport.getVehicles('panevezys');
 * ```
 */
export class LtTransport {
  private readonly cacheDir: string;
  private readonly requestTimeout: number;
  private readonly userAgent: string;
  private readonly staleThresholdMs: number;
  private readonly autoEnrich: boolean;
  private readonly filterInvalidCoords: boolean;
  private readonly filterStale: boolean;
  
  /** 
   * Effective city configurations (built-in + custom + overrides merged).
   * This is the source of truth for city configs in this instance.
   */
  private readonly effectiveCityConfigs: Map<string, CityConfig>;
  
  /** Sorted list of all effective city IDs */
  private readonly effectiveCityIds: readonly string[];
  
  /** In-memory route cache for fast enrichment */
  private readonly routeCaches = new Map<string, RouteCache>();
  
  /** Last sync timestamps for throttling */
  private readonly lastSyncTimes = new Map<string, number>();

  /**
   * Create a new LtTransport client.
   * 
   * @param config - Client configuration options
   * @throws {ZodError} If config validation fails (includes helpful error messages)
   */
  constructor(config: LtTransportConfig = {}) {
    // Validate entire config with Zod schema for runtime safety
    // This validates customCities and cityOverrides structure and values
    const validated = clientConfigSchema.parse({
      cacheDir: config.cacheDir,
      requestTimeout: config.requestTimeout ?? DEFAULT_TIMEOUT,
      userAgent: config.userAgent ?? DEFAULT_USER_AGENT,
      staleThresholdMs: config.staleThresholdMs ?? DEFAULT_STALE_THRESHOLD,
      autoEnrich: config.autoEnrich ?? true,
      filterInvalidCoords: config.filterInvalidCoords ?? true,
      filterStale: config.filterStale ?? false,
      customCities: config.customCities,
      cityOverrides: config.cityOverrides,
    });
    
    this.cacheDir = validated.cacheDir ?? getDefaultCacheDir();
    this.requestTimeout = validated.requestTimeout;
    this.userAgent = validated.userAgent;
    this.staleThresholdMs = validated.staleThresholdMs;
    this.autoEnrich = validated.autoEnrich;
    this.filterInvalidCoords = validated.filterInvalidCoords;
    this.filterStale = validated.filterStale;
    
    // Build effective city configurations by merging:
    // 1. Built-in CITY_CONFIGS
    // 2. Custom cities from config.customCities
    // 3. Overrides from config.cityOverrides
    this.effectiveCityConfigs = this.buildEffectiveCityConfigs(
      validated.customCities,
      validated.cityOverrides
    );
    
    // Build sorted list of city IDs
    this.effectiveCityIds = Array.from(this.effectiveCityConfigs.keys()).sort();
  }
  
  /**
   * Build effective city configurations by merging built-in, custom, and overrides.
   */
  private buildEffectiveCityConfigs(
    customCities?: Record<string, CityConfig>,
    cityOverrides?: Partial<Record<CityId, Partial<CityConfig>>>
  ): Map<string, CityConfig> {
    const configs = new Map<string, CityConfig>();
    
    // Step 1: Add all built-in cities
    for (const cityId of ALL_CITY_IDS) {
      configs.set(cityId, CITY_CONFIGS[cityId]);
    }
    
    // Step 2: Apply overrides to built-in cities
    if (cityOverrides) {
      for (const [cityId, override] of Object.entries(cityOverrides)) {
        const existing = configs.get(cityId);
        if (existing !== undefined) {
          configs.set(cityId, this.mergeCityConfig(existing, override));
        }
      }
    }
    
    // Step 3: Add custom cities (can override built-in if same ID)
    if (customCities) {
      for (const [cityId, cityConfig] of Object.entries(customCities)) {
        configs.set(cityId, cityConfig);
      }
    }
    
    return configs;
  }
  
  /**
   * Deep merge a city config with partial overrides.
   */
  private mergeCityConfig(base: CityConfig, override: Partial<CityConfig>): CityConfig {
    return {
      id: override.id ?? base.id,
      tier: override.tier ?? base.tier,
      gps: override.gps ? { ...base.gps, ...override.gps } : base.gps,
      gtfs: override.gtfs ? { ...base.gtfs, ...override.gtfs } : base.gtfs,
      liteFormat: override.liteFormat ?? base.liteFormat,
    };
  }
  
  /**
   * Get effective city config for a city ID.
   * Checks the merged config map which includes built-in, custom, and overridden configs.
   */
  private getEffectiveCityConfig(cityId: string): CityConfig | undefined {
    return this.effectiveCityConfigs.get(cityId);
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Get real-time vehicle positions for a city.
   * 
   * For silver-tier cities, vehicles will be enriched with GTFS data 
   * if `sync()` has been called and `autoEnrich` is enabled.
   * 
   * @param city - City identifier (built-in or custom)
   * @returns Array of vehicle positions
   * @throws {GpsNotAvailableError} If city has no GPS data (bronze tier)
   * @throws {TransportNetworkError} If network request fails
   * @throws {InvalidCityError} If city is not recognized
   * 
   * @example
   * ```typescript
   * const vehicles = await transport.getVehicles('vilnius');
   * console.log(`Found ${vehicles.length} vehicles`);
   * ```
   */
  async getVehicles(city: string): Promise<Vehicle[]> {
    const config = this.getEffectiveCityConfig(city);
    
    if (!config) {
      throw new InvalidCityError(city);
    }
    
    if (!config.gps.enabled || config.gps.url === null) {
      throw new GpsNotAvailableError(city);
    }

    // Fetch GPS data
    const text = await this.fetchText(config.gps.url, city);

    // Parse based on format
    let vehicles: Vehicle[];
    
    if (config.gps.format === 'full') {
      // Gold tier: header-based CSV with rich metadata
      vehicles = parseGpsFullStream(text, city as CityId, {
        staleThresholdMs: this.staleThresholdMs,
        filterStale: this.filterStale,
        filterInvalidCoords: this.filterInvalidCoords,
      });
    } else if (config.gps.format === 'lite') {
      // Silver tier: headerless CSV using format descriptor
      const liteFormat = getLiteFormatDescriptor(city, config);
      
      if (!liteFormat) {
        // No format descriptor available - can't parse
        console.warn(`No lite format descriptor for city: ${city}. Add liteFormat to city config.`);
        vehicles = [];
      } else {
        vehicles = parseGpsLiteStream(text, city, liteFormat, {
          filterInvalidCoords: this.filterInvalidCoords,
        });
        
        // Enrich silver-tier cities with GTFS data
        if (this.autoEnrich) {
          const routeCache = await this.getRouteCache(city);
          if (routeCache) {
            vehicles = enrichVehicles(vehicles, routeCache);
          }
        }
      }
    } else {
      // Unknown format (bronze tier or misconfigured)
      vehicles = [];
    }

    return vehicles;
  }

  /**
   * Sync GTFS static data for a city.
   * 
   * Downloads the GTFS ZIP archive if newer than cached version,
   * extracts routes and stops, and caches for future use.
   * 
   * Throttled to minimum 60 seconds between calls for same city.
   * 
   * @param city - City to sync (built-in or custom)
   * @param force - Force re-download even if cache is current
   * @returns Sync result with counts and status
   * @throws {GtfsSyncError} If sync fails
   * @throws {InvalidCityError} If city is not recognized
   * 
   * @example
   * ```typescript
   * const result = await transport.sync('vilnius');
   * console.log(`Synced ${result.routeCount} routes`);
   * ```
   */
  async sync(city: string, force = false): Promise<SyncResult> {
    const config = this.getEffectiveCityConfig(city);
    
    if (!config) {
      throw new InvalidCityError(city);
    }
    
    // Throttle sync calls (60s minimum between calls)
    const lastSync = this.lastSyncTimes.get(city);
    const now = Date.now();
    
    if (!force && lastSync !== undefined && (now - lastSync) < 60000) {
      // Return cached result
      const cache = await loadGtfsCache(city as CityId, this.cacheDir);
      if (cache) {
        return {
          city: city as CityId,
          status: 'up-to-date',
          routeCount: cache.meta.routeCount,
          stopCount: cache.meta.stopCount,
          lastModified: cache.meta.lastModified,
          syncedAt: new Date(cache.meta.syncedAt),
        };
      }
    }

    const result = await syncGtfs(city as CityId, {
      cacheDir: this.cacheDir,
      timeout: this.requestTimeout * 3, // Longer timeout for downloads
      userAgent: this.userAgent,
      force,
    });

    this.lastSyncTimes.set(city, now);
    
    // Clear in-memory cache to force reload
    this.routeCaches.delete(city);

    return result;
  }

  /**
   * Get static stop data for a city.
   * 
   * Requires prior `sync()` call to download GTFS data.
   * 
   * @param city - City to get stops for
   * @returns Array of stops
   * @throws {SyncRequiredError} If GTFS data not synced
   * @throws {InvalidCityError} If city is not recognized
   * 
   * @example
   * ```typescript
   * await transport.sync('vilnius');
   * const stops = await transport.getStops('vilnius');
   * console.log(`Found ${stops.length} stops`);
   * ```
   */
  async getStops(city: string): Promise<Stop[]> {
    const config = this.getEffectiveCityConfig(city);
    
    if (!config) {
      throw new InvalidCityError(city);
    }
    
    const stops = await loadCachedStops(this.cacheDir, city as CityId);
    
    if (!stops) {
      throw new SyncRequiredError(city);
    }

    return stops;
  }

  /**
   * Get route information for a city.
   * 
   * Requires prior `sync()` call to download GTFS data.
   * 
   * @param city - City to get routes for
   * @returns Array of routes
   * @throws {SyncRequiredError} If GTFS data not synced
   * @throws {InvalidCityError} If city is not recognized
   * 
   * @example
   * ```typescript
   * await transport.sync('vilnius');
   * const routes = await transport.getRoutes('vilnius');
   * console.log(`Found ${routes.length} routes`);
   * ```
   */
  async getRoutes(city: string): Promise<Route[]> {
    const config = this.getEffectiveCityConfig(city);
    
    if (!config) {
      throw new InvalidCityError(city);
    }
    
    const routeCache = await this.getRouteCache(city);
    
    if (!routeCache) {
      throw new SyncRequiredError(city);
    }

    // Deduplicate (cache has entries by both short name and ID)
    const seen = new Set<string>();
    const routes: Route[] = [];
    
    for (const route of routeCache.routes.values()) {
      if (!seen.has(route.id)) {
        seen.add(route.id);
        routes.push(route);
      }
    }

    return routes;
  }

  /**
   * Get list of all available city IDs.
   * Includes built-in cities and any custom cities added via config.
   */
  getCities(): readonly string[] {
    return this.effectiveCityIds;
  }

  /**
   * Get configuration for a specific city.
   * Returns effective config (with any overrides applied).
   * 
   * @throws {InvalidCityError} If city is not found
   */
  getCityConfig(city: string): CityConfig {
    const config = this.getEffectiveCityConfig(city);
    if (!config) {
      throw new InvalidCityError(city);
    }
    return config;
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Fetch text content from URL.
   */
  private async fetchText(url: string, city: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => { controller.abort(); }, this.requestTimeout);

    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': this.userAgent },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new TransportNetworkError(
          `HTTP ${String(response.status)}: ${response.statusText}`,
          city,
          response.status
        );
      }

      return await response.text();
    } catch (error) {
      if (error instanceof TransportNetworkError) {
        throw error;
      }
      
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new TransportNetworkError(message, city, undefined, error instanceof Error ? error : undefined);
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Get route cache for a city, loading from disk if needed.
   */
  private async getRouteCache(city: string): Promise<RouteCache | null> {
    // Check in-memory cache first
    const cached = this.routeCaches.get(city);
    if (cached) {
      return cached;
    }

    // Load from disk
    const routes = await loadCachedRoutes(this.cacheDir, city as CityId);
    
    if (routes) {
      // Build RouteCache with normalized lookup map for O(1) case-insensitive matching
      const cache = buildRouteCache(routes);
      this.routeCaches.set(city, cache);
      return cache;
    }

    return null;
  }
}

// =============================================================================
// Re-exports
// =============================================================================

// Types
export type {
  CityId,
  CityTier,
  VehicleType,
  Vehicle,
  Stop,
  Route,
  SyncResult,
} from './types.js';

export { GTFS_ROUTE_TYPE_MAP, LT_TRANSPORT_TYPE_MAP } from './types.js';

// Config
export { CITY_CONFIGS, ALL_CITY_IDS, getCityConfig, getCitiesByTier, hasGpsData, hasGtfsData, LITE_FORMAT_DESCRIPTORS } from './config.js';
export type { CityConfig, GpsConfig, GtfsConfig, LiteFormatDescriptor } from './config.js';

// Errors
export {
  TransportError,
  TransportNetworkError,
  GpsNotAvailableError,
  SyncRequiredError,
  GtfsSyncError,
  ParseError,
  InvalidCityError,
  isTransportError,
  isNetworkError,
} from './errors.js';

// Utilities
export {
  normalizeCoordinate,
  isValidLithuaniaCoord,
  LITHUANIA_BOUNDS,
  repairMojibake,
  secondsFromMidnightToDate,
  isDataStale,
} from './utils/index.js';

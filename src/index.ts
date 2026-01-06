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
import { CITY_CONFIGS, getCityConfig, ALL_CITY_IDS, type CityConfig } from './config.js';
import {
  TransportNetworkError,
  GpsNotAvailableError,
  SyncRequiredError,
  InvalidCityError,
} from './errors.js';
import { parseGpsFullStream } from './parsers/gps-full.js';
import { parseGpsLiteStream, isLiteCity } from './parsers/gps-lite.js';
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
  
  /** In-memory route cache for fast enrichment */
  private readonly routeCaches = new Map<CityId, RouteCache>();
  
  /** Last sync timestamps for throttling */
  private readonly lastSyncTimes = new Map<CityId, number>();

  /**
   * Create a new LtTransport client.
   * 
   * @param config - Client configuration options
   */
  constructor(config: LtTransportConfig = {}) {
    // Validate config with Zod schema for runtime safety
    const validated = clientConfigSchema.parse({
      cacheDir: config.cacheDir,
      requestTimeout: config.requestTimeout ?? DEFAULT_TIMEOUT,
      userAgent: config.userAgent ?? DEFAULT_USER_AGENT,
      staleThresholdMs: config.staleThresholdMs ?? DEFAULT_STALE_THRESHOLD,
      autoEnrich: config.autoEnrich ?? true,
      filterInvalidCoords: config.filterInvalidCoords ?? true,
      filterStale: config.filterStale ?? false,
    });
    
    this.cacheDir = validated.cacheDir ?? getDefaultCacheDir();
    this.requestTimeout = validated.requestTimeout;
    this.userAgent = validated.userAgent;
    this.staleThresholdMs = validated.staleThresholdMs;
    this.autoEnrich = validated.autoEnrich;
    this.filterInvalidCoords = validated.filterInvalidCoords;
    this.filterStale = validated.filterStale;
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Get real-time vehicle positions for a city.
   * 
   * For silver-tier cities (Panevėžys, Tauragė), vehicles will be enriched
   * with GTFS data if `sync()` has been called and `autoEnrich` is enabled.
   * 
   * @param city - City identifier
   * @returns Array of vehicle positions
   * @throws {GpsNotAvailableError} If city is bronze tier (no GPS data)
   * @throws {TransportNetworkError} If network request fails
   * 
   * @example
   * ```typescript
   * const vehicles = await transport.getVehicles('vilnius');
   * console.log(`Found ${vehicles.length} vehicles`);
   * ```
   */
  async getVehicles(city: CityId): Promise<Vehicle[]> {
    this.validateCity(city);
    
    const config = getCityConfig(city);
    
    if (!config.gps.enabled || config.gps.url === null) {
      throw new GpsNotAvailableError(city);
    }

    // Fetch GPS data
    const text = await this.fetchText(config.gps.url, city);

    // Parse based on format
    let vehicles: Vehicle[];
    
    if (config.gps.format === 'full') {
      vehicles = parseGpsFullStream(text, city, {
        staleThresholdMs: this.staleThresholdMs,
        filterStale: this.filterStale,
        filterInvalidCoords: this.filterInvalidCoords,
      });
    } else if (isLiteCity(city)) {
      vehicles = parseGpsLiteStream(text, city, {
        filterInvalidCoords: this.filterInvalidCoords,
      });
      
      // Enrich silver-tier cities with GTFS data
      if (this.autoEnrich) {
        const routeCache = await this.getRouteCache(city);
        if (routeCache) {
          vehicles = enrichVehicles(vehicles, routeCache);
        }
      }
    } else {
      // Unknown format
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
   * @param city - City to sync
   * @param force - Force re-download even if cache is current
   * @returns Sync result with counts and status
   * @throws {GtfsSyncError} If sync fails
   * 
   * @example
   * ```typescript
   * const result = await transport.sync('vilnius');
   * console.log(`Synced ${result.routeCount} routes`);
   * ```
   */
  async sync(city: CityId, force = false): Promise<SyncResult> {
    this.validateCity(city);
    
    // Throttle sync calls (60s minimum between calls)
    const lastSync = this.lastSyncTimes.get(city);
    const now = Date.now();
    
    if (!force && lastSync !== undefined && (now - lastSync) < 60000) {
      // Return cached result
      const cache = await loadGtfsCache(city, this.cacheDir);
      if (cache) {
        return {
          city,
          status: 'up-to-date',
          routeCount: cache.meta.routeCount,
          stopCount: cache.meta.stopCount,
          lastModified: cache.meta.lastModified,
          syncedAt: new Date(cache.meta.syncedAt),
        };
      }
    }

    const result = await syncGtfs(city, {
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
   * 
   * @example
   * ```typescript
   * await transport.sync('vilnius');
   * const stops = await transport.getStops('vilnius');
   * console.log(`Found ${stops.length} stops`);
   * ```
   */
  async getStops(city: CityId): Promise<Stop[]> {
    this.validateCity(city);
    
    const stops = await loadCachedStops(this.cacheDir, city);
    
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
   * 
   * @example
   * ```typescript
   * await transport.sync('vilnius');
   * const routes = await transport.getRoutes('vilnius');
   * console.log(`Found ${routes.length} routes`);
   * ```
   */
  async getRoutes(city: CityId): Promise<Route[]> {
    this.validateCity(city);
    
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
   * Get list of all supported city IDs.
   */
  getCities(): readonly CityId[] {
    return ALL_CITY_IDS;
  }

  /**
   * Get configuration for a specific city.
   */
  getCityConfig(city: CityId): CityConfig {
    this.validateCity(city);
    return getCityConfig(city);
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Validate that city ID is valid.
   */
  private validateCity(city: string): asserts city is CityId {
    if (!(city in CITY_CONFIGS)) {
      throw new InvalidCityError(city);
    }
  }

  /**
   * Fetch text content from URL.
   */
  private async fetchText(url: string, city: CityId): Promise<string> {
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
  private async getRouteCache(city: CityId): Promise<RouteCache | null> {
    // Check in-memory cache first
    const cached = this.routeCaches.get(city);
    if (cached) {
      return cached;
    }

    // Load from disk
    const routes = await loadCachedRoutes(this.cacheDir, city);
    
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
export { CITY_CONFIGS, ALL_CITY_IDS, getCityConfig, getCitiesByTier, hasGpsData, hasGtfsData } from './config.js';
export type { CityConfig, GpsConfig, GtfsConfig } from './config.js';

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

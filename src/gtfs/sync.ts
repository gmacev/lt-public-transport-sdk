/**
 * GTFS sync and caching module
 * @module gtfs/sync
 * 
 * Handles downloading, extracting, and caching GTFS data from stops.lt.
 * Uses yauzl-promise for proper ZIP extraction.
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import * as yauzl from 'yauzl-promise';

import type { CityId, Route, Stop, Trip, ShapePoint, Calendar, CalendarDate, Agency, StopTime, SyncResult } from '../types.js';
import { CITY_CONFIGS } from '../config.js';
import { GtfsSyncError } from '../errors.js';
import { 
  parseRoutesContent, 
  parseStopsContent,
  parseTripsContent,
  parseShapesContent,
  parseCalendarContent,
  parseCalendarDatesContent,
  parseAgencyContent,
  parseStopTimesContent,
} from './parser.js';

// =============================================================================
// Cache Types
// =============================================================================

/**
 * GTFS cache metadata.
 */
interface CacheMeta {
  /** Last-Modified header from server */
  lastModified: string | null;
  /** When cache was synced */
  syncedAt: string;
  /** Number of routes in cache */
  routeCount: number;
  /** Number of stops in cache */
  stopCount: number;
  /** Number of trips in cache */
  tripCount: number;
  /** Number of shapes in cache */
  shapeCount: number;
  /** Number of calendar entries in cache */
  calendarCount: number;
  /** Number of calendar date exceptions in cache */
  calendarDateCount: number;
  /** Number of agencies in cache */
  agencyCount: number;
  /** Number of stop times in cache */
  stopTimeCount: number;
}

/**
 * Cached GTFS data for a city.
 */
export interface GtfsCache {
  readonly meta: CacheMeta;
  readonly routes: Map<string, Route>;
  readonly stops: Stop[];
  readonly trips: Map<string, Trip>;
  readonly shapes: Map<string, ShapePoint[]>;
  readonly calendar: Map<string, Calendar>;
  readonly calendarDates: CalendarDate[];
  readonly agencies: Agency[];
  readonly stopTimes: Map<string, StopTime[]>;
}

// =============================================================================
// Sync Options
// =============================================================================

/**
 * Options for GTFS sync.
 */
export interface SyncOptions {
  /** Directory for caching GTFS data */
  cacheDir?: string;
  
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
  
  /** User-Agent header for requests */
  userAgent?: string;
  
  /** Force re-download even if cache is current */
  force?: boolean;
}

// =============================================================================
// Default Values
// =============================================================================

const DEFAULT_TIMEOUT = 30000;
const DEFAULT_USER_AGENT = 'lt-public-transport-sdk/1.0.0';

/**
 * Get default cache directory.
 */
function getDefaultCacheDir(): string {
  return join(tmpdir(), 'lt-transport-sdk-cache');
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Ensure directory exists.
 */
async function ensureDir(dir: string): Promise<void> {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

/**
 * Read a stream to string.
 */
async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

/**
 * Load cache metadata for a city.
 */
async function loadCacheMeta(cacheDir: string, city: CityId): Promise<CacheMeta | null> {
  const metaPath = join(cacheDir, city, 'meta.json');
  
  if (!existsSync(metaPath)) {
    return null;
  }
  
  try {
    const content = await readFile(metaPath, 'utf-8');
    return JSON.parse(content) as CacheMeta;
  } catch {
    return null;
  }
}

/**
 * Save cache metadata for a city.
 */
async function saveCacheMeta(cacheDir: string, city: CityId, meta: CacheMeta): Promise<void> {
  const cityDir = join(cacheDir, city);
  await ensureDir(cityDir);
  await writeFile(join(cityDir, 'meta.json'), JSON.stringify(meta, null, 2));
}

/**
 * Load cached routes for a city.
 */
export async function loadCachedRoutes(cacheDir: string, city: CityId): Promise<Map<string, Route> | null> {
  const routesPath = join(cacheDir, city, 'routes.json');
  
  if (!existsSync(routesPath)) {
    return null;
  }
  
  try {
    const content = await readFile(routesPath, 'utf-8');
    const entries = JSON.parse(content) as [string, Route][];
    return new Map(entries);
  } catch {
    return null;
  }
}

/**
 * Save routes to cache.
 */
async function saveRoutes(cacheDir: string, city: CityId, routes: Map<string, Route>): Promise<void> {
  const cityDir = join(cacheDir, city);
  await ensureDir(cityDir);
  const entries = Array.from(routes.entries());
  await writeFile(join(cityDir, 'routes.json'), JSON.stringify(entries));
}

/**
 * Load cached stops for a city.
 */
export async function loadCachedStops(cacheDir: string, city: CityId): Promise<Stop[] | null> {
  const stopsPath = join(cacheDir, city, 'stops.json');
  
  if (!existsSync(stopsPath)) {
    return null;
  }
  
  try {
    const content = await readFile(stopsPath, 'utf-8');
    return JSON.parse(content) as Stop[];
  } catch {
    return null;
  }
}

/**
 * Save stops to cache.
 */
async function saveStops(cacheDir: string, city: CityId, stops: Stop[]): Promise<void> {
  const cityDir = join(cacheDir, city);
  await ensureDir(cityDir);
  await writeFile(join(cityDir, 'stops.json'), JSON.stringify(stops));
}

// =============================================================================
// Trips Cache Functions
// =============================================================================

export async function loadCachedTrips(cacheDir: string, city: CityId): Promise<Map<string, Trip> | null> {
  const tripsPath = join(cacheDir, city, 'trips.json');
  
  if (!existsSync(tripsPath)) {
    return null;
  }
  
  try {
    const content = await readFile(tripsPath, 'utf-8');
    const entries = JSON.parse(content) as [string, Trip][];
    return new Map(entries);
  } catch {
    return null;
  }
}

async function saveTrips(cacheDir: string, city: CityId, trips: Map<string, Trip>): Promise<void> {
  const cityDir = join(cacheDir, city);
  await ensureDir(cityDir);
  const entries = Array.from(trips.entries());
  await writeFile(join(cityDir, 'trips.json'), JSON.stringify(entries));
}

// =============================================================================
// Shapes Cache Functions
// =============================================================================

export async function loadCachedShapes(cacheDir: string, city: CityId): Promise<Map<string, ShapePoint[]> | null> {
  const shapesPath = join(cacheDir, city, 'shapes.json');
  
  if (!existsSync(shapesPath)) {
    return null;
  }
  
  try {
    const content = await readFile(shapesPath, 'utf-8');
    const entries = JSON.parse(content) as [string, ShapePoint[]][];
    return new Map(entries);
  } catch {
    return null;
  }
}

async function saveShapes(cacheDir: string, city: CityId, shapes: Map<string, ShapePoint[]>): Promise<void> {
  const cityDir = join(cacheDir, city);
  await ensureDir(cityDir);
  const entries = Array.from(shapes.entries());
  await writeFile(join(cityDir, 'shapes.json'), JSON.stringify(entries));
}

// =============================================================================
// Calendar Cache Functions
// =============================================================================

export async function loadCachedCalendar(cacheDir: string, city: CityId): Promise<Map<string, Calendar> | null> {
  const calendarPath = join(cacheDir, city, 'calendar.json');
  
  if (!existsSync(calendarPath)) {
    return null;
  }
  
  try {
    const content = await readFile(calendarPath, 'utf-8');
    const entries = JSON.parse(content) as [string, Calendar][];
    return new Map(entries);
  } catch {
    return null;
  }
}

async function saveCalendar(cacheDir: string, city: CityId, calendar: Map<string, Calendar>): Promise<void> {
  const cityDir = join(cacheDir, city);
  await ensureDir(cityDir);
  const entries = Array.from(calendar.entries());
  await writeFile(join(cityDir, 'calendar.json'), JSON.stringify(entries));
}

// =============================================================================
// Calendar Dates Cache Functions
// =============================================================================

export async function loadCachedCalendarDates(cacheDir: string, city: CityId): Promise<CalendarDate[] | null> {
  const calendarDatesPath = join(cacheDir, city, 'calendar_dates.json');
  
  if (!existsSync(calendarDatesPath)) {
    return null;
  }
  
  try {
    const content = await readFile(calendarDatesPath, 'utf-8');
    return JSON.parse(content) as CalendarDate[];
  } catch {
    return null;
  }
}

async function saveCalendarDates(cacheDir: string, city: CityId, calendarDates: CalendarDate[]): Promise<void> {
  const cityDir = join(cacheDir, city);
  await ensureDir(cityDir);
  await writeFile(join(cityDir, 'calendar_dates.json'), JSON.stringify(calendarDates));
}

// =============================================================================
// Agencies Cache Functions
// =============================================================================

export async function loadCachedAgencies(cacheDir: string, city: CityId): Promise<Agency[] | null> {
  const agenciesPath = join(cacheDir, city, 'agencies.json');
  
  if (!existsSync(agenciesPath)) {
    return null;
  }
  
  try {
    const content = await readFile(agenciesPath, 'utf-8');
    return JSON.parse(content) as Agency[];
  } catch {
    return null;
  }
}

async function saveAgencies(cacheDir: string, city: CityId, agencies: Agency[]): Promise<void> {
  const cityDir = join(cacheDir, city);
  await ensureDir(cityDir);
  await writeFile(join(cityDir, 'agencies.json'), JSON.stringify(agencies));
}

// =============================================================================
// Stop Times Cache Functions
// =============================================================================

export async function loadCachedStopTimes(cacheDir: string, city: CityId): Promise<Map<string, StopTime[]> | null> {
  const stopTimesPath = join(cacheDir, city, 'stop_times.json');
  
  if (!existsSync(stopTimesPath)) {
    return null;
  }
  
  try {
    const content = await readFile(stopTimesPath, 'utf-8');
    const entries = JSON.parse(content) as [string, StopTime[]][];
    return new Map(entries);
  } catch {
    return null;
  }
}

async function saveStopTimes(cacheDir: string, city: CityId, stopTimes: Map<string, StopTime[]>): Promise<void> {
  const cityDir = join(cacheDir, city);
  await ensureDir(cityDir);
  const entries = Array.from(stopTimes.entries());
  await writeFile(join(cityDir, 'stop_times.json'), JSON.stringify(entries));
}

// =============================================================================
// Main Sync Function
// =============================================================================

/**
 * Sync GTFS data for a city.
 * 
 * Downloads the GTFS ZIP archive if newer than cached version,
 * extracts routes.txt and stops.txt, and caches the parsed data.
 * 
 * @param city - City to sync
 * @param options - Sync options
 * @returns Sync result
 */
export async function syncGtfs(city: CityId, options: SyncOptions = {}): Promise<SyncResult> {
  const {
    cacheDir = getDefaultCacheDir(),
    timeout = DEFAULT_TIMEOUT,
    userAgent = DEFAULT_USER_AGENT,
    force = false,
  } = options;

  const config = CITY_CONFIGS[city];
  
  if (!config.gtfs.enabled) {
    throw new GtfsSyncError(city, 'GTFS not available for this city');
  }

  const gtfsUrl = config.gtfs.url;

  try {
    // Check Last-Modified header
    const headController = new AbortController();
    const headTimeout = setTimeout(() => { headController.abort(); }, timeout);
    
    let remoteLastModified: string | null = null;
    
    try {
      const headResp = await fetch(gtfsUrl, {
        method: 'HEAD',
        headers: { 'User-Agent': userAgent },
        signal: headController.signal,
      });
      remoteLastModified = headResp.headers.get('Last-Modified');
    } finally {
      clearTimeout(headTimeout);
    }

    // Check if cache is current
    const cachedMeta = await loadCacheMeta(cacheDir, city);
    
    if (!force && cachedMeta?.lastModified === remoteLastModified && remoteLastModified !== null) {
      // Cache is current
      return {
        city,
        status: 'up-to-date',
        routeCount: cachedMeta.routeCount,
        stopCount: cachedMeta.stopCount,
        lastModified: cachedMeta.lastModified,
        syncedAt: new Date(cachedMeta.syncedAt),
      };
    }

    // Download ZIP
    const downloadController = new AbortController();
    const downloadTimeout = setTimeout(() => { downloadController.abort(); }, timeout * 3);
    
    let zipBuffer: Buffer;
    
    try {
      const response = await fetch(gtfsUrl, {
        headers: { 'User-Agent': userAgent },
        signal: downloadController.signal,
      });
      
      if (!response.ok) {
        throw new GtfsSyncError(city, `HTTP ${String(response.status)}: ${response.statusText}`);
      }
      
      zipBuffer = Buffer.from(await response.arrayBuffer());
    } finally {
      clearTimeout(downloadTimeout);
    }

    // Save to temp file for yauzl
    const tempPath = join(tmpdir(), `gtfs-${city}-${String(Date.now())}.zip`);
    await writeFile(tempPath, zipBuffer);

    let routes = new Map<string, Route>();
    let stops: Stop[] = [];
    let trips = new Map<string, Trip>();
    let shapes = new Map<string, ShapePoint[]>();
    let calendar = new Map<string, Calendar>();
    let calendarDates: CalendarDate[] = [];
    let agencies: Agency[] = [];
    let stopTimes = new Map<string, StopTime[]>();

    try {
      // Extract with yauzl
      const zip = await yauzl.open(tempPath);
      
      try {
        for await (const entry of zip) {
          const stream = await entry.openReadStream();
          const content = await streamToString(stream);
          
          switch (entry.filename) {
            case 'routes.txt':
              routes = parseRoutesContent(content);
              break;
            case 'stops.txt':
              stops = parseStopsContent(content);
              break;
            case 'trips.txt':
              trips = parseTripsContent(content);
              break;
            case 'shapes.txt':
              shapes = parseShapesContent(content);
              break;
            case 'calendar.txt':
              calendar = parseCalendarContent(content);
              break;
            case 'calendar_dates.txt':
              calendarDates = parseCalendarDatesContent(content);
              break;
            case 'agency.txt':
              agencies = parseAgencyContent(content);
              break;
            case 'stop_times.txt':
              stopTimes = parseStopTimesContent(content);
              break;
          }
        }
      } finally {
        await zip.close();
      }
    } finally {
      // Clean up temp file
      try {
        await unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
    }

    // Count stop times (sum of all arrays)
    let stopTimeCount = 0;
    for (const times of stopTimes.values()) {
      stopTimeCount += times.length;
    }

    // Save to cache
    const syncedAt = new Date();
    const meta: CacheMeta = {
      lastModified: remoteLastModified,
      syncedAt: syncedAt.toISOString(),
      routeCount: routes.size,
      stopCount: stops.length,
      tripCount: trips.size,
      shapeCount: shapes.size,
      calendarCount: calendar.size,
      calendarDateCount: calendarDates.length,
      agencyCount: agencies.length,
      stopTimeCount,
    };

    await saveCacheMeta(cacheDir, city, meta);
    await saveRoutes(cacheDir, city, routes);
    await saveStops(cacheDir, city, stops);
    await saveTrips(cacheDir, city, trips);
    await saveShapes(cacheDir, city, shapes);
    await saveCalendar(cacheDir, city, calendar);
    await saveCalendarDates(cacheDir, city, calendarDates);
    await saveAgencies(cacheDir, city, agencies);
    await saveStopTimes(cacheDir, city, stopTimes);

    return {
      city,
      status: 'updated',
      routeCount: routes.size,
      stopCount: stops.length,
      lastModified: remoteLastModified,
      syncedAt,
    };
  } catch (error) {
    if (error instanceof GtfsSyncError) {
      throw error;
    }
    throw new GtfsSyncError(
      city,
      error instanceof Error ? error.message : 'Unknown error',
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Load GTFS cache for a city.
 * Returns null if cache is not available.
 * 
 * @param city - City to load
 * @param cacheDir - Cache directory
 * @returns Cached GTFS data or null
 */
export async function loadGtfsCache(city: CityId, cacheDir?: string): Promise<GtfsCache | null> {
  const dir = cacheDir ?? getDefaultCacheDir();
  
  const meta = await loadCacheMeta(dir, city);
  if (!meta) {
    return null;
  }
  
  // Load core data (required)
  const routes = await loadCachedRoutes(dir, city);
  const stops = await loadCachedStops(dir, city);
  
  if (!routes || !stops) {
    return null;
  }
  
  // Load extended data (optional, default to empty if not present)
  const trips = await loadCachedTrips(dir, city) ?? new Map<string, Trip>();
  const shapes = await loadCachedShapes(dir, city) ?? new Map<string, ShapePoint[]>();
  const calendar = await loadCachedCalendar(dir, city) ?? new Map<string, Calendar>();
  const calendarDates = await loadCachedCalendarDates(dir, city) ?? [];
  const agencies = await loadCachedAgencies(dir, city) ?? [];
  const stopTimes = await loadCachedStopTimes(dir, city) ?? new Map<string, StopTime[]>();
  
  return { 
    meta, 
    routes, 
    stops,
    trips,
    shapes,
    calendar,
    calendarDates,
    agencies,
    stopTimes,
  };
}

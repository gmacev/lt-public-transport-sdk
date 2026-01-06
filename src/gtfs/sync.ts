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

import type { CityId, Route, Stop, SyncResult } from '../types.js';
import { CITY_CONFIGS } from '../config.js';
import { GtfsSyncError } from '../errors.js';
import { parseRoutesContent, parseStopsContent } from './parser.js';

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
}

/**
 * Cached GTFS data for a city.
 */
export interface GtfsCache {
  readonly meta: CacheMeta;
  readonly routes: Map<string, Route>;
  readonly stops: Stop[];
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

    try {
      // Extract with yauzl
      const zip = await yauzl.open(tempPath);
      
      try {
        for await (const entry of zip) {
          if (entry.filename === 'routes.txt') {
            const stream = await entry.openReadStream();
            const content = await streamToString(stream);
            routes = parseRoutesContent(content);
          } else if (entry.filename === 'stops.txt') {
            const stream = await entry.openReadStream();
            const content = await streamToString(stream);
            stops = parseStopsContent(content);
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

    // Save to cache
    const syncedAt = new Date();
    const meta: CacheMeta = {
      lastModified: remoteLastModified,
      syncedAt: syncedAt.toISOString(),
      routeCount: routes.size,
      stopCount: stops.length,
    };

    await saveCacheMeta(cacheDir, city, meta);
    await saveRoutes(cacheDir, city, routes);
    await saveStops(cacheDir, city, stops);

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
 * Returns null if not cached.
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
  
  const routes = await loadCachedRoutes(dir, city);
  const stops = await loadCachedStops(dir, city);
  
  if (!routes || !stops) {
    return null;
  }
  
  return { meta, routes, stops };
}

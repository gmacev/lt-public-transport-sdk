/**
 * Route matching and data enrichment for silver-tier cities
 * @module enrichment/route-matcher
 * 
 * Silver-tier cities (Panevėžys, Tauragė) provide lite GPS streams
 * that lack destination and route long name. This module enriches
 * vehicles with data from GTFS routes.
 */

import type { Route, Vehicle } from '../types.js';

// =============================================================================
// Enrichment Result
// =============================================================================

/**
 * Result of route enrichment lookup.
 */
export interface EnrichmentResult {
  /** Destination/terminus name from route long name */
  destination: string | null;
  
  /** Full route name */
  routeLongName: string | null;
  
  /** Whether a match was found */
  matched: boolean;
}

// =============================================================================
// Route Cache with Normalized Lookup
// =============================================================================

/**
 * Route cache with O(1) case-insensitive lookup.
 * The normalized map uses uppercase keys for fast matching.
 */
export interface RouteCache {
  /** Primary map: exact short name -> Route */
  readonly routes: Map<string, Route>;
  /** Normalized map: uppercase short name -> Route (for O(1) case-insensitive lookup) */
  readonly normalizedRoutes: Map<string, Route>;
}

/**
 * Build a RouteCache from a routes map.
 * Pre-builds the normalized (uppercase) lookup map.
 */
export function buildRouteCache(routes: Map<string, Route>): RouteCache {
  const normalizedRoutes = new Map<string, Route>();
  
  for (const [key, route] of routes) {
    normalizedRoutes.set(key.toUpperCase(), route);
  }
  
  return { routes, normalizedRoutes };
}

// =============================================================================
// Route Matcher
// =============================================================================

/**
 * Match a GPS route to GTFS route data.
 * 
 * Matching strategy:
 * 1. Exact match on route short name (case-sensitive) - O(1)
 * 2. Case-insensitive match via normalized map - O(1)
 * 
 * @param gpsRoute - Route identifier from GPS stream
 * @param cache - RouteCache with pre-built normalized lookup
 * @returns Enrichment result with destination and route name
 */
export function matchRoute(
  gpsRoute: string,
  cache: RouteCache
): EnrichmentResult {
  // Empty route - no enrichment possible
  if (!gpsRoute || gpsRoute.trim() === '') {
    return { destination: null, routeLongName: null, matched: false };
  }

  const normalized = gpsRoute.trim();

  // 1. Try exact match - O(1)
  const exactRoute = cache.routes.get(normalized);
  if (exactRoute) {
    return extractEnrichment(exactRoute);
  }

  // 2. Try case-insensitive match via normalized map - O(1)
  const upperRoute = cache.normalizedRoutes.get(normalized.toUpperCase());
  if (upperRoute) {
    return extractEnrichment(upperRoute);
  }

  // 3. No match found
  return { destination: null, routeLongName: null, matched: false };
}

/**
 * Extract enrichment data from a matched route.
 */
function extractEnrichment(route: Route): EnrichmentResult {
  // Parse destination from long name
  // Common patterns:
  // - "Terminus A - Terminus B"
  // - "Terminus A – Terminus B" (en-dash)
  // - Just use the full long name if no separator
  
  let destination: string | null = null;
  
  if (route.longName !== '' && route.longName.length > 0) {
    // Try to extract destination (usually after separator)
    const separators = [' - ', ' – ', ' — ', ' / '];
    
    for (const sep of separators) {
      if (route.longName.includes(sep)) {
        const parts = route.longName.split(sep);
        const lastPart = parts[parts.length - 1];
        // Use the last part as destination (typical direction)
        if (lastPart !== undefined) {
          destination = lastPart.trim();
        }
        break;
      }
    }
    
    // If no separator found, use full long name
    destination ??= route.longName;
  }

  return {
    destination,
    routeLongName: route.longName !== '' ? route.longName : null,
    matched: true,
  };
}

// =============================================================================
// Vehicle Enrichment
// =============================================================================

/**
 * Enrich a vehicle with GTFS route data.
 * 
 * @param vehicle - Vehicle to enrich
 * @param cache - RouteCache with pre-built normalized lookup
 * @returns New vehicle with enriched data (or original if no match)
 */
export function enrichVehicle(
  vehicle: Vehicle,
  cache: RouteCache
): Vehicle {
  // Skip if already has destination
  if (vehicle.destination !== null && vehicle.destination !== '') {
    return vehicle;
  }

  const enrichment = matchRoute(vehicle.route, cache);
  
  if (!enrichment.matched) {
    return vehicle;
  }

  // Return new vehicle with enriched data
  return {
    ...vehicle,
    destination: enrichment.destination,
  };
}

/**
 * Enrich an array of vehicles with GTFS route data.
 * 
 * @param vehicles - Vehicles to enrich
 * @param cache - RouteCache with pre-built normalized lookup
 * @returns New array with enriched vehicles
 */
export function enrichVehicles(
  vehicles: Vehicle[],
  cache: RouteCache
): Vehicle[] {
  return vehicles.map(v => enrichVehicle(v, cache));
}


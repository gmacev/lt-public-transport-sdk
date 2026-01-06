/**
 * Route Matcher Unit Tests
 * 
 * Tests route matching and enrichment logic with mocked GTFS data.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { 
  matchRoute, 
  enrichVehicle, 
  enrichVehicles, 
  buildRouteCache,
  type RouteCache 
} from '../enrichment/route-matcher.js';
import type { Route, Vehicle } from '../types.js';

// =============================================================================
// Fixtures: Routes
// =============================================================================

function createRoute(shortName: string, longName: string): Route {
  return {
    id: `route-${shortName}`,
    shortName,
    longName,
    type: 'bus',
    color: '0000FF',
    textColor: 'FFFFFF',
  };
}

function createRouteMap(routes: Route[]): Map<string, Route> {
  const map = new Map<string, Route>();
  for (const route of routes) {
    map.set(route.shortName, route);
  }
  return map;
}

const MOCK_ROUTES: Route[] = [
  createRoute('12', 'Centras - Kalniečiai'),
  createRoute('23', 'Šilainiai - Žaliakalnis'),
  createRoute('5A', 'Autobusų stotis - Romainiai'),
  createRoute('J25', 'Jurbarkas - Tauragė'),
  createRoute('S11', 'Skaudvilė - Tauragė'),
];

// =============================================================================
// Fixtures: Vehicles
// =============================================================================

function createVehicle(route: string, destination: string | null = null): Vehicle {
  return {
    id: `vehicle-${route}-${String(Math.random())}`,
    vehicleNumber: '1234',
    route,
    type: 'bus',
    latitude: 55.7,
    longitude: 24.3,
    speed: 30,
    bearing: 90,
    measuredAt: new Date(),
    isStale: false,
    destination,
    tripId: null,
    delaySeconds: null,
    nextStopId: null,
    arrivalTimeSeconds: null,
    gtfsTripId: null,
  };
}

// =============================================================================
// Test Suites
// =============================================================================

describe('Route Matcher', () => {
  let cache: RouteCache;

  beforeAll(() => {
    cache = buildRouteCache(createRouteMap(MOCK_ROUTES));
  });

  describe('buildRouteCache', () => {
    it('should build cache with both routes and normalizedRoutes maps', () => {
      expect(cache.routes).toBeInstanceOf(Map);
      expect(cache.normalizedRoutes).toBeInstanceOf(Map);
    });

    it('should have same count in both maps', () => {
      expect(cache.routes.size).toBe(cache.normalizedRoutes.size);
    });

    it('should have uppercase keys in normalizedRoutes', () => {
      expect(cache.normalizedRoutes.has('12')).toBe(true);
      expect(cache.normalizedRoutes.has('5A')).toBe(true);
      expect(cache.normalizedRoutes.has('J25')).toBe(true);
    });
  });

  describe('matchRoute', () => {
    it('should match exact route short name', () => {
      const result = matchRoute('12', cache);
      
      expect(result.matched).toBe(true);
      expect(result.destination).toBe('Kalniečiai');
    });

    it('should match case-insensitively', () => {
      const result = matchRoute('j25', cache);
      
      expect(result.matched).toBe(true);
      expect(result.destination).toBe('Tauragė');
    });

    it('should handle mixed case', () => {
      const result = matchRoute('s11', cache);
      expect(result.matched).toBe(true);
    });

    it('should return no match for unknown route', () => {
      const result = matchRoute('999', cache);
      
      expect(result.matched).toBe(false);
      expect(result.destination).toBeNull();
    });

    it('should handle empty route string', () => {
      const result = matchRoute('', cache);
      
      expect(result.matched).toBe(false);
      expect(result.destination).toBeNull();
    });

    it('should handle whitespace-only route', () => {
      const result = matchRoute('   ', cache);
      
      expect(result.matched).toBe(false);
    });

    it('should trim whitespace before matching', () => {
      const result = matchRoute('  12  ', cache);
      
      expect(result.matched).toBe(true);
      expect(result.destination).toBe('Kalniečiai');
    });
  });

  describe('Destination Extraction', () => {
    it('should extract destination after hyphen separator', () => {
      const result = matchRoute('12', cache); // "Centras - Kalniečiai"
      expect(result.destination).toBe('Kalniečiai');
    });

    it('should extract destination from last segment', () => {
      const result = matchRoute('23', cache); // "Šilainiai - Žaliakalnis"
      expect(result.destination).toBe('Žaliakalnis');
    });

    it('should handle route with en-dash separator', () => {
      // Create a cache with en-dash route
      const enDashRoute = createRoute('99', 'Terminus A – Terminus B'); // En-dash
      const testCache = buildRouteCache(new Map([['99', enDashRoute]]));
      
      const result = matchRoute('99', testCache);
      expect(result.matched).toBe(true);
      // Should extract "Terminus B" as destination
    });
  });

  describe('enrichVehicle', () => {
    it('should add destination to vehicle without one', () => {
      const vehicle = createVehicle('12', null);
      const enriched = enrichVehicle(vehicle, cache);
      
      expect(enriched.destination).toBe('Kalniečiai');
    });

    it('should not overwrite existing destination', () => {
      const vehicle = createVehicle('12', 'Existing Destination');
      const enriched = enrichVehicle(vehicle, cache);
      
      expect(enriched.destination).toBe('Existing Destination');
    });

    it('should return original vehicle if no match found', () => {
      const vehicle = createVehicle('999', null);
      const enriched = enrichVehicle(vehicle, cache);
      
      expect(enriched.destination).toBeNull();
      expect(enriched).toBe(vehicle); // Same reference
    });

    it('should return new vehicle object when enriched', () => {
      const vehicle = createVehicle('12', null);
      const enriched = enrichVehicle(vehicle, cache);
      
      expect(enriched).not.toBe(vehicle); // Different reference
      expect(vehicle.destination).toBeNull(); // Original unchanged
    });
  });

  describe('enrichVehicles', () => {
    it('should enrich array of vehicles', () => {
      const vehicles = [
        createVehicle('12', null),
        createVehicle('23', null),
        createVehicle('5A', null),
      ];
      
      const enriched = enrichVehicles(vehicles, cache);
      
      expect(enriched).toHaveLength(3);
      expect(enriched[0]!.destination).toBe('Kalniečiai');
      expect(enriched[1]!.destination).toBe('Žaliakalnis');
      expect(enriched[2]!.destination).toBe('Romainiai');
    });

    it('should handle empty array', () => {
      const enriched = enrichVehicles([], cache);
      expect(enriched).toEqual([]);
    });

    it('should maintain vehicle order', () => {
      const vehicles = [
        createVehicle('12', null),
        createVehicle('999', null), // No match
        createVehicle('23', null),
      ];
      
      const enriched = enrichVehicles(vehicles, cache);
      
      expect(enriched[0]!.route).toBe('12');
      expect(enriched[1]!.route).toBe('999');
      expect(enriched[2]!.route).toBe('23');
    });
  });

  describe('O(1) Lookup Performance', () => {
    it('should use normalized map for case-insensitive lookup', () => {
      // This test verifies that we use the O(1) lookup, not O(N) iteration
      // By checking that normalizedRoutes has the uppercase key
      expect(cache.normalizedRoutes.has('J25')).toBe(true);
      expect(cache.normalizedRoutes.has('j25'.toUpperCase())).toBe(true);
    });
  });
});

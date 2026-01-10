/**
 * GPS Lite Format Parser Unit Tests
 * 
 * Tests parsing of lite format using descriptor-based column mapping.
 * 
 * Format notes:
 * - Lite format has no header row
 * - Columns are mapped via LiteFormatDescriptor indices
 */

import { describe, it, expect } from 'vitest';
import { parseGpsLiteStream, isLiteCity, getLiteFormatDescriptor } from '../parsers/gps-lite.js';
import type { LiteFormatDescriptor } from '../config.js';

// =============================================================================
// Test Format Descriptors (inline fixtures)
// =============================================================================

/**
 * Example Panevėžys-style format (9 columns, no header):
 * [0] type, [1] route, [2] lon, [3] lat, [4] speed, [5] azimuth, [6] ?, [7] vehicleId, [8] ?
 */
const PANEVEZYS_FORMAT: LiteFormatDescriptor = {
  minColumns: 9,
  vehicleIdIndex: 7,
  routeIndex: 1,
  coordIndices: [3, 2] as const, // lat at 3, lon at 2
  speedIndex: 4,
  bearingIndex: 5,
  typeIndex: 0,
};

/**
 * Example Tauragė-style format (8 columns, no header):
 * [0] type, [1] route, [2] lon, [3] lat, [4] speed, [5] azimuth, [6] vehicleId, [7] ?
 */
const TAURAGE_FORMAT: LiteFormatDescriptor = {
  minColumns: 8,
  vehicleIdIndex: 6,
  routeIndex: 1,
  coordIndices: [3, 2] as const, // lat at 3, lon at 2
  speedIndex: 4,
  bearingIndex: 5,
  typeIndex: 0,
};

// =============================================================================
// Fixtures: 9-column Format
// =============================================================================

// Format: type,route,lon,lat,speed,azimuth,door?,vehicleId,unknown
// Coordinates are integers that need ÷1,000,000 (e.g., 24358920 = 24.358920)
const PANEVEZYS_ROW_1 = '2,12,24358920,55728450,35,180,0,VEH001,0';
const PANEVEZYS_ROW_2 = '2,5A,24365000,55735000,25,90,1,VEH002,0';
const PANEVEZYS_ROW_3 = '2,23,24350000,55720000,40,270,0,VEH003,0';
const PANEVEZYS_EMPTY_ROUTE = '2,,24358920,55728450,35,180,0,VEH004,0';

// =============================================================================
// Fixtures: 8-column Format
// =============================================================================

// Format: type,route,lon,lat,speed,azimuth,vehicleId,unknown
const TAURAGE_ROW_1 = '2,S11,22289000,55252000,30,45,TAU001,0';
const TAURAGE_ROW_2 = '2,J25,22295000,55255000,20,135,TAU002,0';
const TAURAGE_ROW_3 = '2,R1,22282000,55248000,35,315,TAU003,0';

// =============================================================================
// Edge Cases
// =============================================================================

const EMPTY_STREAM = '';
const MALFORMED_ROW = '2,invalid';
// Zero coords - center of the earth
const ZERO_COORDS_ROW = '2,12,0,0,35,180,0,VEH999,0';
// Coords outside Lithuania (Paris: 48.856614, 2.352222)
const OUTSIDE_LT_ROW = '2,12,2352222,48856614,35,180,0,PARIS,0';

// =============================================================================
// Test Suites
// =============================================================================

describe('GPS Lite Parser', () => {
  describe('isLiteCity (deprecated)', () => {
    it('should return false for all cities (no built-in lite cities)', () => {
      expect(isLiteCity('panevezys')).toBe(false);
      expect(isLiteCity('taurage')).toBe(false);
      expect(isLiteCity('vilnius')).toBe(false);
      expect(isLiteCity('kaunas')).toBe(false);
    });
  });
  
  describe('getLiteFormatDescriptor', () => {
    it('should return undefined without cityConfig', () => {
      expect(getLiteFormatDescriptor('panevezys')).toBeUndefined();
      expect(getLiteFormatDescriptor('taurage')).toBeUndefined();
      expect(getLiteFormatDescriptor('unknown')).toBeUndefined();
    });
    
    it('should return liteFormat from cityConfig', () => {
      const customFormat: LiteFormatDescriptor = { 
        minColumns: 5, 
        vehicleIdIndex: 4, 
        routeIndex: 0, 
        coordIndices: [1, 2] as const, 
        speedIndex: 3, 
        bearingIndex: 3 
      };
      const mockConfig = { 
        id: 'test', 
        tier: 'silver' as const, 
        gps: { enabled: true, format: 'lite' as const, url: null }, 
        gtfs: { enabled: false, url: '' },
        liteFormat: customFormat
      };
      
      expect(getLiteFormatDescriptor('test', mockConfig)).toBe(customFormat);
    });
  });

  describe('Panevėžys Format (9 columns)', () => {
    it('should parse valid Panevėžys row', () => {
      const vehicles = parseGpsLiteStream(PANEVEZYS_ROW_1, 'panevezys', PANEVEZYS_FORMAT, { filterInvalidCoords: false });
      
      expect(vehicles).toHaveLength(1);
      expect(vehicles[0]).toBeDefined();
      
      const v = vehicles[0]!;
      expect(v.route).toBe('12');
      expect(v.latitude).toBeCloseTo(55.728450, 5);
      expect(v.longitude).toBeCloseTo(24.358920, 5);
      expect(v.bearing).toBe(180);
      expect(v.speed).toBe(35);
      expect(v.vehicleNumber).toBe('VEH001');
      expect(v.type).toBe('bus'); // Lite format defaults to bus
    });

    it('should parse multiple Panevėžys rows', () => {
      const stream = `${PANEVEZYS_ROW_1}\n${PANEVEZYS_ROW_2}\n${PANEVEZYS_ROW_3}`;
      const vehicles = parseGpsLiteStream(stream, 'panevezys', PANEVEZYS_FORMAT, { filterInvalidCoords: false });
      
      expect(vehicles).toHaveLength(3);
      expect(vehicles[0]!.route).toBe('12');
      expect(vehicles[1]!.route).toBe('5A');
      expect(vehicles[2]!.route).toBe('23');
    });

    it('should handle alphanumeric routes in Panevėžys', () => {
      const vehicles = parseGpsLiteStream(PANEVEZYS_ROW_2, 'panevezys', PANEVEZYS_FORMAT, { filterInvalidCoords: false });
      expect(vehicles[0]!.route).toBe('5A');
    });

    it('should handle empty route', () => {
      const vehicles = parseGpsLiteStream(PANEVEZYS_EMPTY_ROUTE, 'panevezys', PANEVEZYS_FORMAT, { filterInvalidCoords: false });
      expect(vehicles).toHaveLength(1);
      expect(vehicles[0]!.route).toBe('');
    });
  });

  describe('Tauragė Format (8 columns)', () => {
    it('should parse valid Tauragė row', () => {
      const vehicles = parseGpsLiteStream(TAURAGE_ROW_1, 'taurage', TAURAGE_FORMAT, { filterInvalidCoords: false });
      
      expect(vehicles).toHaveLength(1);
      expect(vehicles[0]).toBeDefined();
      
      const v = vehicles[0]!;
      expect(v.route).toBe('S11');
      expect(v.latitude).toBeCloseTo(55.252000, 5);
      expect(v.longitude).toBeCloseTo(22.289000, 5);
      expect(v.vehicleNumber).toBe('TAU001');
    });

    it('should parse alphanumeric routes (S11, J25, R1)', () => {
      const stream = `${TAURAGE_ROW_1}\n${TAURAGE_ROW_2}\n${TAURAGE_ROW_3}`;
      const vehicles = parseGpsLiteStream(stream, 'taurage', TAURAGE_FORMAT, { filterInvalidCoords: false });
      
      expect(vehicles).toHaveLength(3);
      expect(vehicles[0]!.route).toBe('S11');
      expect(vehicles[1]!.route).toBe('J25');
      expect(vehicles[2]!.route).toBe('R1');
    });

    it('should correctly map vehicleId from column 6 (0-indexed)', () => {
      const vehicles = parseGpsLiteStream(TAURAGE_ROW_2, 'taurage', TAURAGE_FORMAT, { filterInvalidCoords: false });
      expect(vehicles[0]!.vehicleNumber).toBe('TAU002');
    });
  });

  describe('Empty and Edge Cases', () => {
    it('should return empty array for empty stream', () => {
      const vehicles = parseGpsLiteStream(EMPTY_STREAM, 'panevezys', PANEVEZYS_FORMAT, {});
      expect(vehicles).toEqual([]);
    });

    it('should skip malformed rows and continue parsing', () => {
      const stream = `${PANEVEZYS_ROW_1}\n${MALFORMED_ROW}\n${PANEVEZYS_ROW_2}`;
      const vehicles = parseGpsLiteStream(stream, 'panevezys', PANEVEZYS_FORMAT, { filterInvalidCoords: false });
      
      expect(vehicles).toHaveLength(2);
    });

    it('should handle blank lines', () => {
      const stream = `${PANEVEZYS_ROW_1}\n\n\n${PANEVEZYS_ROW_2}`;
      const vehicles = parseGpsLiteStream(stream, 'panevezys', PANEVEZYS_FORMAT, { filterInvalidCoords: false });
      
      expect(vehicles).toHaveLength(2);
    });

    it('should handle Windows line endings (CRLF)', () => {
      const stream = `${PANEVEZYS_ROW_1}\r\n${PANEVEZYS_ROW_2}`;
      const vehicles = parseGpsLiteStream(stream, 'panevezys', PANEVEZYS_FORMAT, { filterInvalidCoords: false });
      
      expect(vehicles).toHaveLength(2);
    });
  });

  describe('Coordinate Filtering', () => {
    it('should filter zero coordinates when filterInvalidCoords is true', () => {
      const stream = `${PANEVEZYS_ROW_1}\n${ZERO_COORDS_ROW}`;
      const vehicles = parseGpsLiteStream(stream, 'panevezys', PANEVEZYS_FORMAT, { filterInvalidCoords: true });
      
      expect(vehicles).toHaveLength(1);
    });

    it('should include zero coordinates when filterInvalidCoords is false', () => {
      const stream = `${PANEVEZYS_ROW_1}\n${ZERO_COORDS_ROW}`;
      const vehicles = parseGpsLiteStream(stream, 'panevezys', PANEVEZYS_FORMAT, { filterInvalidCoords: false });
      
      expect(vehicles).toHaveLength(2);
    });

    it('should filter coordinates outside Lithuania bounds', () => {
      const stream = `${PANEVEZYS_ROW_1}\n${OUTSIDE_LT_ROW}`;
      const vehicles = parseGpsLiteStream(stream, 'panevezys', PANEVEZYS_FORMAT, { filterInvalidCoords: true });
      
      expect(vehicles).toHaveLength(1);
    });
  });

  describe('Vehicle ID Generation', () => {
    it('should generate unique vehicle IDs', () => {
      const stream = `${PANEVEZYS_ROW_1}\n${PANEVEZYS_ROW_2}`;
      const vehicles = parseGpsLiteStream(stream, 'panevezys', PANEVEZYS_FORMAT, { filterInvalidCoords: false });
      
      expect(vehicles[0]!.id).toBeDefined();
      expect(vehicles[1]!.id).toBeDefined();
      expect(vehicles[0]!.id).not.toBe(vehicles[1]!.id);
    });

    it('should include city in ID', () => {
      const vehicles = parseGpsLiteStream(PANEVEZYS_ROW_1, 'panevezys', PANEVEZYS_FORMAT, { filterInvalidCoords: false });
      expect(vehicles[0]!.id).toContain('panevezys');
    });
  });

  describe('Default Values', () => {
    it('should default type to bus for all lite format vehicles', () => {
      const vehicles = parseGpsLiteStream(PANEVEZYS_ROW_1, 'panevezys', PANEVEZYS_FORMAT, { filterInvalidCoords: false });
      expect(vehicles[0]!.type).toBe('bus');
    });

    it('should set destination to null (no GTFS in stream)', () => {
      const vehicles = parseGpsLiteStream(PANEVEZYS_ROW_1, 'panevezys', PANEVEZYS_FORMAT, { filterInvalidCoords: false });
      expect(vehicles[0]!.destination).toBeNull();
    });

    it('should set gtfsTripId to null', () => {
      const vehicles = parseGpsLiteStream(PANEVEZYS_ROW_1, 'panevezys', PANEVEZYS_FORMAT, { filterInvalidCoords: false });
      expect(vehicles[0]!.gtfsTripId).toBeNull();
    });
  });
});

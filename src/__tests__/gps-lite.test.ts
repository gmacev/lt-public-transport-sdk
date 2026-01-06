/**
 * GPS Lite Format Parser Unit Tests
 * 
 * Tests parsing of Panevėžys (9-col) and Tauragė (8-col) lite formats.
 * 
 * Format notes:
 * - Panevėžys: 9 columns, cols [2],[3] are lon/lat as integers (/1,000,000)
 * - Tauragė: 8 columns, cols [2],[3] are lon/lat as integers (/1,000,000)
 */

import { describe, it, expect } from 'vitest';
import { parseGpsLiteStream, isLiteCity } from '../parsers/gps-lite.js';

// =============================================================================
// Fixtures: Panevėžys Format (9 columns)
// =============================================================================

// Format: type,route,lon,lat,speed,azimuth,door?,vehicleId,unknown
// Coordinates are integers that need ÷1,000,000 (e.g., 24358920 = 24.358920)
const PANEVEZYS_ROW_1 = '2,12,24358920,55728450,35,180,0,VEH001,0';
const PANEVEZYS_ROW_2 = '2,5A,24365000,55735000,25,90,1,VEH002,0';
const PANEVEZYS_ROW_3 = '2,23,24350000,55720000,40,270,0,VEH003,0';
const PANEVEZYS_EMPTY_ROUTE = '2,,24358920,55728450,35,180,0,VEH004,0';

// =============================================================================
// Fixtures: Tauragė Format (8 columns)
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
  describe('isLiteCity', () => {
    it('should identify Panevėžys as lite city', () => {
      expect(isLiteCity('panevezys')).toBe(true);
    });

    it('should identify Tauragė as lite city', () => {
      expect(isLiteCity('taurage')).toBe(true);
    });

    it('should not identify Vilnius as lite city', () => {
      expect(isLiteCity('vilnius')).toBe(false);
    });

    it('should not identify Kaunas as lite city', () => {
      expect(isLiteCity('kaunas')).toBe(false);
    });
  });

  describe('Panevėžys Format (9 columns)', () => {
    it('should parse valid Panevėžys row', () => {
      const vehicles = parseGpsLiteStream(PANEVEZYS_ROW_1, 'panevezys', { filterInvalidCoords: false });
      
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
      const vehicles = parseGpsLiteStream(stream, 'panevezys', { filterInvalidCoords: false });
      
      expect(vehicles).toHaveLength(3);
      expect(vehicles[0]!.route).toBe('12');
      expect(vehicles[1]!.route).toBe('5A');
      expect(vehicles[2]!.route).toBe('23');
    });

    it('should handle alphanumeric routes in Panevėžys', () => {
      const vehicles = parseGpsLiteStream(PANEVEZYS_ROW_2, 'panevezys', { filterInvalidCoords: false });
      expect(vehicles[0]!.route).toBe('5A');
    });

    it('should handle empty route', () => {
      const vehicles = parseGpsLiteStream(PANEVEZYS_EMPTY_ROUTE, 'panevezys', { filterInvalidCoords: false });
      expect(vehicles).toHaveLength(1);
      expect(vehicles[0]!.route).toBe('');
    });
  });

  describe('Tauragė Format (8 columns)', () => {
    it('should parse valid Tauragė row', () => {
      const vehicles = parseGpsLiteStream(TAURAGE_ROW_1, 'taurage', { filterInvalidCoords: false });
      
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
      const vehicles = parseGpsLiteStream(stream, 'taurage', { filterInvalidCoords: false });
      
      expect(vehicles).toHaveLength(3);
      expect(vehicles[0]!.route).toBe('S11');
      expect(vehicles[1]!.route).toBe('J25');
      expect(vehicles[2]!.route).toBe('R1');
    });

    it('should correctly map vehicleId from column 6 (0-indexed)', () => {
      const vehicles = parseGpsLiteStream(TAURAGE_ROW_2, 'taurage', { filterInvalidCoords: false });
      expect(vehicles[0]!.vehicleNumber).toBe('TAU002');
    });
  });

  describe('Empty and Edge Cases', () => {
    it('should return empty array for empty stream', () => {
      const vehicles = parseGpsLiteStream(EMPTY_STREAM, 'panevezys', {});
      expect(vehicles).toEqual([]);
    });

    it('should skip malformed rows and continue parsing', () => {
      const stream = `${PANEVEZYS_ROW_1}\n${MALFORMED_ROW}\n${PANEVEZYS_ROW_2}`;
      const vehicles = parseGpsLiteStream(stream, 'panevezys', { filterInvalidCoords: false });
      
      expect(vehicles).toHaveLength(2);
    });

    it('should handle blank lines', () => {
      const stream = `${PANEVEZYS_ROW_1}\n\n\n${PANEVEZYS_ROW_2}`;
      const vehicles = parseGpsLiteStream(stream, 'panevezys', { filterInvalidCoords: false });
      
      expect(vehicles).toHaveLength(2);
    });

    it('should handle Windows line endings (CRLF)', () => {
      const stream = `${PANEVEZYS_ROW_1}\r\n${PANEVEZYS_ROW_2}`;
      const vehicles = parseGpsLiteStream(stream, 'panevezys', { filterInvalidCoords: false });
      
      expect(vehicles).toHaveLength(2);
    });
  });

  describe('Coordinate Filtering', () => {
    it('should filter zero coordinates when filterInvalidCoords is true', () => {
      const stream = `${PANEVEZYS_ROW_1}\n${ZERO_COORDS_ROW}`;
      const vehicles = parseGpsLiteStream(stream, 'panevezys', { filterInvalidCoords: true });
      
      expect(vehicles).toHaveLength(1);
    });

    it('should include zero coordinates when filterInvalidCoords is false', () => {
      const stream = `${PANEVEZYS_ROW_1}\n${ZERO_COORDS_ROW}`;
      const vehicles = parseGpsLiteStream(stream, 'panevezys', { filterInvalidCoords: false });
      
      expect(vehicles).toHaveLength(2);
    });

    it('should filter coordinates outside Lithuania bounds', () => {
      const stream = `${PANEVEZYS_ROW_1}\n${OUTSIDE_LT_ROW}`;
      const vehicles = parseGpsLiteStream(stream, 'panevezys', { filterInvalidCoords: true });
      
      expect(vehicles).toHaveLength(1);
    });
  });

  describe('Vehicle ID Generation', () => {
    it('should generate unique vehicle IDs', () => {
      const stream = `${PANEVEZYS_ROW_1}\n${PANEVEZYS_ROW_2}`;
      const vehicles = parseGpsLiteStream(stream, 'panevezys', { filterInvalidCoords: false });
      
      expect(vehicles[0]!.id).toBeDefined();
      expect(vehicles[1]!.id).toBeDefined();
      expect(vehicles[0]!.id).not.toBe(vehicles[1]!.id);
    });

    it('should include city in ID', () => {
      const vehicles = parseGpsLiteStream(PANEVEZYS_ROW_1, 'panevezys', { filterInvalidCoords: false });
      expect(vehicles[0]!.id).toContain('panevezys');
    });
  });

  describe('Default Values', () => {
    it('should default type to bus for all lite format vehicles', () => {
      const vehicles = parseGpsLiteStream(PANEVEZYS_ROW_1, 'panevezys', { filterInvalidCoords: false });
      expect(vehicles[0]!.type).toBe('bus');
    });

    it('should set destination to null (no GTFS in stream)', () => {
      const vehicles = parseGpsLiteStream(PANEVEZYS_ROW_1, 'panevezys', { filterInvalidCoords: false });
      expect(vehicles[0]!.destination).toBeNull();
    });

    it('should set gtfsTripId to null', () => {
      const vehicles = parseGpsLiteStream(PANEVEZYS_ROW_1, 'panevezys', { filterInvalidCoords: false });
      expect(vehicles[0]!.gtfsTripId).toBeNull();
    });
  });
});

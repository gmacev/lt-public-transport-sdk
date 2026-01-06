/**
 * GPS Full Format Parser Unit Tests
 * 
 * Tests parsing logic with mocked/fixture data to ensure deterministic,
 * repeatable tests independent of live data.
 * 
 * Format notes:
 * - Coordinates (Ilguma, Platuma) are large integers divided by 1,000,000
 * - Transportas: 'Autobusai' = bus, 'Troleibusai' = trolleybus
 * - Each city has different column layouts
 */

import { describe, it, expect } from 'vitest';
import { parseGpsFullStream } from '../parsers/gps-full.js';

// =============================================================================
// Fixtures: Vilnius Format (18 columns)
// =============================================================================

const VILNIUS_HEADER = 'Transportas,Marsrutas,ReisoID,MasinosNumeris,Ilguma,Platuma,Greitis,Azimutas,ReisoPradziaMinutemis,NuokrypisSekundemis,MatavimoLaikas,MasinosTipas,KryptiesTipas,KryptiesPavadinimas,ReisoIdGTFS,x1,x2,x3';

// Coords in Lithuania: Vilnius 25.2797 (lon), 54.6872 (lat) -> 25279700, 54687200
const VILNIUS_BUS_ROW = 'Autobusai,3G,12345,1234,25279700,54687200,45,180,480,30,45000,low_floor,A>D,Santariškės - Pilaitė,GTFS123,0,0,0';
const VILNIUS_TROLLEY_ROW = 'Troleibusai,7,11111,9999,25350000,54750000,25,270,720,-60,47000,standard,A>D,Centras - Pilaitė,GTFS789,0,0,0';

// =============================================================================
// Fixtures: Kaunas Format (14 columns)
// =============================================================================

const KAUNAS_HEADER = 'Transportas,Marsrutas,Grafikas,MasinosNumeris,Ilguma,Platuma,Greitis,Azimutas,ReisoPradziaMinutemis,NuokrypisSekundemis,SekanciosStotelesNum,AtvykimoLaikasSekundemis,x1,x2';

// Kaunas coords: 23.9036 (lon), 54.8985 (lat) -> 23903600, 54898500
const KAUNAS_BUS_ROW = 'Autobusai,23,GRF001,4567,23903600,54898500,35,120,540,15,123,50400,0,0';
const KAUNAS_TROLLEY_ROW = 'Troleibusai,5,GRF002,7890,23910000,54900000,20,0,480,-10,456,51000,0,0';

// =============================================================================
// Fixtures: Klaipėda Format (12 columns, minimal)
// =============================================================================

const KLAIPEDA_HEADER = 'Transportas,Marsrutas,ReisoID,MasinosNumeris,Ilguma,Platuma,Greitis,Azimutas,ReisoPradziaMinutemis,NuokrypisSekundemis,KryptiesPavadinimas,x1';

// Klaipėda coords: 21.1443 (lon), 55.7033 (lat) -> 21144300, 55703300
const KLAIPEDA_BUS_ROW = 'Autobusai,6,REI001,2345,21144300,55703300,40,45,600,0,Centras - Smiltynė,0';

// =============================================================================
// Edge Cases
// =============================================================================

const EMPTY_STREAM = '';
const HEADER_ONLY = VILNIUS_HEADER;
const MALFORMED_ROW = 'Autobusai,invalid,not,enough,columns';

// Zero coordinates (should be filtered when filterInvalidCoords is true)
const ZERO_COORDS_ROW = 'Autobusai,3G,12345,1234,0,0,45,180,480,30,45000,low_floor,A>D,Test,GTFS123,0,0,0';

// UTF-8 BOM prefix
const BOM = '\uFEFF';

// =============================================================================
// Test Suites
// =============================================================================

describe('GPS Full Parser', () => {
  describe('Basic Parsing', () => {
    it('should parse valid Vilnius format data', () => {
      const stream = `${VILNIUS_HEADER}\n${VILNIUS_BUS_ROW}`;
      const vehicles = parseGpsFullStream(stream, 'vilnius', { filterInvalidCoords: false });
      
      expect(vehicles).toHaveLength(1);
      expect(vehicles[0]).toBeDefined();
      
      const v = vehicles[0]!;
      expect(v.route).toBe('3G');
      expect(v.vehicleNumber).toBe('1234');
      expect(v.type).toBe('bus');
      expect(v.speed).toBe(45);
      expect(v.bearing).toBe(180);
      expect(v.tripId).toBe('12345');
      expect(v.gtfsTripId).toBe('GTFS123');
      expect(v.destination).toBe('Santariškės - Pilaitė');
    });

    it('should parse multiple vehicles', () => {
      const stream = `${VILNIUS_HEADER}\n${VILNIUS_BUS_ROW}\n${VILNIUS_TROLLEY_ROW}`;
      const vehicles = parseGpsFullStream(stream, 'vilnius', { filterInvalidCoords: false });
      
      expect(vehicles).toHaveLength(2);
      expect(vehicles[0]!.type).toBe('bus');
      expect(vehicles[1]!.type).toBe('trolleybus');
    });

    it('should correctly identify vehicle types', () => {
      const busStream = `${VILNIUS_HEADER}\n${VILNIUS_BUS_ROW}`;
      const trolleyStream = `${VILNIUS_HEADER}\n${VILNIUS_TROLLEY_ROW}`;
      
      const buses = parseGpsFullStream(busStream, 'vilnius', { filterInvalidCoords: false });
      const trolleys = parseGpsFullStream(trolleyStream, 'vilnius', { filterInvalidCoords: false });
      
      expect(buses[0]!.type).toBe('bus');
      expect(trolleys[0]!.type).toBe('trolleybus');
    });

    it('should normalize coordinates from large integers', () => {
      const stream = `${VILNIUS_HEADER}\n${VILNIUS_BUS_ROW}`;
      const vehicles = parseGpsFullStream(stream, 'vilnius', { filterInvalidCoords: false });
      
      const v = vehicles[0]!;
      // 25279700 / 1000000 = 25.2797
      expect(v.longitude).toBeCloseTo(25.2797, 3);
      // 54687200 / 1000000 = 54.6872
      expect(v.latitude).toBeCloseTo(54.6872, 3);
    });
  });

  describe('City-Specific Formats', () => {
    it('should parse Kaunas format with Grafikas and nextStopId', () => {
      const stream = `${KAUNAS_HEADER}\n${KAUNAS_BUS_ROW}`;
      const vehicles = parseGpsFullStream(stream, 'kaunas', { filterInvalidCoords: false });
      
      expect(vehicles).toHaveLength(1);
      expect(vehicles[0]).toBeDefined();
      
      const v = vehicles[0]!;
      expect(v.tripId).toBe('GRF001'); // Grafikas maps to tripId
      expect(v.nextStopId).toBe('123');
      expect(v.arrivalTimeSeconds).toBe(50400);
    });

    it('should parse Klaipėda minimal format', () => {
      const stream = `${KLAIPEDA_HEADER}\n${KLAIPEDA_BUS_ROW}`;
      const vehicles = parseGpsFullStream(stream, 'klaipeda', { filterInvalidCoords: false });
      
      expect(vehicles).toHaveLength(1);
      expect(vehicles[0]!.route).toBe('6');
      expect(vehicles[0]!.tripId).toBe('REI001');
    });

    it('should handle Kaunas trolleybus', () => {
      const stream = `${KAUNAS_HEADER}\n${KAUNAS_TROLLEY_ROW}`;
      const vehicles = parseGpsFullStream(stream, 'kaunas', { filterInvalidCoords: false });
      
      expect(vehicles).toHaveLength(1);
      expect(vehicles[0]!.type).toBe('trolleybus');
    });
  });

  describe('BOM Handling', () => {
    it('should strip UTF-8 BOM from header', () => {
      const streamWithBOM = `${BOM}${VILNIUS_HEADER}\n${VILNIUS_BUS_ROW}`;
      const vehicles = parseGpsFullStream(streamWithBOM, 'vilnius', { filterInvalidCoords: false });
      
      expect(vehicles).toHaveLength(1);
      expect(vehicles[0]!.type).toBe('bus'); // Transportas column parsed correctly
    });

    it('should work without BOM', () => {
      const streamWithoutBOM = `${VILNIUS_HEADER}\n${VILNIUS_BUS_ROW}`;
      const vehicles = parseGpsFullStream(streamWithoutBOM, 'vilnius', { filterInvalidCoords: false });
      
      expect(vehicles).toHaveLength(1);
    });
  });

  describe('Empty and Edge Cases', () => {
    it('should return empty array for empty stream', () => {
      const vehicles = parseGpsFullStream(EMPTY_STREAM, 'vilnius', {});
      expect(vehicles).toEqual([]);
    });

    it('should return empty array for header-only stream', () => {
      const vehicles = parseGpsFullStream(HEADER_ONLY, 'vilnius', {});
      expect(vehicles).toEqual([]);
    });

    it('should skip malformed rows', () => {
      const stream = `${VILNIUS_HEADER}\n${VILNIUS_BUS_ROW}\n${MALFORMED_ROW}\n${VILNIUS_TROLLEY_ROW}`;
      const vehicles = parseGpsFullStream(stream, 'vilnius', { filterInvalidCoords: false });
      
      // Should have 2 valid vehicles, malformed row skipped
      expect(vehicles).toHaveLength(2);
    });

    it('should handle blank lines', () => {
      const stream = `${VILNIUS_HEADER}\n\n${VILNIUS_BUS_ROW}\n\n`;
      const vehicles = parseGpsFullStream(stream, 'vilnius', { filterInvalidCoords: false });
      
      expect(vehicles).toHaveLength(1);
    });
  });

  describe('Coordinate Filtering', () => {
    it('should filter zero coordinates when filterInvalidCoords is true', () => {
      const stream = `${VILNIUS_HEADER}\n${VILNIUS_BUS_ROW}\n${ZERO_COORDS_ROW}`;
      const vehicles = parseGpsFullStream(stream, 'vilnius', { filterInvalidCoords: true });
      
      expect(vehicles).toHaveLength(1);
    });

    it('should include zero coordinates when filterInvalidCoords is false', () => {
      const stream = `${VILNIUS_HEADER}\n${VILNIUS_BUS_ROW}\n${ZERO_COORDS_ROW}`;
      const vehicles = parseGpsFullStream(stream, 'vilnius', { filterInvalidCoords: false });
      
      expect(vehicles).toHaveLength(2);
    });
  });

  describe('Required Column Validation', () => {
    it('should throw error for missing required column', () => {
      const badHeader = 'Marsrutas,ReisoID,MasinosNumeris,Ilguma,Platuma'; // Missing Transportas
      const stream = `${badHeader}\n1,12345,1234,25279700,54687200`;
      
      expect(() => parseGpsFullStream(stream, 'vilnius', {})).toThrow('Required column');
    });
  });
});

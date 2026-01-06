/**
 * GTFS Parser Unit Tests
 * 
 * Tests parsing of routes.txt and stops.txt files from GTFS archives.
 * These tests use fixture data to detect format changes.
 */

import { describe, it, expect } from 'vitest';
import { parseRoutesContent, parseStopsContent } from '../gtfs/parser.js';

// =============================================================================
// Fixtures: routes.txt
// =============================================================================

const ROUTES_HEADER = 'route_id,agency_id,route_short_name,route_long_name,route_desc,route_type,route_url,route_color,route_text_color';

const ROUTES_BUS_ROW = 'r_123,agency1,3G,Santariškės - Pilaitė,,3,,0000FF,FFFFFF';
const ROUTES_TROLLEY_ROW = 'r_456,agency1,7,Centras - Lazdynai,,800,,FF0000,000000';
const ROUTES_QUOTED_ROW = 'r_789,agency1,N1,"Naktinis: Stotis - Centras, Senamiestis",,3,,00FF00,000000';

// Full fixture
const ROUTES_TXT_VALID = `${ROUTES_HEADER}
${ROUTES_BUS_ROW}
${ROUTES_TROLLEY_ROW}
${ROUTES_QUOTED_ROW}`;

// =============================================================================
// Fixtures: stops.txt
// =============================================================================

const STOPS_HEADER = 'stop_id,stop_code,stop_name,stop_desc,stop_lat,stop_lon';

// Coords within Lithuania bounds
const STOP_1 = 'stop_001,A1,Centras,,54.6872,25.2797';
const STOP_2 = 'stop_002,B2,Žirmūnai,Near the park,54.7123,25.3101';
const STOP_3 = 'stop_003,,Pilaitė,,54.7050,25.1950'; // No stop_code

// Quoted stop name
const STOP_QUOTED = 'stop_004,C3,"Stotis, Autobusų",Main bus station,54.6700,25.2850';

// Full fixture
const STOPS_TXT_VALID = `${STOPS_HEADER}
${STOP_1}
${STOP_2}
${STOP_3}
${STOP_QUOTED}`;

// =============================================================================
// Routes Parser Tests
// =============================================================================

describe('parseRoutesContent', () => {
  describe('Basic Parsing', () => {
    it('should parse valid routes.txt content', () => {
      const routes = parseRoutesContent(ROUTES_TXT_VALID);
      
      // 3 routes, but keyed by both shortName and id = 6 entries
      expect(routes.size).toBeGreaterThanOrEqual(3);
    });

    it('should extract route short name', () => {
      const routes = parseRoutesContent(ROUTES_TXT_VALID);
      
      expect(routes.has('3G')).toBe(true);
      expect(routes.has('7')).toBe(true);
      expect(routes.has('N1')).toBe(true);
    });

    it('should extract route long name', () => {
      const routes = parseRoutesContent(ROUTES_TXT_VALID);
      const route = routes.get('3G');
      
      expect(route).toBeDefined();
      expect(route!.longName).toBe('Santariškės - Pilaitė');
    });

    it('should map route types to vehicle types', () => {
      const routes = parseRoutesContent(ROUTES_TXT_VALID);
      
      // route_type 3 = bus
      expect(routes.get('3G')!.type).toBe('bus');
      
      // route_type 800 = trolleybus
      expect(routes.get('7')!.type).toBe('trolleybus');
    });

    it('should extract colors without # prefix', () => {
      const routes = parseRoutesContent(ROUTES_TXT_VALID);
      const route = routes.get('3G');
      
      expect(route!.color).toBe('0000FF');
      expect(route!.textColor).toBe('FFFFFF');
    });

    it('should key routes by both short name and route_id', () => {
      const routes = parseRoutesContent(ROUTES_TXT_VALID);
      
      // Should be accessible by short name
      expect(routes.has('3G')).toBe(true);
      
      // Should also be accessible by route_id
      expect(routes.has('r_123')).toBe(true);
      
      // Both should return the same route
      expect(routes.get('3G')!.id).toBe(routes.get('r_123')!.id);
    });
  });

  describe('CSV Handling', () => {
    it('should handle quoted fields with commas', () => {
      const routes = parseRoutesContent(ROUTES_TXT_VALID);
      const route = routes.get('N1');
      
      expect(route).toBeDefined();
      expect(route!.longName).toBe('Naktinis: Stotis - Centras, Senamiestis');
    });

    it('should handle escaped quotes in quoted fields', () => {
      const content = `${ROUTES_HEADER}
r_999,agency1,X1,"Route ""Express"" Service",,3,,000000,FFFFFF`;
      
      const routes = parseRoutesContent(content);
      const route = routes.get('X1');
      
      expect(route).toBeDefined();
      expect(route!.longName).toBe('Route "Express" Service');
    });
  });

  describe('Edge Cases', () => {
    it('should return empty map for empty content', () => {
      const routes = parseRoutesContent('');
      expect(routes.size).toBe(0);
    });

    it('should return empty map for header-only content', () => {
      const routes = parseRoutesContent(ROUTES_HEADER);
      expect(routes.size).toBe(0);
    });

    it('should skip malformed rows', () => {
      const content = `${ROUTES_HEADER}
${ROUTES_BUS_ROW}
this,is,not,valid
${ROUTES_TROLLEY_ROW}`;
      
      const routes = parseRoutesContent(content);
      expect(routes.has('3G')).toBe(true);
      expect(routes.has('7')).toBe(true);
    });

    it('should handle blank lines', () => {
      const content = `${ROUTES_HEADER}

${ROUTES_BUS_ROW}

`;
      const routes = parseRoutesContent(content);
      expect(routes.has('3G')).toBe(true);
    });

    it('should handle Windows line endings (CRLF)', () => {
      const content = `${ROUTES_HEADER}\r\n${ROUTES_BUS_ROW}\r\n`;
      const routes = parseRoutesContent(content);
      expect(routes.has('3G')).toBe(true);
    });
  });

  describe('Unknown Route Types', () => {
    it('should default to unknown for unrecognized route_type', () => {
      const content = `${ROUTES_HEADER}
r_999,agency1,??,Unknown Type,,999,,000000,FFFFFF`;
      
      const routes = parseRoutesContent(content);
      const route = routes.get('??');
      
      expect(route!.type).toBe('unknown');
    });
  });
});

// =============================================================================
// Stops Parser Tests
// =============================================================================

describe('parseStopsContent', () => {
  describe('Basic Parsing', () => {
    it('should parse valid stops.txt content', () => {
      const stops = parseStopsContent(STOPS_TXT_VALID);
      expect(stops).toHaveLength(4);
    });

    it('should extract stop ID and name', () => {
      const stops = parseStopsContent(STOPS_TXT_VALID);
      const stop = stops.find(s => s.id === 'stop_001');
      
      expect(stop).toBeDefined();
      expect(stop!.name).toBe('Centras');
    });

    it('should extract stop code', () => {
      const stops = parseStopsContent(STOPS_TXT_VALID);
      const stop = stops.find(s => s.id === 'stop_001');
      
      expect(stop!.code).toBe('A1');
    });

    it('should handle missing stop code as empty string', () => {
      const stops = parseStopsContent(STOPS_TXT_VALID);
      const stop = stops.find(s => s.id === 'stop_003');
      
      // Parser keeps empty string (not null) for missing stop_code
      expect(stop!.code).toBe('');
    });

    it('should extract coordinates', () => {
      const stops = parseStopsContent(STOPS_TXT_VALID);
      const stop = stops.find(s => s.id === 'stop_001');
      
      expect(stop!.latitude).toBeCloseTo(54.6872, 4);
      expect(stop!.longitude).toBeCloseTo(25.2797, 4);
    });

    it('should extract description', () => {
      const stops = parseStopsContent(STOPS_TXT_VALID);
      const stop = stops.find(s => s.id === 'stop_002');
      
      expect(stop!.description).toBe('Near the park');
    });

    it('should handle missing description', () => {
      const stops = parseStopsContent(STOPS_TXT_VALID);
      const stop = stops.find(s => s.id === 'stop_001');
      
      expect(stop!.description).toBeNull();
    });
  });

  describe('CSV Handling', () => {
    it('should handle quoted stop names with commas', () => {
      const stops = parseStopsContent(STOPS_TXT_VALID);
      const stop = stops.find(s => s.id === 'stop_004');
      
      expect(stop).toBeDefined();
      expect(stop!.name).toBe('Stotis, Autobusų');
    });
  });

  describe('Edge Cases', () => {
    it('should return empty array for empty content', () => {
      const stops = parseStopsContent('');
      expect(stops).toEqual([]);
    });

    it('should return empty array for header-only content', () => {
      const stops = parseStopsContent(STOPS_HEADER);
      expect(stops).toEqual([]);
    });

    it('should skip stops outside Lithuania bounds', () => {
      const content = `${STOPS_HEADER}
stop_valid,,Valid Stop,,54.6872,25.2797
stop_paris,,Paris,,48.8566,2.3522`;
      
      const stops = parseStopsContent(content);
      expect(stops).toHaveLength(1);
      expect(stops[0]!.id).toBe('stop_valid');
    });

    it('should handle blank lines', () => {
      const content = `${STOPS_HEADER}

${STOP_1}

`;
      const stops = parseStopsContent(content);
      expect(stops).toHaveLength(1);
    });
  });
});

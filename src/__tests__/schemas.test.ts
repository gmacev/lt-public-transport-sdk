/**
 * Zod Schema Validation Unit Tests
 * 
 * Tests that Zod schemas correctly validate and reject data.
 */

import { describe, it, expect } from 'vitest';
import {
  gpsFullRowSchema,
  gpsLitePanevezysSchema,
  gpsLiteTaurageSchema,
  gtfsRouteSchema,
  gtfsStopSchema,
  clientConfigSchema,
} from '../schemas.js';

// =============================================================================
// GPS Full Row Schema Tests (uses Lithuanian column names)
// =============================================================================

describe('gpsFullRowSchema', () => {
  it('should validate a complete GPS full row', () => {
    const validRow = {
      Transportas: 'Autobusai',
      Marsrutas: '3G',
      MasinosNumeris: '1234',
      Ilguma: 25279700,  // Integer coordinate
      Platuma: 54687200, // Integer coordinate
      Greitis: 45,
      Azimutas: 180,
    };

    const result = gpsFullRowSchema.safeParse(validRow);
    expect(result.success).toBe(true);
  });

  it('should coerce string coordinates to integers', () => {
    const row = {
      Transportas: 'Autobusai',
      Marsrutas: '3G',
      MasinosNumeris: '1234',
      Ilguma: '25279700',  // String that coerces to int
      Platuma: '54687200', // String that coerces to int
    };

    const result = gpsFullRowSchema.safeParse(row);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(typeof result.data.Ilguma).toBe('number');
    }
  });

  it('should reject missing required fields', () => {
    const invalidRow = {
      Transportas: 'Autobusai',
      // Missing MasinosNumeris
      Marsrutas: '3G',
      Ilguma: 25279700,
      Platuma: 54687200,
    };

    const result = gpsFullRowSchema.safeParse(invalidRow);
    expect(result.success).toBe(false);
  });

  it('should reject empty transport type', () => {
    const invalidRow = {
      Transportas: '',  // Empty string fails min(1)
      Marsrutas: '3G',
      MasinosNumeris: '1234',
      Ilguma: 25279700,
      Platuma: 54687200,
    };

    const result = gpsFullRowSchema.safeParse(invalidRow);
    expect(result.success).toBe(false);
  });

  it('should allow empty route (Marsrutas)', () => {
    const row = {
      Transportas: 'Autobusai',
      Marsrutas: '',  // Empty allowed
      MasinosNumeris: '1234',
      Ilguma: 25279700,
      Platuma: 54687200,
    };

    const result = gpsFullRowSchema.safeParse(row);
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// GPS Lite Schema Tests (tuple format)
// =============================================================================

describe('gpsLitePanevezysSchema', () => {
  it('should validate a Panevėžys lite row (9 columns)', () => {
    const validRow = ['2', '12', '24358920', '55728450', '35', '180', '0', 'VEH001', '0'];

    const result = gpsLitePanevezysSchema.safeParse(validRow);
    expect(result.success).toBe(true);
  });

  it('should reject too few columns', () => {
    const invalidRow = ['2', '12', '24358920', '55728450', '35']; // Only 5 columns

    const result = gpsLitePanevezysSchema.safeParse(invalidRow);
    expect(result.success).toBe(false);
  });
});

describe('gpsLiteTaurageSchema', () => {
  it('should validate a Tauragė lite row (8 columns)', () => {
    const validRow = ['2', 'S11', '22289000', '55252000', '30', '45', 'TAU001', '0'];

    const result = gpsLiteTaurageSchema.safeParse(validRow);
    expect(result.success).toBe(true);
  });

  it('should accept alphanumeric route identifiers', () => {
    const row = ['2', 'J25', '22289000', '55252000', '30', '45', 'TAU002', '0'];

    const result = gpsLiteTaurageSchema.safeParse(row);
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// GTFS Schema Tests
// =============================================================================

describe('gtfsRouteSchema', () => {
  it('should validate a GTFS route', () => {
    const validRoute = {
      route_id: 'route_123',
      route_short_name: '12',
      route_long_name: 'Centras - Kalniečiai',
      route_type: '3',  // String coerces to number
    };

    const result = gtfsRouteSchema.safeParse(validRoute);
    expect(result.success).toBe(true);
  });

  it('should reject missing route_id', () => {
    const invalidRoute = {
      route_short_name: '12',
      route_long_name: 'Centras - Kalniečiai',
      route_type: '3',
    };

    const result = gtfsRouteSchema.safeParse(invalidRoute);
    expect(result.success).toBe(false);
  });

  it('should provide default colors', () => {
    const route = {
      route_id: 'r1',
      route_short_name: '12',
      route_type: '3',
    };

    const result = gtfsRouteSchema.safeParse(route);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.route_color).toBe('FFFFFF');
      expect(result.data.route_text_color).toBe('000000');
    }
  });
});

describe('gtfsStopSchema', () => {
  it('should validate a GTFS stop with Lithuania coords', () => {
    const validStop = {
      stop_id: 'stop_456',
      stop_name: 'Centras',
      stop_lat: '54.6872',
      stop_lon: '25.2797',
    };

    const result = gtfsStopSchema.safeParse(validStop);
    expect(result.success).toBe(true);
  });

  it('should reject coordinates outside Lithuania', () => {
    const invalidStop = {
      stop_id: 'stop_456',
      stop_name: 'Paris',
      stop_lat: '48.856614',  // Paris latitude (too low)
      stop_lon: '2.352222',   // Paris longitude (too low)
    };

    const result = gtfsStopSchema.safeParse(invalidStop);
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// Client Config Schema Tests
// =============================================================================

describe('clientConfigSchema', () => {
  it('should validate default config with empty object', () => {
    const result = clientConfigSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should validate config with custom timeout', () => {
    const config = {
      requestTimeout: 60000,
    };

    const result = clientConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should validate config with all options', () => {
    const config = {
      requestTimeout: 30000,
      cacheDir: '/custom/cache',
      userAgent: 'MyApp/1.0',
      filterStale: true,
      filterInvalidCoords: true,
      autoEnrich: true,
      staleThresholdMs: 120000,
    };

    const result = clientConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should reject negative timeout', () => {
    const config = {
      requestTimeout: -1000,
    };

    const result = clientConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('should reject non-boolean filterStale', () => {
    const config = {
      filterStale: 'yes', // String instead of boolean
    };

    const result = clientConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });
});

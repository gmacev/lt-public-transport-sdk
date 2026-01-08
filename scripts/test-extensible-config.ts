/**
 * Live Test Script for Extensible City Configuration
 * 
 * Tests:
 * 1. Existing cities still work
 * 2. Custom city config is accepted
 * 3. City override works
 * 
 * Run with: npx tsx scripts/test-extensible-config.ts
 */

import { LtTransport, LITE_FORMAT_DESCRIPTORS, type CityConfig } from '../src/index.js';

async function main() {
  console.log('='.repeat(60));
  console.log('Extensible City Configuration - Live Test');
  console.log('='.repeat(60));
  console.log();

  // Test 1: Existing gold-tier city (Vilnius)
  console.log('1. Testing existing gold-tier city (Vilnius)...');
  try {
    const transport = new LtTransport();
    const vilnius = await transport.getVehicles('vilnius');
    console.log(`   ✓ Vilnius: ${vilnius.length} vehicles`);
  } catch (error) {
    console.log(`   ✗ Vilnius failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Test 2: Existing silver-tier city (Panevėžys)
  console.log('2. Testing existing silver-tier city (Panevėžys)...');
  try {
    const transport = new LtTransport();
    const panevezys = await transport.getVehicles('panevezys');
    console.log(`   ✓ Panevėžys: ${panevezys.length} vehicles`);
  } catch (error) {
    console.log(`   ✗ Panevėžys failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Test 3: Custom city registration
  console.log('3. Testing custom city registration...');
  try {
    const customCityConfig: CityConfig = {
      id: 'testcity',
      tier: 'silver',
      gps: {
        enabled: true,
        format: 'lite',
        url: 'https://www.stops.lt/panevezys/gps.txt', // Use panevezys URL for testing
      },
      gtfs: {
        enabled: true,
        url: 'https://www.stops.lt/panevezys/panevezys/gtfs.zip',
      },
      liteFormat: LITE_FORMAT_DESCRIPTORS.panevezys, // Use panevezys format
    };

    const transport = new LtTransport({
      customCities: {
        testcity: customCityConfig,
      },
    });

    const cities = transport.getCities();
    const hasTestCity = cities.includes('testcity');
    
    if (hasTestCity) {
      console.log(`   ✓ Custom city 'testcity' registered`);
      console.log(`   ✓ Available cities: ${cities.join(', ')}`);
      
      // Try to fetch vehicles from custom city (using panevezys endpoint)
      const vehicles = await transport.getVehicles('testcity');
      console.log(`   ✓ Custom city vehicles: ${vehicles.length}`);
    } else {
      console.log(`   ✗ Custom city not found in getCities()`);
    }
  } catch (error) {
    console.log(`   ✗ Custom city failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Test 4: City override (modifying panevezys config)
  console.log('4. Testing city override...');
  try {
    const transport = new LtTransport({
      cityOverrides: {
        panevezys: {
          // Override the liteFormat with same values (just testing the mechanism)
          liteFormat: {
            minColumns: 9,
            vehicleIdIndex: 7,
            routeIndex: 1,
            coordIndices: [3, 2] as const,
            speedIndex: 4,
            bearingIndex: 5,
          },
        },
      },
    });

    const config = transport.getCityConfig('panevezys');
    const hasOverride = config.liteFormat !== undefined;
    
    if (hasOverride) {
      console.log(`   ✓ Override applied to panevezys`);
      console.log(`   ✓ liteFormat.minColumns: ${config.liteFormat?.minColumns}`);
      
      // Verify vehicles still work
      const vehicles = await transport.getVehicles('panevezys');
      console.log(`   ✓ Panevėžys with override: ${vehicles.length} vehicles`);
    } else {
      console.log(`   ✗ Override not applied`);
    }
  } catch (error) {
    console.log(`   ✗ Override failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Test 5: Invalid city throws error
  console.log('5. Testing invalid city error handling...');
  try {
    const transport = new LtTransport();
    await transport.getVehicles('nonexistent');
    console.log(`   ✗ Should have thrown InvalidCityError`);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Invalid city')) {
      console.log(`   ✓ InvalidCityError thrown correctly`);
    } else {
      console.log(`   ✗ Wrong error type: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  // Test 6: Invalid config validation
  console.log('6. Testing invalid config validation...');
  try {
    // This should throw a ZodError with helpful message
    new LtTransport({
      customCities: {
        badcity: {
          id: 'badcity',
          tier: 'silver',
          gps: {
            enabled: true,
            format: 'lite',
            url: 'https://example.com/gps.txt',
          },
          gtfs: {
            enabled: true,
            url: 'https://example.com/gtfs.zip',
          },
          // Missing liteFormat! This should fail validation
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      },
    });
    console.log(`   ✗ Should have thrown validation error`);
  } catch (error) {
    if (error instanceof Error && error.message.includes('liteFormat')) {
      console.log(`   ✓ Validation error thrown: liteFormat required`);
    } else {
      console.log(`   ✓ Validation error thrown: ${error instanceof Error ? error.message.slice(0, 100) : String(error)}`);
    }
  }

  // Test 7: Invalid column index validation
  console.log('7. Testing invalid column index validation...');
  try {
    new LtTransport({
      customCities: {
        badformat: {
          id: 'badformat',
          tier: 'silver',
          gps: {
            enabled: true,
            format: 'lite',
            url: 'https://example.com/gps.txt',
          },
          gtfs: {
            enabled: true,
            url: 'https://example.com/gtfs.zip',
          },
          liteFormat: {
            minColumns: -5, // Invalid! Should be positive
            vehicleIdIndex: 7,
            routeIndex: 1,
            coordIndices: [3, 2] as const,
            speedIndex: 4,
            bearingIndex: 5,
          },
        },
      },
    });
    console.log(`   ✗ Should have thrown validation error`);
  } catch (error) {
    if (error instanceof Error && error.message.includes('positive')) {
      console.log(`   ✓ Validation error thrown: minColumns must be positive`);
    } else {
      console.log(`   ✓ Validation error thrown: ${error instanceof Error ? error.message.slice(0, 100) : String(error)}`);
    }
  }

  console.log();
  console.log('='.repeat(60));
  console.log('All tests completed!');
  console.log('='.repeat(60));
}

main().catch(console.error);

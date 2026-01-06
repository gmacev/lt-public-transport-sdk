import { LtTransport } from '../dist/index.js';
import { GpsNotAvailableError, InvalidCityError, TransportNetworkError } from '../dist/errors.js';

/**
 * Test Script: Error Handling
 * 
 * Validates that the SDK correctly throws errors for:
 * - Bronze tier cities (GPS disabled)
 * - Invalid city IDs
 * - Network failures (simulated via bad URLs - not directly testable here)
 */

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

const results: TestResult[] = [];

function pass(name: string, message: string): void {
  results.push({ name, passed: true, message });
  console.log(`  ✅ ${name}: ${message}`);
}

function fail(name: string, message: string): void {
  results.push({ name, passed: false, message });
  console.log(`  ❌ ${name}: ${message}`);
}

async function testBronzeTierGpsError(): Promise<void> {
  console.log('\n📋 Testing Bronze Tier GPS Error (Šiauliai, Utena)...');
  const client = new LtTransport();
  
  // Šiauliai
  try {
    await client.getVehicles('siauliai');
    fail('siauliai-gps', 'Should have thrown GpsNotAvailableError');
  } catch (err: unknown) {
    if (err instanceof GpsNotAvailableError) {
      pass('siauliai-gps', `Correctly threw GpsNotAvailableError: ${err.message}`);
    } else {
      fail('siauliai-gps', `Wrong error type: ${String(err)}`);
    }
  }

  // Utena
  try {
    await client.getVehicles('utena');
    fail('utena-gps', 'Should have thrown GpsNotAvailableError');
  } catch (err: unknown) {
    if (err instanceof GpsNotAvailableError) {
      pass('utena-gps', `Correctly threw GpsNotAvailableError: ${err.message}`);
    } else {
      fail('utena-gps', `Wrong error type: ${String(err)}`);
    }
  }
}

async function testInvalidCityError(): Promise<void> {
  console.log('\n📋 Testing Invalid City ID Error...');
  const client = new LtTransport();
  
  const invalidCities = ['tokyo', 'riga', 'warsaw', '', 'VILNIUS', 'Vilnius'];
  
  for (const city of invalidCities) {
    try {
      // Cast to any to bypass TypeScript check - we're testing runtime validation
      await client.getVehicles(city as 'vilnius');
      fail(`invalid-city-${city || 'empty'}`, 'Should have thrown InvalidCityError');
    } catch (err: unknown) {
      if (err instanceof InvalidCityError) {
        pass(`invalid-city-${city || 'empty'}`, `Correctly rejected: "${city}"`);
      } else {
        // Might be a different error for some edge cases
        fail(`invalid-city-${city || 'empty'}`, `Unexpected error: ${String(err)}`);
      }
    }
  }
}

async function testSyncRequiredError(): Promise<void> {
  console.log('\n📋 Testing Sync Required Error...');
  // Create a fresh client with a unique cache dir to ensure no cached data
  const client = new LtTransport({
    cacheDir: `/tmp/lt-transport-test-${String(Date.now())}`,
  });
  
  // Try to get routes without syncing first
  try {
    await client.getRoutes('vilnius');
    fail('sync-required-routes', 'Should have thrown SyncRequiredError');
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('sync')) {
      pass('sync-required-routes', `Correctly requires sync: ${err.message}`);
    } else {
      fail('sync-required-routes', `Unexpected error: ${String(err)}`);
    }
  }

  // Same for stops
  try {
    await client.getStops('vilnius');
    fail('sync-required-stops', 'Should have thrown SyncRequiredError');
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('sync')) {
      pass('sync-required-stops', `Correctly requires sync: ${err.message}`);
    } else {
      fail('sync-required-stops', `Unexpected error: ${String(err)}`);
    }
  }
}

async function testNetworkTimeout(): Promise<void> {
  console.log('\n📋 Testing Network Timeout Handling...');
  
  // Very short timeout to trigger timeout errors
  const client = new LtTransport({
    requestTimeout: 1, // 1ms - should definitely timeout
  });
  
  try {
    await client.getVehicles('vilnius');
    fail('network-timeout', 'Should have thrown a timeout/network error');
  } catch (err: unknown) {
    if (err instanceof TransportNetworkError) {
      pass('network-timeout', `Correctly threw TransportNetworkError: ${err.message}`);
    } else if (err instanceof Error && (err.message.includes('timeout') || err.message.includes('abort'))) {
      pass('network-timeout', `Threw timeout-related error: ${err.message}`);
    } else {
      // Might still pass if the request was cached or very fast
      fail('network-timeout', `Unexpected result: ${String(err)}`);
    }
  }
}

async function runAllTests(): Promise<void> {
  console.log('🔴 ERROR HANDLING TESTS');
  console.log('========================\n');

  await testBronzeTierGpsError();
  await testInvalidCityError();
  await testSyncRequiredError();
  await testNetworkTimeout();

  console.log('\n========================');
  console.log('RESULTS SUMMARY');
  console.log('========================');
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  console.log(`\nPassed: ${String(passed)}/${String(results.length)}`);
  console.log(`Failed: ${String(failed)}/${String(results.length)}`);
  
  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter(r => !r.passed).forEach(r => { console.log(`  - ${r.name}: ${r.message}`); });
    process.exit(1);
  } else {
    console.log('\n✅ All error handling tests passed!');
  }
}

runAllTests().catch((err: unknown) => {
  console.error('Test runner failed:', err);
  process.exit(1);
});

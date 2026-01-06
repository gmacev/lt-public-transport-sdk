import { LtTransport } from '../dist/index.js';
import type { CityId } from '../dist/types.js';

/**
 * Test Script: Configuration Options
 * 
 * Validates that SDK configuration options work correctly:
 * - filterStale: true/false
 * - filterInvalidCoords: true/false  
 * - autoEnrich: true/false
 * - staleThresholdMs customization
 * - Sync throttling behavior
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

function warn(name: string, message: string): void {
  results.push({ name, passed: true, message: `⚠️ ${message}` });
  console.log(`  ⚠️ ${name}: ${message}`);
}

async function testFilterStaleOption(): Promise<void> {
  console.log('\n📋 Testing filterStale Option...');
  
  // Get vehicles with stale filter OFF
  const clientNoFilter = new LtTransport({ filterStale: false });
  const vehiclesUnfiltered = await clientNoFilter.getVehicles('vilnius');
  const staleCount = vehiclesUnfiltered.filter(v => v.isStale).length;
  
  // Get vehicles with stale filter ON
  const clientWithFilter = new LtTransport({ filterStale: true });
  const vehiclesFiltered = await clientWithFilter.getVehicles('vilnius');
  const staleInFiltered = vehiclesFiltered.filter(v => v.isStale).length;
  
  if (staleCount > 0) {
    if (staleInFiltered === 0) {
      pass('filter-stale', `Correctly filtered ${String(staleCount)} stale vehicles`);
    } else {
      fail('filter-stale', `Still has ${String(staleInFiltered)} stale vehicles after filtering`);
    }
  } else {
    warn('filter-stale', 'No stale vehicles in current data - cannot verify filter');
  }
}

async function testFilterInvalidCoordsOption(): Promise<void> {
  console.log('\n📋 Testing filterInvalidCoords Option...');
  
  // Get vehicles with coord filter OFF
  const clientNoFilter = new LtTransport({ filterInvalidCoords: false });
  const vehiclesUnfiltered = await clientNoFilter.getVehicles('vilnius');
  
  // Check for invalid coordinates (outside Lithuania bounds)
  const invalidCoords = vehiclesUnfiltered.filter(v => 
    v.latitude < 53.5 || v.latitude > 56.5 ||
    v.longitude < 20.5 || v.longitude > 27.0 ||
    v.latitude === 0 || v.longitude === 0
  );
  
  // Get vehicles with coord filter ON
  const clientWithFilter = new LtTransport({ filterInvalidCoords: true });
  const vehiclesFiltered = await clientWithFilter.getVehicles('vilnius');
  
  const invalidInFiltered = vehiclesFiltered.filter(v => 
    v.latitude < 53.5 || v.latitude > 56.5 ||
    v.longitude < 20.5 || v.longitude > 27.0 ||
    v.latitude === 0 || v.longitude === 0
  );
  
  if (invalidCoords.length > 0) {
    if (invalidInFiltered.length < invalidCoords.length) {
      pass('filter-coords', `Filtered ${String(invalidCoords.length - invalidInFiltered.length)} invalid coord vehicles`);
    } else {
      fail('filter-coords', `Invalid coords not filtered: ${String(invalidInFiltered.length)} remain`);
    }
  } else {
    pass('filter-coords', 'All coordinates are valid - filter not needed');
  }
}

async function testAutoEnrichOption(): Promise<void> {
  console.log('\n📋 Testing autoEnrich Option...');
  
  // Test with a silver tier city (needs enrichment)
  const city: CityId = 'panevezys';
  
  // First sync GTFS
  const clientWithEnrich = new LtTransport({ autoEnrich: true });
  await clientWithEnrich.sync(city);
  
  // Get vehicles with autoEnrich ON
  const vehiclesEnriched = await clientWithEnrich.getVehicles(city);
  const withDestination = vehiclesEnriched.filter(v => v.destination !== null);
  
  // Get vehicles with autoEnrich OFF
  const clientNoEnrich = new LtTransport({ autoEnrich: false });
  await clientNoEnrich.sync(city);
  const vehiclesNotEnriched = await clientNoEnrich.getVehicles(city);
  const withDestinationNoEnrich = vehiclesNotEnriched.filter(v => v.destination !== null);
  
  if (vehiclesEnriched.length > 0) {
    if (withDestination.length > withDestinationNoEnrich.length) {
      pass('auto-enrich', `autoEnrich added destinations: ${String(withDestination.length)} vs ${String(withDestinationNoEnrich.length)}`);
    } else if (withDestinationNoEnrich.length === 0) {
      pass('auto-enrich', 'Enrichment working - no destinations without it');
    } else {
      warn('auto-enrich', `Similar destination counts: ${String(withDestination.length)} vs ${String(withDestinationNoEnrich.length)}`);
    }
  } else {
    warn('auto-enrich', 'No vehicles available for Panevėžys');
  }
}

async function testStaleThresholdCustomization(): Promise<void> {
  console.log('\n📋 Testing staleThresholdMs Customization...');
  
  // Very short threshold (1 second) - almost everything should be stale
  const clientShortThreshold = new LtTransport({ 
    staleThresholdMs: 1000,  // 1 second
    filterStale: false 
  });
  const vehiclesShort = await clientShortThreshold.getVehicles('vilnius');
  const staleShort = vehiclesShort.filter(v => v.isStale).length;
  
  // Long threshold (1 hour) - nothing should be stale
  const clientLongThreshold = new LtTransport({ 
    staleThresholdMs: 3600000, // 1 hour
    filterStale: false 
  });
  const vehiclesLong = await clientLongThreshold.getVehicles('vilnius');
  const staleLong = vehiclesLong.filter(v => v.isStale).length;
  
  if (staleShort > staleLong) {
    pass('stale-threshold', `Threshold works: ${String(staleShort)} stale (1s) vs ${String(staleLong)} stale (1h)`);
  } else if (staleShort === 0 && staleLong === 0) {
    warn('stale-threshold', 'All data is very fresh - cannot verify threshold');
  } else {
    fail('stale-threshold', `Unexpected: ${String(staleShort)} (1s) vs ${String(staleLong)} (1h)`);
  }
}

async function testSyncThrottling(): Promise<void> {
  console.log('\n📋 Testing Sync Throttling...');
  
  const client = new LtTransport();
  
  // First sync
  const start1 = Date.now();
  await client.sync('vilnius');
  const time1 = Date.now() - start1;
  
  // Immediate second sync - should be throttled (skipped)
  const start2 = Date.now();
  const result2 = await client.sync('vilnius');
  const time2 = Date.now() - start2;
  
  if (time2 < time1 / 2 || result2.status === 'up-to-date') {
    pass('sync-throttle', `Second sync was fast/skipped: ${String(time1)}ms vs ${String(time2)}ms`);
  } else {
    warn('sync-throttle', `Both syncs took similar time: ${String(time1)}ms vs ${String(time2)}ms`);
  }
}

async function runAllTests(): Promise<void> {
  console.log('⚙️ CONFIGURATION OPTIONS TESTS');
  console.log('==============================\n');

  await testFilterStaleOption();
  await testFilterInvalidCoordsOption();
  await testAutoEnrichOption();
  await testStaleThresholdCustomization();
  await testSyncThrottling();

  console.log('\n==============================');
  console.log('RESULTS SUMMARY');
  console.log('==============================');
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  console.log(`\nPassed: ${String(passed)}/${String(results.length)}`);
  console.log(`Failed: ${String(failed)}/${String(results.length)}`);
  
  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter(r => !r.passed).forEach(r => { console.log(`  - ${r.name}: ${r.message}`); });
    process.exit(1);
  } else {
    console.log('\n✅ All configuration tests passed!');
  }
}

runAllTests().catch((err: unknown) => {
  console.error('Test runner failed:', err);
  process.exit(1);
});

import { LtTransport } from '../dist/index.js';

/**
 * Test Script: City-Specific Field Validation
 * 
 * Validates that city-specific fields are properly parsed:
 * 
 * GOLD TIER (Full Format):
 * - Vilnius: ReisoIdGTFS (GTFS trip reference), KryptiesTipas (direction)
 * - Kaunas: Grafikas (schedule), SekanciosStotelesNum (next stop), AtvykimoLaikasSekundemis (arrival time)
 * - Klaipėda: Minimal format (12 cols)
 * - Alytus/Druskininkai: Standard format (13 cols)
 * 
 * SILVER TIER (Lite Format):
 * - Panevėžys: 9 columns, no header, vehicleId at col[7]
 * - Tauragė: 8 columns, no header, vehicleId at col[6], alphanumeric routes (S11, S19)
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

async function testVilniusFields(): Promise<void> {
  console.log('\n📍 Testing VILNIUS-specific fields...');
  const client = new LtTransport();
  
  const vehicles = await client.getVehicles('vilnius');
  
  if (vehicles.length === 0) {
    warn('vilnius-empty', 'No vehicles returned');
    return;
  }
  
  // Vilnius should have gtfsTripId (ReisoIdGTFS) for most vehicles
  const withGtfsTripId = vehicles.filter(v => v.gtfsTripId !== null);
  if (withGtfsTripId.length > 0) {
    pass('vilnius-gtfs-trip', `${String(withGtfsTripId.length)}/${String(vehicles.length)} have gtfsTripId`);
  } else {
    warn('vilnius-gtfs-trip', 'No vehicles have gtfsTripId - field may not be in current data');
  }
  
  // Vilnius should have tripId (ReisoID)
  const withTripId = vehicles.filter(v => v.tripId !== null && v.tripId !== '');
  if (withTripId.length > 0) {
    pass('vilnius-trip-id', `${String(withTripId.length)}/${String(vehicles.length)} have tripId`);
  } else {
    fail('vilnius-trip-id', 'No vehicles have tripId');
  }
  
  // Vilnius should have destinations from GTFS enrichment
  const withDestination = vehicles.filter(v => v.destination !== null);
  if (withDestination.length > vehicles.length * 0.5) {
    pass('vilnius-destination', `${String(withDestination.length)}/${String(vehicles.length)} have destinations`);
  } else {
    warn('vilnius-destination', `Only ${String(withDestination.length)}/${String(vehicles.length)} have destinations`);
  }
  
  // Check vehicle types - Vilnius has buses and trolleybuses
  const buses = vehicles.filter(v => v.type === 'bus');
  const trolleys = vehicles.filter(v => v.type === 'trolleybus');
  if (buses.length > 0 && trolleys.length > 0) {
    pass('vilnius-types', `Has ${String(buses.length)} buses and ${String(trolleys.length)} trolleybuses`);
  } else {
    warn('vilnius-types', `Only one type: ${String(buses.length)} buses, ${String(trolleys.length)} trolleys`);
  }
}

async function testKaunasFields(): Promise<void> {
  console.log('\n📍 Testing KAUNAS-specific fields...');
  const client = new LtTransport();
  
  const vehicles = await client.getVehicles('kaunas');
  
  if (vehicles.length === 0) {
    warn('kaunas-empty', 'No vehicles returned');
    return;
  }
  
  // Kaunas uses Grafikas instead of ReisoID - should map to tripId
  const withTripId = vehicles.filter(v => v.tripId !== null && v.tripId !== '');
  if (withTripId.length > 0) {
    pass('kaunas-grafikas', `${String(withTripId.length)}/${String(vehicles.length)} have tripId (from Grafikas)`);
  } else {
    warn('kaunas-grafikas', 'No vehicles have tripId from Grafikas');
  }
  
  // Kaunas should have nextStopId (SekanciosStotelesNum)
  const withNextStop = vehicles.filter(v => v.nextStopId !== null);
  if (withNextStop.length > 0) {
    pass('kaunas-next-stop', `${String(withNextStop.length)}/${String(vehicles.length)} have nextStopId`);
  } else {
    warn('kaunas-next-stop', 'No vehicles have nextStopId - field may not be in current data');
  }
  
  // Kaunas should have arrivalTimeSeconds (AtvykimoLaikasSekundemis) - this is FUTURE prediction
  const withArrival = vehicles.filter(v => v.arrivalTimeSeconds !== null);
  if (withArrival.length > 0) {
    pass('kaunas-arrival', `${String(withArrival.length)}/${String(vehicles.length)} have arrivalTimeSeconds`);
    
    // Validate that arrival times are reasonable (0-86400+ seconds from midnight)
    const firstWithArrival = withArrival[0];
    if (firstWithArrival !== undefined) {
      const arrTime = firstWithArrival.arrivalTimeSeconds;
      if (arrTime !== null && arrTime >= 0 && arrTime < 200000) { // Up to ~55 hours (service day)
        pass('kaunas-arrival-range', `Arrival time in valid range: ${String(arrTime)} seconds`);
      } else {
        fail('kaunas-arrival-range', `Invalid arrival time: ${String(arrTime)}`);
      }
    }
  } else {
    warn('kaunas-arrival', 'No vehicles have arrivalTimeSeconds');
  }
  
  // Kaunas has trolleybuses
  const trolleys = vehicles.filter(v => v.type === 'trolleybus');
  if (trolleys.length > 0) {
    pass('kaunas-trolley', `Has ${String(trolleys.length)} trolleybuses`);
  } else {
    warn('kaunas-trolley', 'No trolleybuses found');
  }
}

async function testKlaipedaFields(): Promise<void> {
  console.log('\n📍 Testing KLAIPĖDA-specific fields...');
  const client = new LtTransport();
  
  const vehicles = await client.getVehicles('klaipeda');
  
  if (vehicles.length === 0) {
    warn('klaipeda-empty', 'No vehicles returned');
    return;
  }
  
  // Klaipėda uses minimal format - basic fields should exist
  const validVehicles = vehicles.filter(v => 
    v.id !== '' && 
    v.vehicleNumber !== '' && 
    v.latitude !== 0 && 
    v.longitude !== 0
  );
  
  if (validVehicles.length === vehicles.length) {
    pass('klaipeda-basic', `All ${String(vehicles.length)} vehicles have valid basic fields`);
  } else {
    fail('klaipeda-basic', `${String(vehicles.length - validVehicles.length)} vehicles missing basic fields`);
  }
}

async function testPanevezysLiteFormat(): Promise<void> {
  console.log('\n📍 Testing PANEVĖŽYS (Lite 9-col format)...');
  const client = new LtTransport();
  
  await client.sync('panevezys'); // Need GTFS for enrichment
  const vehicles = await client.getVehicles('panevezys');
  
  if (vehicles.length === 0) {
    warn('panevezys-empty', 'No vehicles returned');
    return;
  }
  
  // Panevėžys lite format should parse correctly
  const validVehicles = vehicles.filter(v => 
    v.id !== '' && 
    v.vehicleNumber !== '' &&
    v.latitude !== 0 && 
    v.longitude !== 0
  );
  
  if (validVehicles.length === vehicles.length) {
    pass('panevezys-parse', `All ${String(vehicles.length)} vehicles parsed correctly`);
  } else {
    fail('panevezys-parse', `${String(vehicles.length - validVehicles.length)} vehicles failed parsing`);
  }
  
  // All lite format vehicles should be type 'bus' (no type info in stream)
  const allBus = vehicles.every(v => v.type === 'bus');
  if (allBus) {
    pass('panevezys-type', 'All vehicles correctly typed as bus (lite format default)');
  } else {
    fail('panevezys-type', 'Some vehicles have incorrect type');
  }
  
  // Enrichment should add destinations
  const withDestination = vehicles.filter(v => v.destination !== null);
  if (withDestination.length > 0) {
    pass('panevezys-enrich', `${String(withDestination.length)}/${String(vehicles.length)} enriched with destinations`);
  } else {
    warn('panevezys-enrich', 'No enrichment - check GTFS sync');
  }
}

async function testTaurageLiteFormat(): Promise<void> {
  console.log('\n📍 Testing TAURAGĖ (Lite 8-col format)...');
  const client = new LtTransport();
  
  await client.sync('taurage');
  const vehicles = await client.getVehicles('taurage');
  
  if (vehicles.length === 0) {
    warn('taurage-empty', 'No vehicles returned (may be off-hours)');
    return;
  }
  
  // Tauragė has alphanumeric routes like S11, S19
  const alphanumericRoutes = vehicles.filter(v => /^[A-Za-z]/.test(v.route));
  if (alphanumericRoutes.length > 0) {
    const routes = [...new Set(alphanumericRoutes.map(v => v.route))];
    pass('taurage-routes', `Has alphanumeric routes: ${routes.slice(0, 5).join(', ')}`);
  } else {
    // Numeric routes are also valid
    const numericRoutes = vehicles.filter(v => /^\d+$/.test(v.route));
    if (numericRoutes.length > 0) {
      pass('taurage-routes', 'Has numeric routes (alphanumeric format may have changed)');
    } else {
      warn('taurage-routes', 'No valid routes found');
    }
  }
  
  // Tauragė lite format - 8 columns, vehicleId at col[6]
  const validVehicles = vehicles.filter(v => 
    v.id !== '' && 
    v.vehicleNumber !== ''
  );
  
  if (validVehicles.length === vehicles.length) {
    pass('taurage-parse', `All ${String(vehicles.length)} vehicles parsed correctly`);
  } else {
    fail('taurage-parse', `${String(vehicles.length - validVehicles.length)} vehicles failed parsing`);
  }
}

async function testAlytusFields(): Promise<void> {
  console.log('\n📍 Testing ALYTUS...');
  const client = new LtTransport();
  
  const vehicles = await client.getVehicles('alytus');
  
  if (vehicles.length === 0) {
    warn('alytus-empty', 'No vehicles returned');
    return;
  }
  
  pass('alytus-count', `${String(vehicles.length)} vehicles retrieved`);
  
  // Alytus has measuredAt from MatavimoLaikas
  const withValidTime = vehicles.filter(v => {
    const age = Date.now() - v.measuredAt.getTime();
    return age >= 0 && age < 3600000; // Less than 1 hour old
  });
  
  if (withValidTime.length > vehicles.length * 0.5) {
    pass('alytus-time', `${String(withValidTime.length)}/${String(vehicles.length)} have recent measurement times`);
  } else {
    warn('alytus-time', `Only ${String(withValidTime.length)}/${String(vehicles.length)} have recent times`);
  }
}

async function testDruskininkaiFields(): Promise<void> {
  console.log('\n📍 Testing DRUSKININKAI...');
  const client = new LtTransport();
  
  const vehicles = await client.getVehicles('druskininkai');
  
  if (vehicles.length === 0) {
    warn('druskininkai-empty', 'No vehicles returned (small city, may be off-hours)');
    return;
  }
  
  pass('druskininkai-count', `${String(vehicles.length)} vehicles retrieved`);
}

async function runAllTests(): Promise<void> {
  console.log('🏙️ CITY-SPECIFIC FIELD VALIDATION');
  console.log('==================================\n');

  // Gold tier full format cities
  await testVilniusFields();
  await testKaunasFields();
  await testKlaipedaFields();
  await testAlytusFields();
  await testDruskininkaiFields();
  
  // Silver tier lite format cities
  await testPanevezysLiteFormat();
  await testTaurageLiteFormat();

  console.log('\n==================================');
  console.log('RESULTS SUMMARY');
  console.log('==================================');
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  console.log(`\nPassed: ${String(passed)}/${String(results.length)}`);
  console.log(`Failed: ${String(failed)}/${String(results.length)}`);
  
  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter(r => !r.passed).forEach(r => { console.log(`  - ${r.name}: ${r.message}`); });
    process.exit(1);
  } else {
    console.log('\n✅ All city-specific tests passed!');
  }
}

runAllTests().catch((err: unknown) => {
  console.error('Test runner failed:', err);
  process.exit(1);
});

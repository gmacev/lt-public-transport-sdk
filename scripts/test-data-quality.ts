import { LtTransport } from '../dist/index.js';
import { ALL_CITY_IDS, CITY_CONFIGS } from '../dist/config.js';
import type { Vehicle, VehicleType, CityId } from '../dist/types.js';

/**
 * Test Script: Data Quality Validation
 * 
 * Validates data integrity across all cities:
 * - Coordinate bounds (within Lithuania)
 * - Vehicle type correctness
 * - Required fields presence
 * - Measurement time sanity
 * - Route/destination text quality (no mojibake)
 */

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

interface DataIssue {
  city: CityId;
  vehicleId: string;
  field: string;
  value: string;
  issue: string;
}

const results: TestResult[] = [];
const issues: DataIssue[] = [];

// Lithuania bounding box
const LT_BOUNDS = {
  minLat: 53.5,
  maxLat: 56.5,
  minLon: 20.5,
  maxLon: 27.0,
};

// Valid vehicle types
const VALID_TYPES: VehicleType[] = ['bus', 'trolleybus', 'ferry', 'unknown'];

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

function addIssue(city: CityId, vehicle: Vehicle, field: string, value: string, issue: string): void {
  issues.push({ city, vehicleId: vehicle.id, field, value, issue });
}

function validateCoordinates(city: CityId, vehicles: Vehicle[]): void {
  let outOfBounds = 0;
  let zeroCoords = 0;
  
  for (const v of vehicles) {
    if (v.latitude === 0 && v.longitude === 0) {
      zeroCoords++;
      addIssue(city, v, 'coordinates', `${String(v.latitude)},${String(v.longitude)}`, 'Zero coordinates');
    } else if (
      v.latitude < LT_BOUNDS.minLat || v.latitude > LT_BOUNDS.maxLat ||
      v.longitude < LT_BOUNDS.minLon || v.longitude > LT_BOUNDS.maxLon
    ) {
      outOfBounds++;
      addIssue(city, v, 'coordinates', `${String(v.latitude)},${String(v.longitude)}`, 'Outside Lithuania bounds');
    }
  }
  
  if (outOfBounds === 0 && zeroCoords === 0) {
    pass(`${city}-coords`, `All ${String(vehicles.length)} vehicles have valid coordinates`);
  } else {
    warn(`${city}-coords`, `${String(outOfBounds)} out of bounds, ${String(zeroCoords)} zero coords (of ${String(vehicles.length)})`);
  }
}

function validateVehicleTypes(city: CityId, vehicles: Vehicle[]): void {
  let invalidTypes = 0;
  
  for (const v of vehicles) {
    if (!VALID_TYPES.includes(v.type)) {
      invalidTypes++;
      addIssue(city, v, 'type', v.type, 'Invalid vehicle type');
    }
  }
  
  if (invalidTypes === 0) {
    pass(`${city}-types`, `All vehicle types are valid`);
  } else {
    fail(`${city}-types`, `${String(invalidTypes)} vehicles have invalid types`);
  }
}

function validateRequiredFields(city: CityId, vehicles: Vehicle[]): void {
  let missingFields = 0;
  
  for (const v of vehicles) {
    if (!v.id || v.id === '') {
      missingFields++;
      addIssue(city, v, 'id', v.id, 'Missing ID');
    }
    if (!v.vehicleNumber || v.vehicleNumber === '') {
      missingFields++;
      addIssue(city, v, 'vehicleNumber', v.vehicleNumber, 'Missing vehicle number');
    }
    // Route is always defined in Vehicle interface, but check for empty string
    if (v.route === '') {
      // Route can be empty for some cities, this is just informational
    }
  }
  
  if (missingFields === 0) {
    pass(`${city}-fields`, `All required fields present`);
  } else {
    fail(`${city}-fields`, `${String(missingFields)} missing required fields`);
  }
}

function validateMeasurementTime(city: CityId, vehicles: Vehicle[]): void {
  const now = Date.now();
  const oneDayAgo = now - 86400000;
  let futureTime = 0;
  let veryOld = 0;
  let invalidDate = 0;
  
  for (const v of vehicles) {
    const time = v.measuredAt.getTime();
    
    if (isNaN(time)) {
      invalidDate++;
      addIssue(city, v, 'measuredAt', String(v.measuredAt), 'Invalid date');
    } else if (time > now + 300000) { // More than 5 min in future
      futureTime++;
      addIssue(city, v, 'measuredAt', v.measuredAt.toISOString(), 'Future timestamp');
    } else if (time < oneDayAgo) {
      veryOld++;
      addIssue(city, v, 'measuredAt', v.measuredAt.toISOString(), 'More than 24h old');
    }
  }
  
  if (invalidDate === 0 && futureTime === 0 && veryOld === 0) {
    pass(`${city}-time`, `All measurement times are valid`);
  } else {
    warn(`${city}-time`, `${String(futureTime)} future, ${String(veryOld)} old, ${String(invalidDate)} invalid`);
  }
}

function validateTextQuality(city: CityId, vehicles: Vehicle[]): void {
  // Common mojibake patterns
  const mojibakePatterns = [
    /Ã¤|Ã¶|Ã¼|Ã©|Ã¨|Ã /,  // UTF-8 decoded as Latin-1
    /ï¿½/,                     // Replacement character
    // eslint-disable-next-line no-control-regex
    /[\x00-\x1F]/,             // Control characters
  ];
  
  let mojibakeCount = 0;
  
  for (const v of vehicles) {
    const textsToCheck: string[] = [v.route, v.vehicleNumber];
    if (v.destination !== null) {
      textsToCheck.push(v.destination);
    }
    
    for (const text of textsToCheck) {
      for (const pattern of mojibakePatterns) {
        if (pattern.test(text)) {
          mojibakeCount++;
          addIssue(city, v, 'text', text, 'Possible mojibake/encoding issue');
          break;
        }
      }
    }
  }
  
  if (mojibakeCount === 0) {
    pass(`${city}-text`, `No encoding issues detected`);
  } else {
    fail(`${city}-text`, `${String(mojibakeCount)} texts with encoding issues`);
  }
}

async function runAllTests(): Promise<void> {
  console.log('🔍 DATA QUALITY VALIDATION');
  console.log('==========================\n');
  
  const client = new LtTransport({
    filterInvalidCoords: false,  // We want to see invalid coords
    filterStale: false,          // We want to see stale data
  });
  
  for (const city of ALL_CITY_IDS) {
    if (!CITY_CONFIGS[city].gps.enabled) {
      console.log(`\n⏭️ Skipping ${city} (GPS disabled)`);
      continue;
    }
    
    console.log(`\n📍 Validating ${city.toUpperCase()}...`);
    
    try {
      const vehicles = await client.getVehicles(city);
      
      if (vehicles.length === 0) {
        warn(`${city}-empty`, 'No vehicles returned');
        continue;
      }
      
      console.log(`   Found ${String(vehicles.length)} vehicles`);
      
      validateCoordinates(city, vehicles);
      validateVehicleTypes(city, vehicles);
      validateRequiredFields(city, vehicles);
      validateMeasurementTime(city, vehicles);
      validateTextQuality(city, vehicles);
      
    } catch (err: unknown) {
      fail(`${city}-fetch`, `Failed to fetch: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log('\n==========================');
  console.log('RESULTS SUMMARY');
  console.log('==========================');
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  console.log(`\nPassed: ${String(passed)}/${String(results.length)}`);
  console.log(`Failed: ${String(failed)}/${String(results.length)}`);
  
  if (issues.length > 0) {
    console.log(`\nTotal issues found: ${String(issues.length)}`);
    console.log('Sample issues (first 10):');
    issues.slice(0, 10).forEach(i => {
      console.log(`  - [${i.city}] ${i.vehicleId}: ${i.field} = "${i.value}" (${i.issue})`);
    });
  }
  
  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter(r => !r.passed).forEach(r => { console.log(`  - ${r.name}: ${r.message}`); });
    process.exit(1);
  } else {
    console.log('\n✅ All data quality tests passed!');
  }
}

runAllTests().catch((err: unknown) => {
  console.error('Test runner failed:', err);
  process.exit(1);
});

import { LtTransport } from '../dist/index.js';
import { rmSync } from 'node:fs';

/**
 * Test Script: GTFS Features
 * 
 * Verifies the new GTFS expansion features by syncing a small city
 * and querying all new data endpoints.
 */

const CACHE_DIR = './.cache-test-gtfs';

async function main() {
  console.log('🚍 GTFS FEATURES TEST');
  console.log('====================\n');

  // Use Druskininkai (small dataset) for fast testing
  const city = 'druskininkai';
  
  const client = new LtTransport({
    // Use a temp cache dir to ensure fresh sync
    cacheDir: CACHE_DIR,
  });

  console.log(`📦 Syncing ${city}...`);
  const syncResult = await client.sync(city);
  console.log(`   Sync status: ${syncResult.status}`);
  console.log(`   Routes: ${syncResult.routeCount}`);
  console.log(`   Stops: ${syncResult.stopCount}`);
  console.log(`   Detailed info available in meta.json`);

  // 1. Trips
  console.log('\n1️⃣  Testing getTrips()...');
  const trips = await client.getTrips(city);
  console.log(`   Found ${trips.length} trips`);
  if (trips.length > 0) {
    console.log(`   Sample trip: ${JSON.stringify(trips[0], null, 2)}`);
  }

  // 2. Shapes
  console.log('\n2️⃣  Testing getShapes()...');
  const shapes = await client.getShapes(city);
  console.log(`   Found ${shapes.size} shapes`);
  if (shapes.size > 0 && trips.length > 0) {
    const shapeId = trips[0].shapeId;
    if (shapeId && shapes.has(shapeId)) {
      const shape = shapes.get(shapeId);
      console.log(`   Points in shape ${shapeId}: ${shape?.length}`);
    } else {
      console.log('   (Could not find shape for first trip)');
    }
  }

  // 3. Calendar
  console.log('\n3️⃣  Testing getCalendar()...');
  const calendar = await client.getCalendar(city);
  console.log(`   Found ${calendar.length} calendar entries`);
  if (calendar.length > 0) {
    console.log(`   Sample: ${calendar[0].serviceId} (Mon: ${calendar[0].monday})`);
  }

  // 4. Calendar Dates
  console.log('\n4️⃣  Testing getCalendarDates()...');
  const dates = await client.getCalendarDates(city);
  console.log(`   Found ${dates.length} calendar exceptions`);
  if (dates.length > 0) {
    console.log(`   Sample: ${dates[0].date} (${dates[0].exceptionType})`);
  }

  // 5. Agencies
  console.log('\n5️⃣  Testing getAgencies()...');
  const agencies = await client.getAgencies(city);
  console.log(`   Found ${agencies.length} agencies`);
  if (agencies.length > 0) {
    console.log(`   Agency: ${agencies[0].name} (${agencies[0].url})`);
  }

  // 6. Schedule (Stop Times)
  console.log('\n6️⃣  Testing getSchedule()...');
  const schedule = await client.getSchedule(city);
  console.log(`   Found stop times for ${schedule.size} trips`);
  if (trips.length > 0) {
    const tripId = trips[0].id;
    const times = schedule.get(tripId);
    if (times) {
      console.log(`   Trip ${tripId} has ${times.length} stops`);
      console.log(`   First stop: ${times[0].stopId} @ ${times[0].departureTime}`);
      console.log(`   Last stop: ${times[times.length - 1].stopId} @ ${times[times.length - 1].arrivalTime}`);
    } else {
      console.log(`   (No stop times found for trip ${tripId})`);
    }
  }

  console.log('\n✅ Test Complete');
}

main()
  .catch(err => {
    console.error('❌ Test Failed:', err);
    process.exit(1);
  })
  .finally(() => {
    // Cleanup test cache folder
    try {
      rmSync(CACHE_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });


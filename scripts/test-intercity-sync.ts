import { LtTransport } from '../src/index.js';

async function main() {
  const transport = new LtTransport();
  
  console.log('Syncing intercity data...');
  const result = await transport.sync('intercity');
  console.log('Sync result:', result);
  
  const routes = await transport.getRoutes('intercity');
  console.log(`Loaded ${routes.length} routes`);
  console.log('Sample routes:', routes.slice(0, 3).map(r => `${r.shortName}: ${r.longName}`));
  
  const stops = await transport.getStops('intercity');
  console.log(`Loaded ${stops.length} stops`);
  const stopsWithUrl = stops.filter(s => s.url !== null);
  console.log(`Stops with URL: ${stopsWithUrl.length}`);
  if (stopsWithUrl[0]) {
    console.log('Sample stop with URL:', stopsWithUrl[0]);
  }
  
  // Verify GPS throws error
  try {
    await transport.getVehicles('intercity');
    console.log('ERROR: Should have thrown GpsNotAvailableError');
  } catch (err) {
    console.log('GPS correctly throws:', (err as Error).name);
  }
}

main().catch(console.error);

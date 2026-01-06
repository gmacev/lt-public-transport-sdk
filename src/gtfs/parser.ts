/**
 * GTFS file parsers for routes.txt and stops.txt
 * @module gtfs/parser
 */

import type { Route, Stop, VehicleType } from '../types.js';
import { GTFS_ROUTE_TYPE_MAP } from '../types.js';
import { cleanTextField } from '../utils/index.js';
import { gtfsRouteSchema, gtfsStopSchema } from '../schemas.js';

// =============================================================================
// CSV Parsing Utilities
// =============================================================================

/**
 * Parse a CSV line handling quoted fields.
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else if (char !== undefined) {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}

/**
 * Build a header-to-index map from CSV header row.
 */
function buildHeaderMap(headers: string[]): Map<string, number> {
  const map = new Map<string, number>();
  headers.forEach((header, index) => {
    map.set(header.trim(), index);
  });
  return map;
}

/**
 * Build a key-value object from a row using header map.
 */
function buildRowObject(row: string[], headerMap: Map<string, number>): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const [header, index] of headerMap.entries()) {
    if (index < row.length) {
      obj[header] = row[index]?.trim() ?? '';
    }
  }
  return obj;
}

// =============================================================================
// Routes Parser
// =============================================================================

/**
 * Parse routes.txt content into a Map keyed by route short name.
 * 
 * GTFS routes.txt fields:
 * - route_id: Unique identifier
 * - agency_id: Agency reference
 * - route_short_name: Short name (e.g., "4G", "N1")
 * - route_long_name: Full name with endpoints
 * - route_desc: Description
 * - route_type: GTFS route type (3=bus, 800=trolleybus)
 * - route_url: URL
 * - route_color: Background color (hex)
 * - route_text_color: Text color (hex)
 * 
 * @param content - Raw routes.txt content
 * @returns Map from route short name to Route object
 */
export function parseRoutesContent(content: string): Map<string, Route> {
  const lines = content.split('\n').filter(line => line.trim());
  
  if (lines.length < 2) {
    return new Map();
  }

  const firstLine = lines[0];
  if (firstLine === undefined || firstLine === '') {
    return new Map();
  }
  const headers = parseCSVLine(firstLine);
  const headerMap = buildHeaderMap(headers);

  const routes = new Map<string, Route>();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined || line === '') continue;
    const row = parseCSVLine(line);
    
    try {
      // Build object from row for Zod validation
      const rowObject = buildRowObject(row, headerMap);
      const parseResult = gtfsRouteSchema.safeParse(rowObject);
      
      if (!parseResult.success) {
        continue;
      }
      
      const validated = parseResult.data;
      const type: VehicleType = GTFS_ROUTE_TYPE_MAP[validated.route_type] ?? 'unknown';

      const routeObj: Route = {
        id: validated.route_id,
        shortName: cleanTextField(validated.route_short_name),
        longName: cleanTextField(validated.route_long_name),
        type,
        color: validated.route_color.replace('#', ''),
        textColor: validated.route_text_color.replace('#', ''),
      };

      // Key by short name for fast lookup from GPS data
      routes.set(routeObj.shortName, routeObj);
      
      // Also key by route_id for GTFS trip references
      routes.set(routeObj.id, routeObj);
    } catch {
      // Skip malformed rows
      continue;
    }
  }

  return routes;
}

// =============================================================================
// Stops Parser
// =============================================================================

/**
 * Parse stops.txt content into an array of Stop objects.
 * 
 * GTFS stops.txt fields:
 * - stop_id: Unique identifier
 * - stop_code: Short code
 * - stop_name: Human-readable name
 * - stop_desc: Description
 * - stop_lat: Latitude
 * - stop_lon: Longitude
 * 
 * @param content - Raw stops.txt content
 * @returns Array of Stop objects
 */
export function parseStopsContent(content: string): Stop[] {
  const lines = content.split('\n').filter(line => line.trim());
  
  if (lines.length < 2) {
    return [];
  }

  const firstLine = lines[0];
  if (firstLine === undefined || firstLine === '') {
    return [];
  }
  const headers = parseCSVLine(firstLine);
  const headerMap = buildHeaderMap(headers);

  const stops: Stop[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined || line === '') continue;
    const row = parseCSVLine(line);
    
    try {
      // Build object from row for Zod validation
      const rowObject = buildRowObject(row, headerMap);
      const parseResult = gtfsStopSchema.safeParse(rowObject);
      
      if (!parseResult.success) {
        continue;
      }
      
      const validated = parseResult.data;

      stops.push({
        id: validated.stop_id,
        code: validated.stop_code ?? null,
        name: cleanTextField(validated.stop_name),
        description: validated.stop_desc !== undefined && validated.stop_desc !== '' 
          ? cleanTextField(validated.stop_desc) 
          : null,
        latitude: validated.stop_lat,
        longitude: validated.stop_lon,
      });
    } catch {
      // Skip malformed rows
      continue;
    }
  }

  return stops;
}

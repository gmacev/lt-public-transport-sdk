/**
 * GTFS file parsers for routes.txt, stops.txt, trips.txt, shapes.txt, 
 * calendar.txt, calendar_dates.txt, agency.txt, and stop_times.txt
 * @module gtfs/parser
 */

import type { Route, Stop, Trip, ShapePoint, Calendar, CalendarDate, Agency, StopTime, VehicleType } from '../types.js';
import { GTFS_ROUTE_TYPE_MAP } from '../types.js';
import { cleanTextField } from '../utils/index.js';
import { 
  gtfsRouteSchema, 
  gtfsStopSchema,
  gtfsTripSchema,
  gtfsShapeSchema,
  gtfsCalendarSchema,
  gtfsCalendarDateSchema,
  gtfsAgencySchema,
  gtfsStopTimeSchema,
} from '../schemas.js';

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

// =============================================================================
// Trips Parser
// =============================================================================

/**
 * Parse trips.txt content into a Map keyed by trip_id.
 * 
 * @param content - Raw trips.txt content
 * @returns Map from trip_id to Trip object
 */
export function parseTripsContent(content: string): Map<string, Trip> {
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

  const trips = new Map<string, Trip>();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined || line === '') continue;
    const row = parseCSVLine(line);
    
    try {
      const rowObject = buildRowObject(row, headerMap);
      const parseResult = gtfsTripSchema.safeParse(rowObject);
      
      if (!parseResult.success) {
        continue;
      }
      
      const validated = parseResult.data;

      const trip: Trip = {
        id: validated.trip_id,
        routeId: validated.route_id,
        serviceId: validated.service_id,
        headsign: cleanTextField(validated.trip_headsign),
        directionId: validated.direction_id ?? null,
        shapeId: validated.shape_id ?? null,
        blockId: validated.block_id ?? null,
      };

      trips.set(trip.id, trip);
    } catch {
      continue;
    }
  }

  return trips;
}

// =============================================================================
// Shapes Parser
// =============================================================================

/**
 * Parse shapes.txt content into a Map grouped by shape_id.
 * Points within each shape are sorted by sequence.
 * 
 * @param content - Raw shapes.txt content
 * @returns Map from shape_id to array of ShapePoint objects
 */
export function parseShapesContent(content: string): Map<string, ShapePoint[]> {
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

  const shapes = new Map<string, ShapePoint[]>();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined || line === '') continue;
    const row = parseCSVLine(line);
    
    try {
      const rowObject = buildRowObject(row, headerMap);
      const parseResult = gtfsShapeSchema.safeParse(rowObject);
      
      if (!parseResult.success) {
        continue;
      }
      
      const validated = parseResult.data;

      const point: ShapePoint = {
        shapeId: validated.shape_id,
        latitude: validated.shape_pt_lat,
        longitude: validated.shape_pt_lon,
        sequence: validated.shape_pt_sequence,
        distanceTraveled: validated.shape_dist_traveled ?? null,
      };

      const existing = shapes.get(point.shapeId);
      if (existing !== undefined) {
        existing.push(point);
      } else {
        shapes.set(point.shapeId, [point]);
      }
    } catch {
      continue;
    }
  }

  // Sort points within each shape by sequence
  for (const points of shapes.values()) {
    points.sort((a, b) => a.sequence - b.sequence);
  }

  return shapes;
}

// =============================================================================
// Calendar Parser
// =============================================================================

/**
 * Helper to parse GTFS date format (YYYYMMDD) to ISO format (YYYY-MM-DD).
 */
function parseGtfsDate(dateStr: string): string {
  if (dateStr.length !== 8) return dateStr;
  return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
}

/**
 * Parse calendar.txt content into a Map keyed by service_id.
 * 
 * @param content - Raw calendar.txt content
 * @returns Map from service_id to Calendar object
 */
export function parseCalendarContent(content: string): Map<string, Calendar> {
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

  const calendars = new Map<string, Calendar>();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined || line === '') continue;
    const row = parseCSVLine(line);
    
    try {
      const rowObject = buildRowObject(row, headerMap);
      const parseResult = gtfsCalendarSchema.safeParse(rowObject);
      
      if (!parseResult.success) {
        continue;
      }
      
      const validated = parseResult.data;

      const calendar: Calendar = {
        serviceId: validated.service_id,
        monday: validated.monday === 1,
        tuesday: validated.tuesday === 1,
        wednesday: validated.wednesday === 1,
        thursday: validated.thursday === 1,
        friday: validated.friday === 1,
        saturday: validated.saturday === 1,
        sunday: validated.sunday === 1,
        startDate: parseGtfsDate(validated.start_date),
        endDate: parseGtfsDate(validated.end_date),
      };

      calendars.set(calendar.serviceId, calendar);
    } catch {
      continue;
    }
  }

  return calendars;
}

// =============================================================================
// Calendar Dates Parser
// =============================================================================

/**
 * Parse calendar_dates.txt content into an array of CalendarDate objects.
 * 
 * @param content - Raw calendar_dates.txt content
 * @returns Array of CalendarDate objects
 */
export function parseCalendarDatesContent(content: string): CalendarDate[] {
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

  const calendarDates: CalendarDate[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined || line === '') continue;
    const row = parseCSVLine(line);
    
    try {
      const rowObject = buildRowObject(row, headerMap);
      const parseResult = gtfsCalendarDateSchema.safeParse(rowObject);
      
      if (!parseResult.success) {
        continue;
      }
      
      const validated = parseResult.data;

      calendarDates.push({
        serviceId: validated.service_id,
        date: parseGtfsDate(validated.date),
        exceptionType: validated.exception_type === 1 ? 'added' : 'removed',
      });
    } catch {
      continue;
    }
  }

  return calendarDates;
}

// =============================================================================
// Agency Parser
// =============================================================================

/**
 * Parse agency.txt content into an array of Agency objects.
 * 
 * @param content - Raw agency.txt content
 * @returns Array of Agency objects
 */
export function parseAgencyContent(content: string): Agency[] {
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

  const agencies: Agency[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined || line === '') continue;
    const row = parseCSVLine(line);
    
    try {
      const rowObject = buildRowObject(row, headerMap);
      const parseResult = gtfsAgencySchema.safeParse(rowObject);
      
      if (!parseResult.success) {
        continue;
      }
      
      const validated = parseResult.data;

      agencies.push({
        id: validated.agency_id ?? '',
        name: cleanTextField(validated.agency_name),
        url: validated.agency_url,
        timezone: validated.agency_timezone,
        language: validated.agency_lang ?? null,
        phone: validated.agency_phone ?? null,
      });
    } catch {
      continue;
    }
  }

  return agencies;
}

// =============================================================================
// Stop Times Parser
// =============================================================================

/**
 * Parse stop_times.txt content into a Map grouped by trip_id.
 * Stop times within each trip are sorted by sequence.
 * 
 * Note: This file can be large (~25MB for Vilnius). Use appropriate memory management.
 * 
 * @param content - Raw stop_times.txt content
 * @returns Map from trip_id to array of StopTime objects
 */
export function parseStopTimesContent(content: string): Map<string, StopTime[]> {
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

  const stopTimes = new Map<string, StopTime[]>();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined || line === '') continue;
    const row = parseCSVLine(line);
    
    try {
      const rowObject = buildRowObject(row, headerMap);
      const parseResult = gtfsStopTimeSchema.safeParse(rowObject);
      
      if (!parseResult.success) {
        continue;
      }
      
      const validated = parseResult.data;

      const stopTime: StopTime = {
        tripId: validated.trip_id,
        stopId: validated.stop_id,
        arrivalTime: validated.arrival_time,
        departureTime: validated.departure_time,
        sequence: validated.stop_sequence,
        headsign: validated.stop_headsign ?? null,
      };

      const existing = stopTimes.get(stopTime.tripId);
      if (existing !== undefined) {
        existing.push(stopTime);
      } else {
        stopTimes.set(stopTime.tripId, [stopTime]);
      }
    } catch {
      continue;
    }
  }

  // Sort stop times within each trip by sequence
  for (const times of stopTimes.values()) {
    times.sort((a, b) => a.sequence - b.sequence);
  }

  return stopTimes;
}


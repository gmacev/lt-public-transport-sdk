/**
 * Extended GTFS Parser Unit Tests
 * 
 * Tests parsing of trips.txt, shapes.txt, calendar.txt, calendar_dates.txt,
 * agency.txt, and stop_times.txt files from GTFS archives.
 */

import { describe, it, expect } from 'vitest';
import {
  parseTripsContent,
  parseShapesContent,
  parseCalendarContent,
  parseCalendarDatesContent,
  parseAgencyContent,
  parseStopTimesContent,
} from '../gtfs/parser.js';

// =============================================================================
// Fixtures: trips.txt
// =============================================================================

const TRIPS_HEADER = 'route_id,service_id,trip_id,trip_headsign,trip_short_name,direction_id,block_id,shape_id';

const TRIP_1 = 'route_1,weekday,trip_001,Centras,T1,0,block_1,shape_1';
const TRIP_2 = 'route_1,weekend,trip_002,Pilaitė,T2,1,block_1,shape_2';

const TRIPS_TXT_VALID = `${TRIPS_HEADER}
${TRIP_1}
${TRIP_2}`;

// =============================================================================
// Fixtures: shapes.txt
// =============================================================================

const SHAPES_HEADER = 'shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence,shape_dist_traveled';

const SHAPE_PT_1 = 'shape_1,54.6872,25.2797,0,0.0';
const SHAPE_PT_2 = 'shape_1,54.6880,25.2810,1,150.5';
const SHAPE_PT_3 = 'shape_2,54.7000,25.2900,0,0.0';

const SHAPES_TXT_VALID = `${SHAPES_HEADER}
${SHAPE_PT_1}
${SHAPE_PT_2}
${SHAPE_PT_3}`;

// =============================================================================
// Fixtures: calendar.txt
// =============================================================================

const CALENDAR_HEADER = 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date';

const CAL_WEEKDAY = 'weekday,1,1,1,1,1,0,0,20240101,20241231';
const CAL_WEEKEND = 'weekend,0,0,0,0,0,1,1,20240101,20241231';

const CALENDAR_TXT_VALID = `${CALENDAR_HEADER}
${CAL_WEEKDAY}
${CAL_WEEKEND}`;

// =============================================================================
// Fixtures: calendar_dates.txt
// =============================================================================

const CALENDAR_DATES_HEADER = 'service_id,date,exception_type';

const CAL_DATE_ADDED = 'weekday,20240501,1';
const CAL_DATE_REMOVED = 'weekday,20241225,2';

const CALENDAR_DATES_TXT_VALID = `${CALENDAR_DATES_HEADER}
${CAL_DATE_ADDED}
${CAL_DATE_REMOVED}`;

// =============================================================================
// Fixtures: agency.txt
// =============================================================================

const AGENCY_HEADER = 'agency_id,agency_name,agency_url,agency_timezone,agency_lang,agency_phone';

const AGENCY_ROW = 'agency_1,Vilnius Transport,https://villim.lt,Europe/Vilnius,lt,+370-5-1234567';

const AGENCY_TXT_VALID = `${AGENCY_HEADER}
${AGENCY_ROW}`;

// =============================================================================
// Fixtures: stop_times.txt
// =============================================================================

const STOP_TIMES_HEADER = 'trip_id,arrival_time,departure_time,stop_id,stop_sequence,stop_headsign,pickup_type,drop_off_type';

const ST_1 = 'trip_001,06:00:00,06:00:00,stop_1,0,,0,0';
const ST_2 = 'trip_001,06:05:00,06:06:00,stop_2,1,,0,0';
const ST_3 = 'trip_001,06:15:00,06:15:00,stop_3,2,,0,0';

const STOP_TIMES_TXT_VALID = `${STOP_TIMES_HEADER}
${ST_1}
${ST_2}
${ST_3}`;

// =============================================================================
// Trips Parser Tests
// =============================================================================

describe('parseTripsContent', () => {
  it('should parse valid trips.txt content', () => {
    const trips = parseTripsContent(TRIPS_TXT_VALID);
    expect(trips.size).toBe(2);
  });

  it('should extract trip data correctly', () => {
    const trips = parseTripsContent(TRIPS_TXT_VALID);
    const trip = trips.get('trip_001');
    
    expect(trip).toBeDefined();
    expect(trip!.id).toBe('trip_001');
    expect(trip!.routeId).toBe('route_1');
    expect(trip!.serviceId).toBe('weekday');
    expect(trip!.headsign).toBe('Centras');
    expect(trip!.directionId).toBe(0);
    expect(trip!.shapeId).toBe('shape_1');
  });

  it('should return empty map for empty content', () => {
    const trips = parseTripsContent('');
    expect(trips.size).toBe(0);
  });
});

// =============================================================================
// Shapes Parser Tests
// =============================================================================

describe('parseShapesContent', () => {
  it('should parse valid shapes.txt content', () => {
    const shapes = parseShapesContent(SHAPES_TXT_VALID);
    expect(shapes.size).toBe(2); // 2 unique shape_ids
  });

  it('should group points by shape_id', () => {
    const shapes = parseShapesContent(SHAPES_TXT_VALID);
    const shape1 = shapes.get('shape_1');
    const shape2 = shapes.get('shape_2');
    
    expect(shape1).toBeDefined();
    expect(shape1!.length).toBe(2);
    expect(shape2!.length).toBe(1);
  });

  it('should sort points by sequence', () => {
    const shapes = parseShapesContent(SHAPES_TXT_VALID);
    const shape1 = shapes.get('shape_1');
    
    expect(shape1![0]!.sequence).toBe(0);
    expect(shape1![1]!.sequence).toBe(1);
  });

  it('should extract coordinates correctly', () => {
    const shapes = parseShapesContent(SHAPES_TXT_VALID);
    const shape1 = shapes.get('shape_1');
    
    expect(shape1![0]!.latitude).toBeCloseTo(54.6872, 4);
    expect(shape1![0]!.longitude).toBeCloseTo(25.2797, 4);
  });

  it('should return empty map for empty content', () => {
    const shapes = parseShapesContent('');
    expect(shapes.size).toBe(0);
  });
});

// =============================================================================
// Calendar Parser Tests
// =============================================================================

describe('parseCalendarContent', () => {
  it('should parse valid calendar.txt content', () => {
    const calendar = parseCalendarContent(CALENDAR_TXT_VALID);
    expect(calendar.size).toBe(2);
  });

  it('should extract calendar data correctly', () => {
    const calendar = parseCalendarContent(CALENDAR_TXT_VALID);
    const weekday = calendar.get('weekday');
    
    expect(weekday).toBeDefined();
    expect(weekday!.monday).toBe(true);
    expect(weekday!.saturday).toBe(false);
    expect(weekday!.startDate).toBe('2024-01-01');
    expect(weekday!.endDate).toBe('2024-12-31');
  });

  it('should convert dates to ISO format', () => {
    const calendar = parseCalendarContent(CALENDAR_TXT_VALID);
    const weekday = calendar.get('weekday');
    
    expect(weekday!.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('should return empty map for empty content', () => {
    const calendar = parseCalendarContent('');
    expect(calendar.size).toBe(0);
  });
});

// =============================================================================
// Calendar Dates Parser Tests
// =============================================================================

describe('parseCalendarDatesContent', () => {
  it('should parse valid calendar_dates.txt content', () => {
    const dates = parseCalendarDatesContent(CALENDAR_DATES_TXT_VALID);
    expect(dates.length).toBe(2);
  });

  it('should extract exception type correctly', () => {
    const dates = parseCalendarDatesContent(CALENDAR_DATES_TXT_VALID);
    
    expect(dates[0]!.exceptionType).toBe('added');
    expect(dates[1]!.exceptionType).toBe('removed');
  });

  it('should convert dates to ISO format', () => {
    const dates = parseCalendarDatesContent(CALENDAR_DATES_TXT_VALID);
    
    expect(dates[0]!.date).toBe('2024-05-01');
    expect(dates[1]!.date).toBe('2024-12-25');
  });

  it('should return empty array for empty content', () => {
    const dates = parseCalendarDatesContent('');
    expect(dates).toEqual([]);
  });
});

// =============================================================================
// Agency Parser Tests
// =============================================================================

describe('parseAgencyContent', () => {
  it('should parse valid agency.txt content', () => {
    const agencies = parseAgencyContent(AGENCY_TXT_VALID);
    expect(agencies.length).toBe(1);
  });

  it('should extract agency data correctly', () => {
    const agencies = parseAgencyContent(AGENCY_TXT_VALID);
    const agency = agencies[0];
    
    expect(agency).toBeDefined();
    expect(agency!.name).toBe('Vilnius Transport');
    expect(agency!.url).toBe('https://villim.lt');
    expect(agency!.timezone).toBe('Europe/Vilnius');
    expect(agency!.language).toBe('lt');
    expect(agency!.phone).toBe('+370-5-1234567');
  });

  it('should return empty array for empty content', () => {
    const agencies = parseAgencyContent('');
    expect(agencies).toEqual([]);
  });
});

// =============================================================================
// Stop Times Parser Tests
// =============================================================================

describe('parseStopTimesContent', () => {
  it('should parse valid stop_times.txt content', () => {
    const stopTimes = parseStopTimesContent(STOP_TIMES_TXT_VALID);
    expect(stopTimes.size).toBe(1); // 1 trip
  });

  it('should group stop times by trip_id', () => {
    const stopTimes = parseStopTimesContent(STOP_TIMES_TXT_VALID);
    const times = stopTimes.get('trip_001');
    
    expect(times).toBeDefined();
    expect(times!.length).toBe(3);
  });

  it('should sort stop times by sequence', () => {
    const stopTimes = parseStopTimesContent(STOP_TIMES_TXT_VALID);
    const times = stopTimes.get('trip_001');
    
    expect(times![0]!.sequence).toBe(0);
    expect(times![1]!.sequence).toBe(1);
    expect(times![2]!.sequence).toBe(2);
  });

  it('should extract time data correctly', () => {
    const stopTimes = parseStopTimesContent(STOP_TIMES_TXT_VALID);
    const times = stopTimes.get('trip_001');
    
    expect(times![0]!.stopId).toBe('stop_1');
    expect(times![0]!.arrivalTime).toBe('06:00:00');
    expect(times![0]!.departureTime).toBe('06:00:00');
  });

  it('should return empty map for empty content', () => {
    const stopTimes = parseStopTimesContent('');
    expect(stopTimes.size).toBe(0);
  });
});

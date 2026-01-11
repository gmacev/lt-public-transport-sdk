/**
 * Core type definitions for Lithuanian Public Transport SDK
 * @module types
 */

// Import and re-export city types from config to avoid duplication
import type { CityId } from './config.js';
export type { CityId, CityTier } from './config.js';

// =============================================================================
// Vehicle Types
// =============================================================================

/**
 * Vehicle types from Lithuanian public transport.
 * - bus: Standard city buses (GTFS route_type 3)
 * - trolleybus: Electric trolleybuses (GTFS route_type 800)
 * - ferry: Water transport / boats (GTFS route_type 4 or 1200) - seasonal in Vilnius
 * - unknown: Unrecognized vehicle type
 */
export type VehicleType = 'bus' | 'trolleybus' | 'ferry' | 'unknown';

/**
 * GTFS route_type to VehicleType mapping.
 * Uses both standard and extended GTFS route types.
 */
export const GTFS_ROUTE_TYPE_MAP: Readonly<Record<number, VehicleType>> = {
  3: 'bus',         // Standard GTFS: Bus
  800: 'trolleybus', // Extended GTFS: Trolleybus
  4: 'ferry',       // Standard GTFS: Ferry
  1200: 'ferry',    // Extended GTFS: Ferry Service
} as const;

/**
 * Lithuanian transport type names to VehicleType mapping.
 * Used when parsing GPS data streams.
 */
export const LT_TRANSPORT_TYPE_MAP: Readonly<Record<string, VehicleType>> = {
  'Autobusai': 'bus',
  'Troleibusai': 'trolleybus',
  'Laivai': 'ferry',
  'Keltai': 'ferry',
  // English values found in v2 data (e.g. Tauragė)
  'Bus': 'bus',
  'Trolleybus': 'trolleybus',
  'Ferry': 'ferry',
} as const;

// =============================================================================
// Vehicle Interface
// =============================================================================

/**
 * Normalized vehicle object representing a single public transport vehicle.
 * This interface is consistent across all cities regardless of data source format.
 */
export interface Vehicle {
  /** Unique identifier for this vehicle tracking record */
  readonly id: string;

  /** Vehicle number/code as displayed on the vehicle */
  readonly vehicleNumber: string;

  /** Route identifier (e.g., "4G", "N1", "S11") - always a string */
  readonly route: string;

  /** Type of vehicle */
  readonly type: VehicleType;

  /** Latitude in WGS84 decimal degrees */
  readonly latitude: number;

  /** Longitude in WGS84 decimal degrees */
  readonly longitude: number;

  /** Heading/bearing in degrees (0-359, 0 = North) */
  readonly bearing: number;

  /** Current speed in km/h */
  readonly speed: number;

  /** Destination/terminus name, if available */
  readonly destination: string | null;

  /** Delay in seconds (positive = late, negative = early), if available */
  readonly delaySeconds: number | null;

  /** Trip identifier from source system, if available */
  readonly tripId: string | null;

  /** GTFS trip reference, if available (Vilnius only) */
  readonly gtfsTripId: string | null;

  /** Next stop ID (Kaunas only) */
  readonly nextStopId: string | null;

  /** Predicted arrival time at next stop in seconds from midnight (Kaunas only) */
  readonly arrivalTimeSeconds: number | null;

  /** 
   * Whether this data is considered stale.
   * True if measurement time is older than configured threshold.
   */
  readonly isStale: boolean;

  /** 
   * Timestamp when the GPS position was measured.
   * Falls back to server receive time if measurement time unavailable.
   */
  readonly measuredAt: Date;
}

// =============================================================================
// Stop & Route Interfaces (GTFS Static Data)
// =============================================================================

/**
 * Static stop/station data from GTFS.
 */
export interface Stop {
  /** Unique stop identifier from GTFS */
  readonly id: string;

  /** Short code for the stop, if available */
  readonly code: string | null;

  /** Human-readable stop name */
  readonly name: string;

  /** Additional description, if available */
  readonly description: string | null;

  /** Latitude in WGS84 decimal degrees */
  readonly latitude: number;

  /** Longitude in WGS84 decimal degrees */
  readonly longitude: number;

  /** URL with stop information, if available */
  readonly url: string | null;
}

/**
 * Route information from GTFS.
 */
export interface Route {
  /** Unique route identifier from GTFS */
  readonly id: string;

  /** Short route name (e.g., "4G", "N1") */
  readonly shortName: string;

  /** Full route name with endpoints */
  readonly longName: string;

  /** Type of vehicles on this route */
  readonly type: VehicleType;

  /** Route color for display (hex without #) */
  readonly color: string;

  /** Text color for display on route color background (hex without #) */
  readonly textColor: string;
}

/**
 * Trip information from GTFS.
 * A trip is a specific journey along a route at a specific time.
 */
export interface Trip {
  /** Unique trip identifier */
  readonly id: string;

  /** Route this trip belongs to */
  readonly routeId: string;

  /** Service ID (links to Calendar for operating days) */
  readonly serviceId: string;

  /** Text displayed to passengers identifying the trip's destination */
  readonly headsign: string;

  /** Direction of travel: 0 = outbound, 1 = inbound, null = unknown */
  readonly directionId: number | null;

  /** Shape ID for the geographic path (links to shapes) */
  readonly shapeId: string | null;

  /** Block ID for vehicle scheduling */
  readonly blockId: string | null;
}

/**
 * A single point in a shape's geographic path.
 * Shapes define the path a vehicle takes between stops.
 */
export interface ShapePoint {
  /** Shape ID this point belongs to */
  readonly shapeId: string;

  /** Latitude in WGS84 decimal degrees */
  readonly latitude: number;

  /** Longitude in WGS84 decimal degrees */
  readonly longitude: number;

  /** Order of this point in the shape */
  readonly sequence: number;

  /** Distance traveled along the shape to this point (optional) */
  readonly distanceTraveled: number | null;
}

/**
 * Service calendar defining which days a service operates.
 */
export interface Calendar {
  /** Service ID that can be referenced by trips */
  readonly serviceId: string;

  /** Service operates on Mondays */
  readonly monday: boolean;

  /** Service operates on Tuesdays */
  readonly tuesday: boolean;

  /** Service operates on Wednesdays */
  readonly wednesday: boolean;

  /** Service operates on Thursdays */
  readonly thursday: boolean;

  /** Service operates on Fridays */
  readonly friday: boolean;

  /** Service operates on Saturdays */
  readonly saturday: boolean;

  /** Service operates on Sundays */
  readonly sunday: boolean;

  /** Start date of service (YYYY-MM-DD) */
  readonly startDate: string;

  /** End date of service (YYYY-MM-DD) */
  readonly endDate: string;
}

/**
 * Exception to the regular service calendar.
 */
export interface CalendarDate {
  /** Service ID this exception applies to */
  readonly serviceId: string;

  /** Date of the exception (YYYY-MM-DD) */
  readonly date: string;

  /** Type of exception: 'added' = service runs, 'removed' = service does not run */
  readonly exceptionType: 'added' | 'removed';
}

/**
 * Transit agency information.
 */
export interface Agency {
  /** Agency identifier (may be empty if only one agency) */
  readonly id: string;

  /** Full name of the transit agency */
  readonly name: string;

  /** URL of the transit agency */
  readonly url: string;

  /** Timezone where the agency is located */
  readonly timezone: string;

  /** Primary language used by the agency (optional) */
  readonly language: string | null;

  /** Voice telephone number for the agency (optional) */
  readonly phone: string | null;
}

/**
 * Arrival and departure times for a stop on a trip.
 */
export interface StopTime {
  /** Trip this stop time belongs to */
  readonly tripId: string;

  /** Stop where this arrival/departure occurs */
  readonly stopId: string;

  /** Arrival time (HH:MM:SS, can exceed 24:00:00 for overnight) */
  readonly arrivalTime: string;

  /** Departure time (HH:MM:SS, can exceed 24:00:00 for overnight) */
  readonly departureTime: string;

  /** Order of this stop in the trip */
  readonly sequence: number;

  /** Headsign to display at this stop (overrides trip headsign) */
  readonly headsign: string | null;
}

// =============================================================================
// Sync Result Types
// =============================================================================

/**
 * Result of a GTFS sync operation.
 */
export interface SyncResult {
  /** City that was synced */
  readonly city: CityId;

  /** Whether data was updated or already current */
  readonly status: 'updated' | 'up-to-date';

  /** Number of routes in cache after sync */
  readonly routeCount: number;

  /** Number of stops in cache after sync */
  readonly stopCount: number;

  /** Last-Modified timestamp from server */
  readonly lastModified: string | null;

  /** When this sync was performed */
  readonly syncedAt: Date;
}

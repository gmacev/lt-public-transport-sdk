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

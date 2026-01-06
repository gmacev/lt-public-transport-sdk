/**
 * Timestamp utilities for converting service day seconds
 * @module utils/time
 */

/**
 * Seconds in a day (24 hours).
 */
const SECONDS_PER_DAY = 86400;

/**
 * Stale data threshold in milliseconds (5 minutes).
 */
const DEFAULT_STALE_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Convert "seconds from midnight" to a Date object.
 * 
 * GTFS and stops.lt use "service day" times where values > 86400 (24:00:00)
 * represent times after midnight that belong to the previous service day.
 * 
 * For example:
 * - 90000 seconds = 25:00:00 = 01:00:00 the next calendar day
 * - If it's Tuesday 02:00 and we see 90000, it means:
 *   - The service started Monday (previous day)
 *   - Monday 00:00 + 90000s = Tuesday 01:00
 * 
 * @param seconds - Seconds from midnight (can exceed 86400)
 * @returns Date object representing the measurement time
 */
export function secondsFromMidnightToDate(seconds: number): Date {
  const now = new Date();
  const baseMidnight = new Date(now);
  baseMidnight.setHours(0, 0, 0, 0);

  // If seconds >= 86400, this is a "night owl" trip from previous service day.
  // The base should be yesterday's midnight.
  // Yesterday 00:00 + 90000s = Today 01:00
  if (seconds >= SECONDS_PER_DAY) {
    baseMidnight.setDate(baseMidnight.getDate() - 1);
  }

  // Add full seconds (do NOT modulo - we need the overflow)
  return new Date(baseMidnight.getTime() + seconds * 1000);
}

/**
 * Convert a Date to "seconds from midnight" format.
 * Used for testing and reverse calculations.
 * 
 * @param date - Date to convert
 * @returns Seconds from midnight
 */
export function dateToSecondsFromMidnight(date: Date): number {
  return (
    date.getHours() * 3600 +
    date.getMinutes() * 60 +
    date.getSeconds()
  );
}

/**
 * Check if measurement data is stale (older than threshold).
 * 
 * @param measuredAt - When the data was measured
 * @param thresholdMs - Stale threshold in milliseconds (default: 5 minutes)
 * @returns true if data is stale
 */
export function isDataStale(
  measuredAt: Date,
  thresholdMs: number = DEFAULT_STALE_THRESHOLD_MS
): boolean {
  const now = Date.now();
  const age = now - measuredAt.getTime();
  
  // Negative age means measurement is in the future - likely a prediction, not stale
  if (age < 0) {
    return false;
  }
  
  return age > thresholdMs;
}

/**
 * Parse a time value from GPS data.
 * Returns null if parsing fails.
 * 
 * @param value - Raw string value (seconds from midnight)
 * @returns Parsed integer or null
 */
export function parseTimeSeconds(value: string): number | null {
  if (!value || value.trim() === '') {
    return null;
  }
  
  const parsed = parseInt(value, 10);
  
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  
  return parsed;
}

/**
 * Get the current time as seconds from midnight.
 * Useful for comparisons with GPS time fields.
 */
export function getCurrentSecondsFromMidnight(): number {
  const now = new Date();
  return dateToSecondsFromMidnight(now);
}

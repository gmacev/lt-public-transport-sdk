/**
 * Parser module exports
 * @module parsers
 */

export {
  parseGpsFullStream,
  type GpsFullParseOptions,
} from './gps-full.js';

export {
  parseGpsLiteStream,
  isLiteCity,
  type GpsLiteParseOptions,
  type LiteCityId,
} from './gps-lite.js';

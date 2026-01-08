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
  getLiteFormatDescriptor,
  isLiteFormat,
  type GpsLiteParseOptions,
} from './gps-lite.js';

// Legacy exports (deprecated, kept for backwards compatibility)
// eslint-disable-next-line @typescript-eslint/no-deprecated
export { isLiteCity, type LiteCityId } from './gps-lite.js';

/**
 * Utility module exports
 * @module utils
 */

export {
  normalizeCoordinate,
  isValidLithuaniaCoord,
  normalizeAndValidateCoordinates,
  normalizeBearing,
  normalizeSpeed,
  LITHUANIA_BOUNDS,
} from './coordinates.js';

export {
  repairMojibake,
  hasMojibake,
  decodeWindows1257,
  decodeBalticText,
  cleanTextField,
} from './encoding.js';

export {
  secondsFromMidnightToDate,
  dateToSecondsFromMidnight,
  isDataStale,
  parseTimeSeconds,
  getCurrentSecondsFromMidnight,
} from './time.js';

/**
 * Text encoding utilities for handling Windows-1257 and mojibake repair
 * @module utils/encoding
 */

/**
 * Common mojibake patterns when Windows-1257 text is incorrectly decoded as UTF-8.
 * Maps corrupted sequences to correct Lithuanian characters.
 */
const MOJIBAKE_REPAIRS: ReadonlyMap<string, string> = new Map([
  // Lowercase Lithuanian letters
  ['Ä…', 'ą'],
  ['Ä‡', 'ć'],  // Not Lithuanian but may appear
  ['Ä—', 'ė'],
  ['Ä™', 'ę'],  // Not Lithuanian but may appear
  ['Ä¯', 'į'],
  ['Å¡', 'š'],
  ['Å³', 'ų'],
  ['Å«', 'ū'],
  ['Å¾', 'ž'],
  
  // Uppercase Lithuanian letters
  ['Ä„', 'Ą'],
  ['Ä†', 'Ć'],  // Not Lithuanian but may appear
  ['Ä–', 'Ė'],
  ['Ä˜', 'Ę'],  // Not Lithuanian but may appear
  ['Ä®', 'Į'],
  ['Å ', 'Š'],
  ['Å²', 'Ų'],
  ['Åª', 'Ū'],
  ['Å½', 'Ž'],
  
  // Additional patterns that may occur
  ['Ã¨', 'č'],
  ['Ã ', 'ę'],
  ['Å„', 'ń'],
  ['Ä', 'č'],  // Sometimes Ä alone appears for č
]);

/**
 * Attempt to repair mojibake (garbled text) caused by encoding mismatches.
 * Common when Windows-1257 encoded text is read as UTF-8.
 * 
 * @param text - Potentially corrupted text
 * @returns Repaired text with Lithuanian characters restored
 * 
 * @example
 * repairMojibake('Autobusų parkas(EiÅ¡iÅ¡kiÅ³ pl.)')
 * // => 'Autobusų parkas(Eišiškių pl.)'
 */
export function repairMojibake(text: string): string {
  let result = text;
  
  for (const [corrupted, correct] of MOJIBAKE_REPAIRS) {
    // Use global replace for all occurrences
    result = result.split(corrupted).join(correct);
  }
  
  return result;
}

/**
 * Check if text contains likely mojibake patterns.
 * 
 * @param text - Text to check
 * @returns true if mojibake patterns detected
 */
export function hasMojibake(text: string): boolean {
  for (const corrupted of MOJIBAKE_REPAIRS.keys()) {
    if (text.includes(corrupted)) {
      return true;
    }
  }
  return false;
}

/**
 * Windows-1257 (Baltic) code page byte-to-character mapping.
 * Only maps bytes 128-255; 0-127 are identical to ASCII.
 */
const WINDOWS_1257_MAP: readonly string[] = [
  // 0x80-0x8F
  '\u20AC', '', '\u201A', '', '\u201E', '\u2026', '\u2020', '\u2021', '', '\u2030', '', '\u2039', '', '\u00A8', '\u02C7', '\u00B8',
  // 0x90-0x9F
  '', '\u2018', '\u2019', '\u201C', '\u201D', '\u2022', '\u2013', '\u2014', '', '\u2122', '', '\u203A', '', '\u00AF', '\u02DB', '',
  // 0xA0-0xAF
  '\u00A0', '', '\u00A2', '\u00A3', '\u00A4', '', '\u00A6', '\u00A7', '\u00D8', '\u00A9', '\u0156', '\u00AB', '\u00AC', '\u00AD', '\u00AE', '\u00C6',
  // 0xB0-0xBF
  '\u00B0', '\u00B1', '\u00B2', '\u00B3', '\u00B4', '\u00B5', '\u00B6', '\u00B7', '\u00F8', '\u00B9', '\u0157', '\u00BB', '\u00BC', '\u00BD', '\u00BE', '\u00E6',
  // 0xC0-0xCF
  '\u0104', '\u012E', '\u0100', '\u0106', '\u00C4', '\u00C5', '\u0118', '\u0112', '\u010C', '\u00C9', '\u0179', '\u0116', '\u0122', '\u0136', '\u012A', '\u013B',
  // 0xD0-0xDF
  '\u0160', '\u0143', '\u0145', '\u00D3', '\u014C', '\u00D5', '\u00D6', '\u00D7', '\u0172', '\u0141', '\u015A', '\u016A', '\u00DC', '\u017B', '\u017D', '\u00DF',
  // 0xE0-0xEF
  '\u0105', '\u012F', '\u0101', '\u0107', '\u00E4', '\u00E5', '\u0119', '\u0113', '\u010D', '\u00E9', '\u017A', '\u0117', '\u0123', '\u0137', '\u012B', '\u013C',
  // 0xF0-0xFF
  '\u0161', '\u0144', '\u0146', '\u00F3', '\u014D', '\u00F5', '\u00F6', '\u00F7', '\u0173', '\u0142', '\u015B', '\u016B', '\u00FC', '\u017C', '\u017E', '\u02D9',
];

/**
 * Decode a byte array from Windows-1257 (Baltic) encoding to UTF-8 string.
 * 
 * @param bytes - Raw bytes in Windows-1257 encoding
 * @returns Decoded UTF-8 string
 */
export function decodeWindows1257(bytes: Uint8Array): string {
  const chars: string[] = [];
  
  for (const byte of bytes) {
    if (byte < 128) {
      // ASCII range - direct mapping
      chars.push(String.fromCharCode(byte));
    } else {
      // Extended range - use Windows-1257 mapping
      const mapped = WINDOWS_1257_MAP[byte - 128];
      chars.push(mapped !== undefined && mapped !== '' ? mapped : '?');
    }
  }
  
  return chars.join('');
}

/**
 * Decode text from an ArrayBuffer, trying UTF-8 first, then falling back
 * to Windows-1257 if mojibake is detected.
 * 
 * @param buffer - Raw data buffer
 * @returns Properly decoded string
 */
export function decodeBalticText(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  
  // First, try UTF-8 decoding
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let text = decoder.decode(bytes);
  
  // Check for mojibake patterns
  if (hasMojibake(text)) {
    // Try to repair the mojibake
    text = repairMojibake(text);
  }
  
  // If still looks corrupted, try Windows-1257 directly
  // (Check for remaining replacement characters or known patterns)
  if (text.includes('\uFFFD') || /[\x80-\x9F]/.test(text)) {
    text = decodeWindows1257(bytes);
  }
  
  return text;
}

/**
 * Clean and normalize a text field from transport data.
 * Handles encoding issues and trims whitespace.
 * 
 * @param text - Raw text field
 * @returns Cleaned text
 */
export function cleanTextField(text: string): string {
  if (!text) return '';
  
  // Repair any mojibake
  let cleaned = repairMojibake(text.trim());
  
  // Remove any control characters (ASCII 0-31 and 127)
  // eslint-disable-next-line no-control-regex
  cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, '');
  
  return cleaned;
}

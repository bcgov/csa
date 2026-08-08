/**
 * DIN (Document Identification Number) Validation Utilities
 *
 * DIN format: exactly 9 numeric digits per CSA specification (no checksum).
 */

/**
 * Validates DIN format (must be exactly 9 digits)
 */
export function isValidDinFormat(din: string | null | undefined): boolean {
  if (!din) return false

  // Must be exactly 9 digits
  const dinPattern = /^\d{9}$/
  return dinPattern.test(din)
}

/**
 * Validates DIN format (exactly 9 numeric digits).
 */
export function validateDin(din: string | null | undefined): {
  isValid: boolean
  error?: string
} {
  if (!din) {
    return { isValid: false, error: 'Invalid DIN. Please enter a valid CSA DIN.' }
  }

  if (!isValidDinFormat(din)) {
    return { isValid: false, error: 'Invalid DIN. Please enter a valid CSA DIN.' }
  }

  return { isValid: true }
}

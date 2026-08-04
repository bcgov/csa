/**
 * DIN (Document Identification Number) Validation Utilities
 *
 * DIN Format: 9-digit number per CSA DIN specification
 * TODO: Confirm CSA-specific checksum algorithm with business before re-enabling checksum validation
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
 * Complete DIN validation (format only until CSA checksum algorithm is confirmed)
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

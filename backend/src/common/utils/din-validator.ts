/**
 * DIN (Document Identification Number) Validation Utilities
 *
 * DIN Format: 9-digit number with Luhn checksum algorithm
 * Example: 123456782 (last digit is checksum)
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
 * Calculates Luhn checksum for a number
 * Used by credit cards, DINs, and other identification numbers
 */
function calculateLuhnChecksum(digits: string): number {
  let sum = 0
  let isEven = false

  // Process digits from right to left
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i], 10)

    if (isEven) {
      digit *= 2
      if (digit > 9) {
        digit -= 9
      }
    }

    sum += digit
    isEven = !isEven
  }

  return (10 - (sum % 10)) % 10
}

/**
 * Validates DIN checksum using Luhn algorithm
 */
export function isValidDinChecksum(din: string): boolean {
  if (!isValidDinFormat(din)) return false

  const digits = din.substring(0, 8)
  const checksum = parseInt(din[8], 10)
  const calculatedChecksum = calculateLuhnChecksum(digits)

  return checksum === calculatedChecksum
}

/**
 * Generates a valid DIN checksum digit for the first 8 digits
 * Useful for testing or data generation
 */
export function generateDinChecksum(first8Digits: string): string {
  if (!/^\d{8}$/.test(first8Digits)) {
    throw new Error('Input must be exactly 8 digits')
  }

  const checksum = calculateLuhnChecksum(first8Digits)
  return `${first8Digits}${checksum}`
}

/**
 * Complete DIN validation (format + checksum)
 */
export function validateDin(din: string | null | undefined): {
  isValid: boolean
  error?: string
} {
  if (!din) {
    return { isValid: false, error: 'DIN is required' }
  }

  if (!isValidDinFormat(din)) {
    return { isValid: false, error: 'Invalid DIN format. DIN must be exactly 9 digits.' }
  }

  if (!isValidDinChecksum(din)) {
    return { isValid: false, error: 'Invalid DIN checksum. Please verify the DIN number.' }
  }

  return { isValid: true }
}

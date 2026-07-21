import { TRANSACTION_TYPES } from '../contacts/constants'

export interface CraValidationResult {
  isValid: boolean
  missingFields: string[]
}

/**
 * Shape of the contact fields needed for CRA mandatory-field validation.
 * Kept narrow so it can be satisfied by any select that includes these columns.
 */
export type ContactForCraValidation = {
  firstName?: string | null
  lastName?: string | null
  gender?: string | null
  dateOfBirth?: Date | null
  birthCity?: string | null
  birthCountry?: string | null
  birthProvince?: string | null
  effectiveDate?: Date | null
  careEndDate?: Date | null
  cancelReasonCode?: string | null
}

function isPresent(value: string | Date | null | undefined): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  return true // Date instance is always considered present
}

/**
 * Validates that all CRA-required mandatory fields are present on a contact
 * before it is added to a batch.
 *
 * Rules (US-40101):
 *  - Always required: firstName, lastName, gender, dateOfBirth, birthCity, birthCountry
 *  - Conditional:     birthProvince when birthCountry is 'Canada' (case-insensitive)
 *  - Application:     effectiveDate (Application Start Date)
 *  - Cancellation:    careEndDate, cancelReasonCode
 *
 * @param contact        - Partial contact record containing the relevant fields.
 * @param transactionType - 'application' | 'cancellation' (use TRANSACTION_TYPES constants).
 * @returns CraValidationResult with isValid flag and a human-readable list of missing fields.
 */
export function validateCraRequiredFields(
  contact: ContactForCraValidation,
  transactionType: string,
): CraValidationResult {
  const missingFields: string[] = []

  // --- Always required ---
  if (!isPresent(contact.firstName)) missingFields.push('First Name')
  if (!isPresent(contact.lastName)) missingFields.push('Last Name')
  if (!isPresent(contact.gender)) missingFields.push('Gender')
  if (!isPresent(contact.dateOfBirth)) missingFields.push('Date of Birth')
  if (!isPresent(contact.birthCity)) missingFields.push('City of Birth')
  if (!isPresent(contact.birthCountry)) missingFields.push('Country of Birth')

  // --- Conditional: Province required when country is Canada (case-insensitive) ---
  if (isPresent(contact.birthCountry)) {
    const countryLower = (contact.birthCountry as string).toLowerCase().trim()
    if (countryLower === 'canada' && !isPresent(contact.birthProvince)) {
      missingFields.push('Province of Birth')
    }
  }

  // --- Application-specific ---
  if (transactionType === TRANSACTION_TYPES.APPLICATION) {
    if (!isPresent(contact.effectiveDate)) missingFields.push('Application Start Date')
  }

  // --- Cancellation-specific ---
  if (transactionType === TRANSACTION_TYPES.CANCELLATION) {
    if (!isPresent(contact.careEndDate)) missingFields.push('Cancellation End Date')
    if (!isPresent(contact.cancelReasonCode)) missingFields.push('Cancellation Reason Code')
  }

  return { isValid: missingFields.length === 0, missingFields }
}

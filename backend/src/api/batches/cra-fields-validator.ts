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
}

function isPresent(value: string | Date | null | undefined): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  return true // Date instance is always considered present
}

/**
 * Validates that all user-sourced CRA mandatory fields are present on a contact
 * before it is added to a batch.
 *
 * System-generated fields (Application Start Date, Cancellation End Date,
 * Cancellation Reason Code) are populated by BL-05 after validation passes
 * and are intentionally excluded here.
 *
 * Rules:
 *  - Always required: firstName, lastName, gender, dateOfBirth, birthCity, birthCountry
 *  - Conditional:     birthProvince when birthCountry is 'Canada' (case-insensitive)
 *
 * @param contact - Partial contact record containing the relevant fields.
 * @returns CraValidationResult with isValid flag and a human-readable list of missing fields.
 */
export function validateCraRequiredFields(contact: ContactForCraValidation): CraValidationResult {
  const missingFields: string[] = []

  if (!isPresent(contact.firstName)) missingFields.push('First Name')
  if (!isPresent(contact.lastName)) missingFields.push('Last Name')
  if (!isPresent(contact.gender)) missingFields.push('Gender')
  if (!isPresent(contact.dateOfBirth)) missingFields.push('Date of Birth')
  if (!isPresent(contact.birthCity)) missingFields.push('City of Birth')
  if (!isPresent(contact.birthCountry)) missingFields.push('Country of Birth')

  if (isPresent(contact.birthCountry)) {
    const countryLower = (contact.birthCountry as string).toLowerCase().trim()
    if (countryLower === 'canada' && !isPresent(contact.birthProvince)) {
      missingFields.push('Province of Birth')
    }
  }

  return { isValid: missingFields.length === 0, missingFields }
}

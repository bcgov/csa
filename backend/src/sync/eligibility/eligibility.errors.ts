// Thrown for caller-facing input/data conditions that should map to a 422
// at the API boundary (e.g. missing staging row, missing required field).
// Anything else from the eligibility pipeline is an internal error and
// should propagate to the default exception filter.
export class EligibilityInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EligibilityInputError'
  }
}

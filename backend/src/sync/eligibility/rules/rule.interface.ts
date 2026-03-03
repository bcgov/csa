import { ContactProfile, EligibilityResult, PlacementRecord } from '../eligibility.types'

export interface EligibilityContext {
  contact: ContactProfile
  referenceDate: Date
  hasPlacement?: boolean
  hasNonPlacement?: boolean
  eligiblePlacements?: PlacementRecord[]
  contractNumbers?: string[]
  agreementRowIds?: string[]
}

// A single step in the eligibility decision rules
export interface EligibilityRule {
  readonly name: string
  evaluate(ctx: EligibilityContext): EligibilityResult | null
}

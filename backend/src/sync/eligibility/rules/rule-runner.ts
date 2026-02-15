import { ContactProfile, EligibilityResult } from '../eligibility.types'
import { EligibilityContext, EligibilityRule } from './rule.interface'

export function runEligibility(
  contact: ContactProfile,
  rules: EligibilityRule[],
): EligibilityResult | null {
  const ctx: EligibilityContext = { contact }

  for (const rule of rules) {
    const result = rule.evaluate(ctx)
    if (result) return result
  }

  return null
}

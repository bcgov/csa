export interface OutcomePlan<T extends string> {
  spec: string
  outcomes: T[]
  counts: Record<T, number>
}

export function buildOutcomePlan<T extends string>(
  count: number,
  spec: string | undefined,
  defaultOutcome: T,
  validOutcomes: readonly T[],
  mixedPattern: readonly T[],
): OutcomePlan<T> {
  if (count <= 0) {
    throw new Error('Outcome plan requires at least one record')
  }

  const normalizedSpec = (spec ?? defaultOutcome).trim().toLowerCase()
  const validSet = new Set(validOutcomes)

  let outcomes: T[]

  if (normalizedSpec === 'mixed') {
    if (mixedPattern.length === 0) {
      throw new Error('Mixed outcome pattern must not be empty')
    }
    outcomes = Array.from({ length: count }, (_, index) => mixedPattern[index % mixedPattern.length]!)
  } else if (normalizedSpec.includes(',')) {
    const tokens = normalizedSpec.split(',').map((token) => token.trim()).filter(Boolean)
    if (tokens.length === 0) {
      throw new Error('Outcome list must include at least one value')
    }

    for (const token of tokens) {
      if (!validSet.has(token as T)) {
        throw new Error(`Invalid outcome "${token}". Expected one of: ${validOutcomes.join(', ')}, mixed`)
      }
    }

    outcomes = Array.from({ length: count }, (_, index) => tokens[index % tokens.length]! as T)
  } else {
    if (!validSet.has(normalizedSpec as T)) {
      throw new Error(`Invalid outcome "${normalizedSpec}". Expected one of: ${validOutcomes.join(', ')}, mixed`)
    }
    outcomes = Array.from({ length: count }, () => normalizedSpec as T)
  }

  const counts = Object.fromEntries(validOutcomes.map((outcome) => [outcome, 0])) as Record<T, number>
  for (const outcome of outcomes) {
    counts[outcome] += 1
  }

  return { spec: normalizedSpec, outcomes, counts }
}

export function formatOutcomeSummary<T extends string>(plan: OutcomePlan<T>): string {
  const parts = (Object.keys(plan.counts) as T[])
    .filter((outcome) => plan.counts[outcome] > 0)
    .map((outcome) => `${plan.counts[outcome]} ${outcome}`)

  if (plan.spec === 'mixed' || plan.spec.includes(',')) {
    return `mixed (${parts.join(', ')})`
  }

  return plan.spec
}

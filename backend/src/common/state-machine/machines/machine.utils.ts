export type TransitionMap = Record<string, Record<string, string>>

export function getNextState(
  transitions: TransitionMap,
  currentState: string,
  event: string,
): string {
  const stateTransitions = transitions[currentState]
  if (!stateTransitions) {
    return currentState
  }
  return stateTransitions[event] ?? currentState
}

export function canTransition(
  transitions: TransitionMap,
  currentState: string,
  event: string,
): boolean {
  const stateTransitions = transitions[currentState]
  if (!stateTransitions) {
    return false
  }
  return event in stateTransitions
}

export function getValidEvents(transitions: TransitionMap, currentState: string): string[] {
  const stateTransitions = transitions[currentState]
  if (!stateTransitions) {
    return []
  }
  return Object.keys(stateTransitions)
}

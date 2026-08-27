/**
 * Merge the wrapper's own class with whatever the caller passed.
 *
 * Base UI accepts `className` as either a string or a function of the part's
 * state, and every wrapper here has a class of its own to contribute.
 * Returning a function covers both callers without branching: a caller's
 * function is resolved against exactly the state Base UI would have handed
 * it, and a caller's string falls out of the same path.
 *
 * The wrapper's class goes first so that when the two collide on the same
 * property, the caller's rule is the one written later in the stylesheet —
 * which, at equal specificity, is the one that wins.
 */
export type ClassName<State> = string | ((state: State) => string | undefined) | undefined

export function withClass<State>(base: string, caller: ClassName<State>) {
  return (state: State): string => {
    const extra = typeof caller === 'function' ? caller(state) : caller
    return extra ? `${base} ${extra}` : base
  }
}

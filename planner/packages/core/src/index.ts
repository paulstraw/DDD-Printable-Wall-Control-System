// @ddd-planner/core — pure domain logic.
//
// Invariants (enforced by review, see planner/README.md):
//   * no React, no three.js, no Node built-ins
//   * every exported function has Vitest coverage in test/
//
// Modules are re-exported here as they land: grid, names, transforms, bom.

export const CORE_PACKAGE = '@ddd-planner/core'

/** Millimetres per inch. The Wall Control grid is an imperial pattern. */
export const MM_PER_INCH = 25.4

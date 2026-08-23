// @ddd-planner/core — pure domain logic.
//
// Invariants (enforced by review, see planner/README.md):
//   * no React, no three.js, no Node built-ins
//   * every exported function has Vitest coverage in test/
//
// Modules are re-exported here as they land: grid, names, transforms, bom.

export const CORE_PACKAGE = '@ddd-planner/core'

export * from './grid'
export * from './names'
export * from './transforms'

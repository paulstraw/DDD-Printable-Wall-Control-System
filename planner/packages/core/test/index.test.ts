import { describe, expect, it } from 'vitest'
import { CORE_PACKAGE, MM_PER_INCH } from '../src/index'

describe('core package', () => {
  it('exposes its package name', () => {
    expect(CORE_PACKAGE).toBe('@ddd-planner/core')
  })

  it('defines millimetres per inch exactly', () => {
    expect(MM_PER_INCH).toBe(25.4)
  })
})

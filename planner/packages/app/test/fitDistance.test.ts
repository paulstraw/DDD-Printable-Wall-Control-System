import { describe, expect, it } from 'vitest'
import { createBoard } from '@ddd-planner/core'
import { fitDistance } from '../src/scene/useFaceOn'

const BOARD = createBoard(32, 32)

describe('fitDistance', () => {
  it('backs off far enough to see the whole board', () => {
    const d = fitDistance(BOARD, 45, 16 / 9)
    // Half the board subtended by half the field of view, plus a margin.
    expect(d).toBeGreaterThan(BOARD.heightMm / 2)
    expect(d).toBeLessThan(BOARD.heightMm * 3)
  })

  it('backs off further for a wider board on a narrow viewport', () => {
    const wide = createBoard(96, 32)
    expect(fitDistance(wide, 45, 0.5)).toBeGreaterThan(fitDistance(BOARD, 45, 0.5))
  })

  it('needs less distance with a wider field of view', () => {
    expect(fitDistance(BOARD, 70, 1)).toBeLessThan(fitDistance(BOARD, 30, 1))
  })

  it('survives the zero-sized canvas of the very first frame', () => {
    // A canvas reports 0 x 0 before layout. Left unclamped this puts the
    // camera millions of millimetres away, past the far plane, and the scene
    // renders empty — which looks exactly like a broken build.
    const sane = fitDistance(BOARD, 45, 1)
    for (const aspect of [0, Number.NaN, Number.POSITIVE_INFINITY, -2, 0.0001]) {
      const d = fitDistance(BOARD, 45, aspect)
      expect(Number.isFinite(d), `aspect ${aspect}`).toBe(true)
      expect(d, `aspect ${aspect}`).toBeLessThanOrEqual(sane * 1.001)
      expect(d, `aspect ${aspect}`).toBeGreaterThan(0)
    }
  })
})

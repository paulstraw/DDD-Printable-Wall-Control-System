import { beforeEach, describe, expect, it } from 'vitest'
import type { OrientedPlacement } from '@ddd-planner/core'
import {
  type CatalogFile,
  type CatalogPart,
  orientationsOf,
  orientedFor,
  useStore,
} from '../src/store'

const RULE = {
  occupiesColumns: 3,
  offsetFromSlotXMm: -2.7,
  frontFaceYMm: -10.2,
  bottomBelowSlotCenterMm: { odd: 11.45, even: 36.85 },
  matesByHeight: true,
}

const flat: OrientedPlacement = {
  rule: RULE,
  sizeMm: { x: 81.6, y: 6.15, z: 76 },
  rotateXDeg: 0,
}

const shelf: OrientedPlacement = {
  rule: { ...RULE, frontFaceYMm: -83.8, bottomBelowSlotCenterMm: { odd: -7.45, even: -7.45 }, matesByHeight: false },
  sizeMm: { x: 81.6, y: 76, z: 6.15 },
  rotateXDeg: -90,
}

function part(id: string, orientations: CatalogPart['orientations']): CatalogPart {
  return {
    id,
    family: 'centerpieces/spacer_blank',
    role: 'centerpiece',
    file: `x/${id}.stl`,
    name: id,
    base: id,
    variant: null,
    h: 3,
    w: 3,
    searchKey: id,
    triangles: 0,
    vertices: 0,
    volumeMm3: 1,
    sourceBytes: 1,
    sizeMm: { x: 81.6, y: 6.15, z: 76 },
    model: '',
    thumb: '',
    fasteners: [],
    supported: true,
    orientations,
  }
}

const catalog: CatalogFile = {
  schemaVersion: 1,
  families: [],
  fasteners: {},
  parts: [
    part('turnable', { flat, shelf }),
    part('flat-only', { flat }),
    part('shelf-only', { shelf }),
  ],
}

describe('orientedFor', () => {
  it('gives the asked-for orientation when the part has it', () => {
    expect(orientedFor(catalog.parts[0]!, 'shelf').rotateXDeg).toBe(-90)
    expect(orientedFor(catalog.parts[0]!, 'flat').rotateXDeg).toBe(0)
  })

  it('falls back to the one the part does have rather than returning nothing', () => {
    // A Gridfinity frame has no flat orientation at all, and no caller should
    // have to know which parts those are.
    expect(orientedFor(catalog.parts[2]!, 'flat')).toBe(shelf)
    expect(orientedFor(catalog.parts[1]!, 'shelf')).toBe(flat)
  })
})

describe('orientationsOf', () => {
  it('lists them flat-first, whatever order the catalog used', () => {
    expect(orientationsOf(catalog.parts[0]!)).toEqual(['flat', 'shelf'])
    expect(orientationsOf(catalog.parts[2]!)).toEqual(['shelf'])
  })
})

describe('setOrientation', () => {
  beforeEach(() => {
    useStore.setState({ catalog, placements: [], selectedIds: [] })
  })

  const place = (refs: { partId: string; col: number }[]) => {
    useStore.getState().addPlacements(refs.map((r) => ({ ...r, row: 2 })))
    return useStore.getState().placements
  }

  it('places a part in the only orientation it offers, unasked', () => {
    const placed = place([{ partId: 'shelf-only', col: 1 }, { partId: 'flat-only', col: 5 }])
    expect(placed.map((p) => p.orientation)).toEqual(['shelf', 'flat'])
  })

  it('turns what is selected', () => {
    place([{ partId: 'turnable', col: 1 }])
    useStore.getState().setOrientation('shelf')
    expect(useStore.getState().placements[0]?.orientation).toBe('shelf')
  })

  it('leaves alone a part that cannot be turned, without refusing the rest', () => {
    // Selecting a whole joint and turning it should turn the spacer and leave
    // the brackets where they are, rather than doing nothing at all.
    place([{ partId: 'turnable', col: 1 }, { partId: 'flat-only', col: 5 }])
    useStore.setState({ selectedIds: useStore.getState().placements.map((p) => p.id) })
    useStore.getState().setOrientation('shelf')
    expect(useStore.getState().placements.map((p) => p.orientation)).toEqual(['shelf', 'flat'])
  })

  it('leaves unselected parts alone', () => {
    place([{ partId: 'turnable', col: 1 }, { partId: 'turnable', col: 5 }])
    const [first] = useStore.getState().placements
    useStore.setState({ selectedIds: [first!.id] })
    useStore.getState().setOrientation('shelf')
    expect(useStore.getState().placements.map((p) => p.orientation)).toEqual(['shelf', 'flat'])
  })

  it('does nothing at all when nothing is selected', () => {
    place([{ partId: 'turnable', col: 1 }])
    const before = useStore.getState().placements
    useStore.setState({ selectedIds: [] })
    useStore.getState().setOrientation('shelf')
    expect(useStore.getState().placements).toBe(before)
  })
})

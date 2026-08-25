import { beforeEach, describe, expect, it } from 'vitest'
import { Box3, Matrix4, Vector3 } from 'three'
import { type OrientedPlacement, placementOrigin } from '@ddd-planner/core'
import {
  type CatalogFile,
  type CatalogPart,
  orientationsOf,
  orientedFor,
  useStore,
} from '../src/store'
import { assetTransform } from '../src/scene/PartModel'

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

describe('assetTransform', () => {
  /**
   * Where the asset actually ends up, composed the way the scene graph
   * composes it: the outer group carries the placement origin, the inner one
   * the turn and the lift, and three.js applies rotation before position.
   *
   * The asset itself always ships flat with its minimum corner on the origin,
   * so its untransformed box is the oriented size with y and z swapped back
   * for anything turned.
   */
  const drawnBox = (oriented: OrientedPlacement, origin: { x: number; y: number; z: number }) => {
    const { rotationX, lift } = assetTransform(oriented)
    const s = oriented.sizeMm
    const asShipped =
      oriented.rotateXDeg === 0
        ? new Vector3(s.x, s.y, s.z)
        : new Vector3(s.x, s.z, s.y)

    const matrix = new Matrix4()
      .makeTranslation(origin.x, origin.y, origin.z)
      .multiply(new Matrix4().makeTranslation(0, 0, lift))
      .multiply(new Matrix4().makeRotationX(rotationX))

    return new Box3(new Vector3(0, 0, 0), asShipped).applyMatrix4(matrix)
  }

  const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 6)

  const sits = (oriented: OrientedPlacement) => {
    const origin = placementOrigin(oriented.rule, 3, { col: 2, row: 1 })
    const box = drawnBox(oriented, origin)
    near(box.min.x, origin.x)
    near(box.min.y, origin.y)
    near(box.min.z, origin.z)
    near(box.max.x, origin.x + oriented.sizeMm.x)
    near(box.max.y, origin.y + oriented.sizeMm.y)
    near(box.max.z, origin.z + oriented.sizeMm.z)
  }

  // Both orientations have to land on exactly the box `placementOrigin` and
  // `sizeMm` promise — which is the box the drag ghost draws. The two used to
  // disagree for a shelf: the lift was the reach rather than the thickness,
  // so the plate hung 19 mm above the pocket that holds it.
  it('lands a flat part on the box the ghost drew', () => sits(flat))
  it('lands a shelf on the box the ghost drew', () => sits(shelf))

  it('lifts a turned part by its thickness, not its reach', () => {
    expect(assetTransform(shelf).lift).toBe(shelf.sizeMm.z)
    expect(assetTransform(flat).lift).toBe(0)
  })
})

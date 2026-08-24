import { assemblyExtent, assemblyPartCounts } from '@ddd-planner/core'
import { useStore } from '../store'

/**
 * Saved groups, ready to drag back onto the wall.
 *
 * It only appears once something has been saved. An empty library explaining
 * that it is empty would take space from the catalog on every first visit,
 * and the header already offers the save when a selection exists.
 */
export function AssemblyPanel() {
  const assemblies = useStore((s) => s.assemblies)
  const dragging = useStore((s) => s.dragging)
  const beginAssemblyDrag = useStore((s) => s.beginAssemblyDrag)
  const deleteAssembly = useStore((s) => s.deleteAssembly)

  if (assemblies.length === 0) return null

  return (
    <section className="assemblies">
      <h2>Assemblies</h2>
      <ul>
        {assemblies.map((assembly) => {
          const extent = assemblyExtent(assembly.parts)
          const distinct = assemblyPartCounts(assembly.parts).size
          const isDragging =
            dragging?.kind === 'assembly' && dragging.assemblyId === assembly.id

          return (
            <li key={assembly.id}>
              <button
                type="button"
                className={isDragging ? 'assembly dragging' : 'assembly'}
                onPointerDown={() => beginAssemblyDrag(assembly.id)}
                title={`${assembly.name} — drag onto the wall`}
              >
                <span className="assembly-name">{assembly.name}</span>
                <span className="assembly-meta">
                  {assembly.parts.length} part{assembly.parts.length === 1 ? '' : 's'}
                  {distinct !== assembly.parts.length ? ` · ${distinct} distinct` : ''} ·{' '}
                  {extent.cols}×{extent.rows}
                </span>
              </button>
              <button
                type="button"
                className="assembly-delete"
                onClick={() => deleteAssembly(assembly.id)}
                title={`Forget “${assembly.name}” — parts already on the wall stay`}
                aria-label={`Delete assembly ${assembly.name}`}
              >
                ×
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

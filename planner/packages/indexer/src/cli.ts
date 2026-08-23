/**
 * Indexer CLI — thin wrapper around runIndexer.
 *
 *   npm run index --workspace @ddd-planner/indexer
 */

import { DEFAULT_OUT_DIR, runIndexer } from './catalog'

const { index, stats, outDir } = await runIndexer(process.argv[2] ?? DEFAULT_OUT_DIR)

const kb = (n: number) => `${(n / 1024).toFixed(0)} kB`.padStart(8)
const total = stats.modelBytes + stats.thumbBytes + stats.indexBytes

console.log(`indexed ${index.parts.length} parts + ${Object.keys(index.fasteners).length} fasteners`)
console.log(`  models ${kb(stats.modelBytes)}`)
console.log(`  thumbs ${kb(stats.thumbBytes)}`)
console.log(`  index  ${kb(stats.indexBytes)}`)
console.log(`  total  ${kb(total)}   in ${(stats.elapsedMs / 1000).toFixed(1)} s`)
console.log(`  -> ${outDir}`)

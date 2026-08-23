// Indexer CLI. Walks the repo's STL directories and emits the web-loadable
// part library: compressed glTF, WebP thumbnails and a single index.json.
//
// Nothing it writes is ever committed — CI runs this on every build.

import { MM_PER_INCH } from '@ddd-planner/core'

function main(argv: string[]): number {
  const repoRoot = argv[0] ?? '../..'
  console.log(`ddd-index: scaffold only, no parts written yet.`)
  console.log(`  repo root : ${repoRoot}`)
  console.log(`  grid unit : ${MM_PER_INCH} mm`)
  return 0
}

process.exitCode = main(process.argv.slice(2))

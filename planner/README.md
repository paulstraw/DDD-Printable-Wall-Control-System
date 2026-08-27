# Wall Planner

A browser-based layout planner for this library. Type in your wall size, drag parts onto a
3D pegboard, and get back a print list — quantities, filament estimate, the fasteners you
forgot, and a ZIP of exactly the STLs you need.

It is a static site. No backend, no accounts, no database.

---

## For a reviewer, in order of what you probably want to know

### It does not touch anything you already have

Every file this adds lives under `planner/`, with one unavoidable exception: the GitHub
Actions workflow, which has to be at `.github/workflows/planner-pages.yml` because that is
the only place Actions looks. It sits alongside the existing `FUNDING.yml` and does not
modify it.

`Sidepieces/`, `Centerpieces/`, `Quickhooks/`, `Accessories/`, `Sources/`, `images/` and the
root `README.md` are untouched. Nothing is moved, renamed, or rewritten.

### The catalog builds itself from the STLs

There is no list of parts to maintain. The indexer walks the repository, reads every STL,
measures it, and derives the catalog — names, dimensions, thumbnails, 3D previews, download
URLs, required fasteners. **Add a new STL to a family folder and it appears in the planner on
the next deploy**, correctly placed, with no edit anywhere.

That is the property worth protecting, and it is why the interesting logic lives in
`planner/data/families.json` rather than in code: one rule per family, not one entry per part.

Current run: **541 parts and 5 fasteners across 19 families**, from 557 STL files.

### What you have to do to turn it on

Settings → Pages → Source: **GitHub Actions**. That is all. The workflow does the rest, and it
runs on pushes that touch the part folders, so adding parts republishes the catalog.

If you would rather it never publish, don't enable Pages — the workflow will still build and
test on pull requests, which is a reasonable thing to leave switched off.

### Nothing large is committed

Generated assets — `*.glb`, thumbnails, `index.json` — are gitignored and built in CI. The
repository grows by source code only. The published site carries about **14 MB of part
models**, lazy-loaded so a visitor downloads only what they place.

STL downloads do not come from Pages at all: the ZIP is assembled in the browser from
jsDelivr, falling back to `raw.githubusercontent.com`. Your files stay the source of truth.

---

## How it works

Three packages, with a deliberate split:

| Package | What it is | Constraint |
|---|---|---|
| `packages/core` | The domain: the slot grid, placement maths, search, BOM, issues, saved documents | Pure. No React, no three.js, no Node APIs. Every function has tests. |
| `packages/indexer` | The build step: reads STLs, writes glTF + thumbnails + `index.json` | Node. Runs in CI, never in the browser. |
| `packages/app` | The site: React + react-three-fiber | Holds no domain knowledge it can avoid. |

`core` being pure is what makes the placement maths testable without a browser, and it is
where any question about "where does this part actually go" gets answered.

### The grid

Recovered from `Accessories/Wall Control Panel Model.stl` and cross-checked against the parts
themselves. Slots are 2.2 × 25.4 mm on a 1 inch horizontal pitch, repeating every **2 inches**
vertically; the 1/4" holes interleave 12.7 mm across and repeat every inch.

The check that this is right: the Flats series grows by alternating 22.30 / 28.50 mm — 34.90,
57.20, 85.70, 108.00, 136.50 — because consecutive sizes engage opposite slot phases. The grid
code reproduces those five numbers exactly, and a test fails if it ever stops.

### Placement is measured, not assumed

A part's position comes from its **mesh**, not from its filename. Thickness, depth and width
are measured; the formulas in `families.json` are assertions the tests check, never inputs.
That is what lets fractional-width U brackets, strap mounts sized by their strap, and 140
community tool hooks all place correctly with no per-part work.

### Two archetypes, because the system has two

Reading the library made one thing obvious: **Wall Control parts share a single mounting
interface by construction.** Seven of the eight sidepiece families are identical in tang,
thickness and height series. So `families.json` states that interface once as an archetype and
each family adds only what is its own — 19 families in a few hundred lines.

Two families are not what their folder implies, and the archetype is what gets them right:
`Sidepieces/Retainers` behaves as a centerpiece (it clips onto an assembly), and Quickhooks
hang from the slots like a sidepiece.

### A spacer is a wall plate or a shelf, and only you know which

A sidepiece has two sockets. The back plate carries a vertical groove that holds a centerpiece
flat against the panel; the **arm** carries a second one, running out along the projection, that
holds the same centerpiece lying horizontal as a shelf. Your own READMEs recommend both —
"great choice for horizontal use as a shelf" — and nothing about the part decides it.

So orientation lives on the **placement**, not the catalog row. Select a spacer and press
<kbd>R</kbd>, or use the Flat/Shelf control that appears. Six families offer both; Gridfinity
frames offer only the shelf, because a frame with its cells facing the room is not a thing
anyone builds.

The joint is one 25.4 mm lattice on both sides. A sidepiece's arm has a 10.0 mm pocket per inch
it projects; every shelf-capable centerpiece has a matching band per grid unit — a rib that fills
the pocket, or, on the pinned families, a notch that a 4x10x8 mm pin bridges 4 mm into each side.
That fit is 0.1 mm a side, twice, which is what says it is intended. `data/families.json` states
the lattice once and `families.test.ts` re-derives every number of it from the meshes.

Two things follow that are easy to get wrong. A shelf's `h` is **depth**, not height, so it
cannot line up with a neighbour by grid height and does not try to. And a shelf reaching further
than the bracket beside it has ribs hanging in the air — invisible in a render, so the issues
panel says so.

### When a part is wrong

`planner/data/overrides.json` corrects individual parts that disagree with their family, in one
of two ways. Ten have a *name* that disagrees with their geometry, and get corrected dimensions.
Three are drawn round from the rest of their family — a rack whose slots open at the panel
instead of into the room — and get a quarter or a half turn about wall Z, which the indexer bakes
into the model, the thumbnail and every measurement taken from it. All **13** are in the
community `Tool_hooks` folder, 2.4% of the library. Two more parts are recorded as deliberately
*not* corrected, with the reason, so nobody re-litigates them later.

`npm run audit --workspace @ddd-planner/indexer` checks every part against the rules its family
claims and prints what disagrees. It applies the overrides and reports what remains, so it is a
regression check rather than a one-off.

### Undo remembers moments, not actions

<kbd>⌘Z</kbd> / <kbd>Ctrl+Z</kbd>, with buttons in the header beside Import — which is the
one control here that discards an hour of work without asking.

History holds **the parts on the wall**: added, removed, moved, turned. Not the wall size,
not the assembly library, not the selection or the cross-section. Each entry is a *moment* —
the placements exactly as they stood, with their ids intact. That last part is the whole
design: every model on screen is keyed by placement id, the selection names them, and a
dismissed issue's id is built out of them, so a history that re-issued ids would remount the
entire wall to undo moving one bracket.

Two consequences worth knowing before they surprise you:

- **A resize makes no entry, but a moment carries the board it stood on.** You cannot undo
  your way out of typing a wall size — but undoing an *import* puts your parts back on the
  wall they were on, rather than stranding them on the imported one. The cost is that undoing
  far enough back past a resize takes the old size with it.
- **A held arrow key is one undo.** `KeyboardEvent.repeat` says whether the user pressed the
  key or the OS did, so sliding a part across the wall costs one step rather than thirty.

Nothing calls `record()`. Entries are pushed by a subscription watching `placements` change,
because the alternative fails *silently*: an action added later that forgot its record call
would leave undo quietly skipping it, surfacing months later as "sometimes Ctrl+Z jumps too
far back". Recording is the default and switching it off is something you write on purpose —
which happens in exactly two places, the arrival restore and a repeating key.

### A copied selection is an assembly nobody named

<kbd>⌘C</kbd> / <kbd>⌘X</kbd> / <kbd>⌘V</kbd>, with buttons for the people who have no keys —
a phone has no <kbd>⌘V</kbd>, and this planner takes touch seriously enough to have built
tap-to-place around it.

Copy adds no domain concept. `relativeParts` already rebases a group onto its own bottom-left
corner and `absoluteParts` puts it back down on an anchor, which is exactly what a clipboard
is; so a clipping is stored as an assembly, and pasting travels the same road as dropping a
saved assembly from the sidebar — including the same `clampGroupDelta` correction that keeps
it on the board. `core/clipboard.ts` adds a wire format and nothing else, sharing its row
codec with the document so the two cannot drift apart.

**A paste lands beside the original, not on top of it** — shifted right by the group's full
column span, so a bay copied to be repeated along the wall sits flush against the one it came
from and raises no overlap warning. Press paste again and it marches another span along. The
span has to be measured by what the parts *cover*, not by `assemblyExtent`, which counts
anchor columns: a single three-column plate occupies one anchor and would otherwise be pasted
on top of itself.

It goes on the clipboard as `text/plain` JSON. That is ugly if you paste it into a chat
window, and it is the point — you *can* paste it into a chat window, and whoever reads it can
paste it back into their planner and get your shelf. Same trade the share link makes.

Three things are less obvious than they look:

- **The wall does not always own <kbd>⌘C</kbd>.** There is a BOM full of part names and
  quantities someone may want in a shopping list, and parts are selected almost all the time
  here since anything you place arrives selected. So the wall takes the gesture only with a
  selection, no highlighted text, and focus outside any input.
- **Text that is not ours does nothing.** The session's own clipping is never consulted by a
  paste *event* — only by the Paste button, and only when the system clipboard cannot be read
  at all. Otherwise copying a URL elsewhere and pressing paste here would drop six brackets
  you copied twenty minutes ago onto the wall.
- **Paste skips parts this library lacks; import keeps them.** Deliberately different. Import
  restores a document, where dropping parts is lossy and a round trip should survive. A pasted
  unknown is inert — nothing renders it, the marquee cannot catch it, it cannot be clicked —
  so it is litter you can neither see nor remove.

---

## Running it

```sh
cd planner
npm ci
npm run index     # build the part library from the STLs (~17s)
npm run dev
```

`npm test` runs 582 tests across the three packages. `npm run typecheck` covers all three under
`strict` plus `noUncheckedIndexedAccess`.

### The spike check

```sh
npm run spike --workspace @ddd-planner/indexer
```

This assembles a `3x0 Flat Left` + `3x3 Spacer blank` + `3x0 Flat Right` with the real rules and
asserts the tab actually seats in the socket. **It runs in CI and the site does not publish if
it fails.**

It exists because it caught a real bug: a single sign convention had both sidepiece sockets
facing outward, so nothing would ever have mated — while every other test passed, because they
all checked one part in isolation. Assertions about a part on its own cannot catch a handedness
error.

---

## What it deliberately does not do

- **Horizontal Wall Control panels.** 19 parts mount to the 1/4" holes of a horizontal panel
  rather than the vertical slots. They stay in the catalog, searchable and downloadable, but
  they are flagged and the planner will not pretend their position means anything.
- **Panel tiling.** The wall is one free-size board. Real panels have roughly a 1 inch
  unslotted border, so the planner permits some layouts a tiled wall would not.
- **The 1/4" mounting holes.** The slots are cut through the board — the panel is drawn as the
  material around them and nothing stands in for a hole. The 1/4" holes on the interleaved
  inch grid are not cut, so they are the one place the board still disagrees with a real panel.
- **Print-plate packing.** The BOM tells you what to print, not how to arrange it.
- **Filament accuracy.** Grams assume 100% infill, so the number is an honest upper bound. The
  panel says so.
- **Tool hook vertical anchors are approximate.** A bounding box for a hook contains the
  tool-holding geometry, not just the mounting plate, so those parts hang from a slightly
  optimistic datum. Detecting the mounting plate in the mesh is the fix, and is not done.

---

## Validation is permissive, on purpose

Nothing is ever blocked. Parts mate magnetically, anything can be placed anywhere, and problems
surface as dismissible warnings in an issues panel: overlaps, height mismatches, parts with
nothing to mount to. Someone building something the library never anticipated should not have to
argue with the tool.

The catalog leans the same way — it re-ranks around what you last placed so compatible parts
rise to the top, and **hides nothing**.

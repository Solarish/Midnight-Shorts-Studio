# Doodle Path Editor — locked implementation brief

## Design read

An operator edits a path in the player first, then tunes how reusable doodle assets populate that path. Geometry and population are separate controls.

## Interaction contract

- `Draw path` enters creation mode; pointer movement stores normalized coordinates in `[0,1]`.
- In edit mode, drag a visible point to move it.
- Double-click a point removes it when at least two points remain.
- Double-click a segment inserts a projected point, allowing a bend without redrawing the path.
- `Show path guide` controls guide visibility independently from doodle rendering.

## Data contract

```ts
doodleAssets: [{ id, key, imagePath, kind, enabled }]
doodlePaths: [{ id, points, doodles: [{ id, assetId, pointIndex }], ...populationSettings }]
```

`doodles[]` is the stable placement list. Point edits update `pointIndex` references; asset toggles update only system `assetId`s and preserve custom image assets.

## Library behavior

- Twenty-five system entries are displayed in a responsive multi-row grid.
- Category tabs: all, academic, science, psychic, engineering, celebration, vlog, custom.
- Search filters name, category, and stable ID.
- Each tile is independently On/Off; no fixed 5×5 layout is assumed.
- Custom ComfyUI outputs append to the same registry and remain reusable.

## Acceptance criteria

- Legacy system IDs `doodle-09…25` toggle correctly.
- All 25 system entries render across multiple rows at desktop width.
- A path can be moved, bent, and reduced without losing its doodle placements.
- Empty system selection does not silently render stale system doodles.
- `npm run build --workspace=@psu-ava/control-web` and `npm run build --workspace=@psu-ava/remotion-studio` pass.

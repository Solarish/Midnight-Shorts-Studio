---
project: Midnight Shorts Studio Control Web
register: product
aesthetic_direction: technical / utilitarian
color_strategy: restrained
design_system: existing semantic CSS component vocabulary
design_variance: 4
motion_intensity: 2
visual_density: 7
---

## Design Read

A focused broadcast-workbench inspector where every shot is legible at a glance and detail appears only where an operator needs it.

## Signature

The **shot rail**: each CG block has a slim, colored type marker and a compact timing summary, making the editorial sequence readable as a vertical rundown rather than as a spreadsheet row.

## Color (locked)

| role | OKLCH | hex | use |
| --- | --- | --- | --- |
| background | oklch(0.13 0.02 255) | #0b1220 | page and inspector base |
| surface | oklch(0.17 0.02 255) | #111827 | controls and shot cards |
| elevated | oklch(0.21 0.025 255) | #162238 | active/editable grouping |
| text | oklch(0.91 0.02 255) | #e2e8f0 | primary text, 13.2:1 on background |
| muted | oklch(0.70 0.03 255) | #94a3b8 | labels, 6.7:1 on background |
| border | oklch(0.30 0.03 255) | #334155 | boundaries and focus-adjacent structure |
| accent | oklch(0.67 0.16 255) | #3b82f6 | focus and primary selection, 4.7:1 on background |
| danger | oklch(0.70 0.18 25) | #fca5a5 | destructive action |

## Type (locked)

| role | family | use | notes |
| --- | --- | --- | --- |
| body | existing system sans stack | editor controls | preserve application font metrics |
| utility | ui-monospace, SFMono-Regular, Menlo, monospace | millisecond and count values | tabular numerals where supported |

## Scales (locked)

- spacing: 4, 8, 12, 16, 20, 24 px
- radius: 6, 8, 12 px
- motion: 120ms base with `cubic-bezier(.16,1,.3,1)`; no bounce; honor reduced motion
- breakpoints: 640, 768, 1024, 1280 px

## Voice

Plain, operational, and concrete. Use `Add block`, `Enabled`, `Delete block`, `Duration`, `Photos`, `Stagger`, and `Blur`. Every screen must read as the same product if placed side by side.

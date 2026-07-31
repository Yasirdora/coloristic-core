# Coloristic Core

[![CI](https://github.com/Yasirdora/coloristic-core/actions/workflows/ci.yml/badge.svg)](https://github.com/Yasirdora/coloristic-core/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@coloristic.org/core)](https://www.npmjs.com/package/@coloristic.org/core)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

An accessibility-aware TypeScript color engine for deterministic OKLCH palettes, semantic UI roles, WCAG contrast audits, and production-ready design-token exports. The official project website is [coloristic.org](https://coloristic.org).

Coloristic Core is framework-independent, makes no network requests, and works in Node.js 20+ and modern browser toolchains.

> **Accessibility scope:** generated palettes are not universally accessible by themselves. The semantic `on*` colors are generated to meet their paired role's configured WCAG contrast target. Always test the actual UI, typography, states, and user workflows.

## Install

```sh
npm install @coloristic.org/core
```

## Quick start

```ts
import { auditPalette, createPalette, exportPalette } from "@coloristic.org/core";

const palette = createPalette({
  name: "Northstar",
  baseColor: "#2563eb",
  harmony: "split-complementary",
  count: 5,
  theme: "light",
  targetContrast: 4.5,
});

console.log(palette.roles.primary, palette.roles.onPrimary);
console.log(auditPalette(palette.colors).failingPairs);

const tokens = exportPalette(palette, "dtcg");
```

## What it does

1. Generates or normalizes a palette of up to 64 opaque colors.
2. Assigns semantic background roles and contrast-safe foreground partners.
3. Audits arbitrary foreground/background combinations with WCAG contrast ratios.
4. Suggests a nearby foreground repair when a pairing misses its target.
5. Exports portable tokens for web, mobile, design tools, and Adobe workflows.

Output is deterministic within a release: the same valid input and options produce the same
strings or bytes on supported runtimes. The engine uses no randomness, clock, locale, storage,
or network state, and declares and tests Culori `4.0.2`. A consumer-level override can replace
that resolution. Output compatibility is not promised across different Coloristic Core releases;
preserve the tested dependency resolution and retain fixtures when exact serialized output is part
of your application's contract.

## Create palettes

Generate an OKLCH harmony:

```ts
import { createPalette } from "@coloristic.org/core";

const palette = createPalette({
  name: "Product blue",
  baseColor: "oklch(58% 0.2 255)",
  harmony: "analogous",
  count: 6,
  baseIndex: 2,
  theme: "dark",
});
```

Supported harmonies are `monochromatic`, `complementary`, `split-complementary`, `analogous`, `triadic`, `tetradic`, and `square`.

Normalize an existing palette:

```ts
import { createPaletteFromColors } from "@coloristic.org/core";

const palette = createPaletteFromColors({
  name: "Existing brand",
  colors: ["#111827", "#475569", "#f97316", "#f8fafc", "#ffffff"],
  baseIndex: 2,
  theme: "light",
});
```

Palette inputs are limited to 64 colors, also exported as `MAX_PALETTE_SIZE`. `normalizeColor`
parses CSS color syntax, maps it to sRGB with CSS Color 4 OKLCH gamut mapping, and returns lowercase
six-digit hex. Opacity is evaluated after CSS parsing: an omitted alpha or parsed alpha of exactly
`1` is accepted, while any other parsed alpha and the `none` keyword are rejected. CSS parsers
clamp out-of-range alpha according to CSS rules, so a value above `100%` can parse as `1` and be
accepted. Coloristic Core never composites transparency against an assumed background. The
resolved contrast target is available as `palette.targetContrast`.

## Semantic roles

Every palette includes five base roles and a guaranteed foreground partner for each:

| Background role | Foreground partner | Intended use |
| --- | --- | --- |
| `primary` | `onPrimary` | Strong structural or action color |
| `secondary` | `onSecondary` | Supporting action or emphasis color |
| `accent` | `onAccent` | The exact base/anchor color at the default contrast target |
| `surface` | `onSurface` | Theme-aligned page or component background |
| `highlight` | `onHighlight` | Subtle selected or elevated region |

Assign roles directly when you already have normalized color choices:

```ts
import { assignPaletteRoles, getContrastRatio } from "@coloristic.org/core";

const roles = assignPaletteRoles(
  ["#111827", "#2563eb", "#f97316", "#f8fafc", "#ffffff"],
  { baseIndex: 1, theme: "light", targetContrast: 4.5 },
);

console.log(getContrastRatio(roles.onPrimary, roles.primary)); // >= 4.5
```

The guarantee applies to each documented `on*`/base-role pair at `targetContrast`. It does not mean every pair among the generated colors passes, nor does it guarantee accessibility for non-text UI, disabled states, gradients, images, or composited transparency.

## WCAG contrast

Audit a pairing:

```ts
import { auditContrast } from "@coloristic.org/core";

const result = auditContrast("#64748b", "#ffffff", {
  targetWcagRatio: 4.5,
});

if (!result.passesWcag) {
  console.log(result.wcagRatio, result.suggestedForeground);
}
```

Audit every ordered combination in a palette:

```ts
import { auditPalette } from "@coloristic.org/core";

const audit = auditPalette(palette.colors, { targetWcagRatio: 4.5 });

for (const failure of audit.failingPairs) {
  console.log(failure.foreground, failure.background, failure.wcagRatio);
}
```

`auditPalette` normalizes colors, collapses duplicate normalized values, excludes self-pairs, and
audits every remaining ordered foreground/background combination. Its frozen result contains
`n × (n - 1)` pairs for `n` unique colors. Contrast analysis is engineering guidance, not a
certification or legal-compliance determination.

## Color-vision simulation

```ts
import { simulateColorVision } from "@coloristic.org/core";

simulateColorVision("#ef4444", "deuteranopia");
```

Simulation is a design-review aid. It does not replace testing with users or assistive technology.

## Export formats

```ts
import { exportPalette } from "@coloristic.org/core";

exportPalette(palette, "css");
exportPalette(palette, "scss");
exportPalette(palette, "tailwind");
exportPalette(palette, "dtcg");
exportPalette(palette, "android");
exportPalette(palette, "ios");
exportPalette(palette, "json");
exportPalette(palette, "gpl");

const aseBytes = exportPalette(palette, "ase");
```

The DTCG exporter uses the [Design Tokens Community Group 2025.10 color object shape](https://www.designtokens.org/TR/2025.10/color/) with `colorSpace`, numeric `components`, `alpha`, and a hexadecimal fallback. All formats return strings except ASE, which returns `Uint8Array`.
Exporters validate and normalize the complete palette but never write files, start downloads, or
access the network. Literal `exportPalette` formats have narrowed return types; a runtime
`ExportFormat` variable produces `string | Uint8Array` and must be narrowed by the caller.

## API map

| Area | Public API |
| --- | --- |
| Palette orchestration | `createPalette`, `createPaletteFromColors` |
| Harmony | `generateHarmony`, `generateShades` |
| Semantic roles | `assignPaletteRoles` |
| Validation and conversion | `normalizeColor`, `normalizeColors`, `getColorValues`, `toSrgbComponents`, `MAX_PALETTE_SIZE`, `MAX_PALETTE_NAME_LENGTH` |
| WCAG | `auditContrast`, `auditPalette`, `getContrastRatio`, `getWcagLevel`, `suggestContrastFix` |
| Simulation | `simulateColorVision` |
| Export | `exportPalette`, plus the individual `to*` exporters |

Common defaults and bounds:

| API | Defaults and bounds |
| --- | --- |
| `createPalette` | `name: "Untitled palette"`, `harmony: "analogous"`, `count: 5`, `baseIndex: min(2, count - 1)`, `theme: "light"`, `targetContrast: 4.5` |
| `createPaletteFromColors` | `name: "Untitled palette"`, `harmony: "custom"`, `baseIndex: min(2, colors.length - 1)`, `theme: "light"`, `targetContrast: 4.5` |
| `generateHarmony` / `generateShades` | 5 colors / 11 shades; counts must be integers from 1 through 64 |
| Role and WCAG helpers | Default target `4.5`; contrast targets must be finite numbers from 1 through 21, inclusive |
| Names and palettes | Names are limited to 120 Unicode code points; palettes contain 1 through 64 colors |

`getColorValues` reports RGB as integer channels, HSL as degrees and percentages, OKLCH with
unit lightness plus chroma and hue, and CIE Lab in its native component scale.

### Error contract

Invalid public input throws `ColoristicError`. Its `code` is stable for programmatic handling;
the human-readable `message` may improve between releases.

| Code | Meaning |
| --- | --- |
| `EMPTY_PALETTE` | No colors were supplied |
| `INVALID_ARGUMENT` | An option, mode, name, or argument shape is unsupported |
| `INVALID_COLOR` | A color is invalid, incomplete, non-finite, or non-opaque after parsing |
| `INVALID_CONTRAST_TARGET` | A contrast target is outside the inclusive 1–21 range |
| `INVALID_COUNT` | A requested harmony or shade count is invalid |
| `INVALID_INDEX` | `baseIndex` does not identify a palette color |
| `INVALID_PALETTE` | A palette passed to an exporter violates the `Palette` contract |
| `PALETTE_TOO_LARGE` | More than 64 colors were supplied |
| `UNSUPPORTED_FORMAT` | An unknown export format reached the runtime API |

## Development

```sh
npm ci
npm run check
```

The release gate checks formatting and lint rules, TypeScript, tests and coverage thresholds, both
module builds, packed ESM/CommonJS runtime and type consumers, and the installed license. See
[CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for package invariants and extension guidance.

## Support and releases

- Reporting a vulnerability: [SECURITY.md](SECURITY.md)
- Release history: [CHANGELOG.md](CHANGELOG.md)

Coloristic Core follows Semantic Versioning. Patch releases preserve the public API; while the
version is `0.x`, minor releases may contain breaking changes documented in the changelog.


## License

[MIT](LICENSE) © 2026 [Yasir Dora.](https://ysr.design)

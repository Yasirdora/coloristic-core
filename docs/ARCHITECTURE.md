# Architecture

Coloristic Core is a pure TypeScript library with one public barrel, no network or storage behavior,
no UI-framework dependency, and no consumer-installed runtime dependencies. The repository vendors
the audited Culori primitives used by the engine as readable, unminified code and ships their MIT
attribution in `THIRD_PARTY_NOTICES.md`.

## Invariants

- Colors crossing the public boundary are validated, normalized to opaque sRGB hexadecimal values, and never silently composited.
- Imported and generated palettes contain at most 64 colors.
- Returned palettes, color arrays, and semantic role records are readonly and frozen at runtime.
- Each `on*` role meets the configured WCAG ratio against its matching base role. This paired guarantee does not apply to every arbitrary color combination.
- Given the same valid input and options, palette generation, audits, role assignment, and exports are deterministic and side-effect free.
- Invalid public input fails with `ColoristicError` and a stable machine-readable code.

## Modules

| Module | Responsibility |
| --- | --- |
| `color.ts` | Parsing, opaque-color validation, normalization, and color-space values |
| `harmony.ts` | Deterministic OKLCH harmony and shade generation |
| `roles.ts` | Theme-aware semantic role selection and paired WCAG foregrounds |
| `accessibility.ts` | WCAG ratios, levels, audits, suggested repairs, and vision simulation |
| `palette.ts` | High-level orchestration and immutable palette results |
| `exporters.ts` | Pure serialization to documented design-token and file formats |
| `errors.ts` | Stable public error type and codes |
| `types.ts` | Shared public contracts |
| `index.ts` | The only supported public import surface |

Dependencies flow from orchestration toward focused utilities; focused modules must not import the public barrel. Exporters consume normalized palette data and must not mutate it.

## Extending the package

For a new harmony, add the mode to the public type, implement deterministic generation within the 64-color boundary, and test representative hues plus achromatic input.

For a new exporter, keep serialization pure, return a runtime-portable value (`string` or `Uint8Array`), define escaping rules, add exact fixtures, document the format, and export it through `index.ts`.

For a new semantic role, add its matching `on*` role in the same change and prove the configured contrast target at boundary cases. Never describe a role set as universally accessible.

Public API changes require TSDoc, behavioral tests, README and migration updates, a changelog entry, and a passing installed-package smoke test.

# Changelog

All notable changes are documented here. This project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.2] - 2026-08-01

### Security

- Removed the consumer-facing Culori runtime dependency and its pre-minified package artifacts from
  the installed dependency tree. Coloristic Core now vendors its audited parser and conversion
  primitives as readable, unminified code with the upstream MIT attribution included.

### Performance

- **accessibility:** optimize contrast search bounds to break early on floating-point precision limits, saving CPU cycles (#42)

### Changed

- Added release and package-smoke assertions that prevent runtime dependencies, external Culori
  imports, or missing third-party attribution from returning in future releases.

### Build

- **deps:** bump vitest from 4.1.9 to 4.1.10 (#44)
- **ci:** automated codebase formatting (#45)

## [0.1.1] - 2026-07-29

### Fixed

- Prevented extreme black and white harmony anchors from producing duplicate colors at large palette sizes while preserving the exact anchor.
- Wrapped rounded HSL and exported OKLCH hues into the canonical 0–359 degree range instead of emitting 360.

### Changed

- Added format-specific `exportPalette` overloads so literal `"ase"` calls infer `Uint8Array` and literal text formats infer `string`.
- Declared and tested Culori `4.0.2` exactly to keep the default parser and gamut-mapping resolution stable.
- Clarified normalization, alpha, determinism, errors, defaults, audit, and exporter contracts.
- Strengthened the release gate with package-lock, changelog, installed-license, and packed TypeScript-consumer validation.
- Removed the obsolete prerelease migration guide from the published package.

## [0.1.0] - 2026-07-28

### Added

- Deterministic OKLCH harmony and shade generation for palettes up to 64 colors.
- Accessibility-aware semantic roles for light and dark themes, with WCAG-targeted `onPrimary`, `onSecondary`, `onAccent`, `onSurface`, and `onHighlight` pairs.
- WCAG contrast audits, palette-wide pair reports, suggested foreground repairs, and color-vision simulation.
- Strict color validation, including explicit rejection of non-opaque colors.
- Portable CSS, SCSS, Tailwind, Android, iOS, JSON, GPL, ASE, and DTCG exporters.
- Official publication under the domain-backed `@coloristic.org/core` npm scope.
- ESM, CommonJS, and TypeScript declaration builds.
- Automated formatting, linting, coverage, package-install smoke tests, and trusted npm publishing gates.

[Unreleased]: https://github.com/Yasirdora/coloristic-core/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/Yasirdora/coloristic-core/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/Yasirdora/coloristic-core/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Yasirdora/coloristic-core/tree/v0.1.0

# Migration guide

This guide covers migration from prerelease snapshots of Coloristic Core that exposed APCA helpers, positional role arguments, and five semantic roles.

## 1. Remove APCA usage

Coloristic Core now has a WCAG-only accessibility surface. Remove imports of:

- `APCA_VERSION`
- `getApcaLc`
- `getApcaLevel`
- `getApcaMinimumLc`
- APCA-specific types and text metrics

Use `getContrastRatio`, `getWcagLevel`, `auditContrast`, and `auditPalette` instead.

```ts
// Before
const result = auditContrast(foreground, background, {
  targetWcagRatio: 4.5,
  textMetrics: { fontSizePx: 16, fontWeight: 400 },
});
console.log(result.apcaLc, result.passesApca);

// After
const result = auditContrast(foreground, background, {
  targetWcagRatio: 4.5,
});
console.log(result.wcagRatio, result.passesWcag);
```

`ContrastAudit` no longer contains APCA fields. `PaletteAudit` no longer contains text metrics, and pass/fail grouping uses only the configured WCAG target.

## 2. Use role options instead of positional arguments

```ts
// Before
const roles = assignPaletteRoles(colors, 2, "dark");

// After
const roles = assignPaletteRoles(colors, {
  baseIndex: 2,
  theme: "dark",
  targetContrast: 4.5,
});
```

The second argument is now an options object. Omitting it uses library defaults.

## 3. Adopt paired foreground roles

`PaletteRoles` now includes `onPrimary`, `onSecondary`, `onAccent`, `onSurface`, and `onHighlight`. Replace ad hoc foreground selection with the matching partner:

```ts
button.style.backgroundColor = palette.roles.primary;
button.style.color = palette.roles.onPrimary;
```

Each `on*` color is generated to meet the configured WCAG ratio against its own base role. Do not infer that arbitrary combinations elsewhere in the palette pass.

If you destructure or serialize roles, update snapshots and schemas for all ten keys.

`CreatePaletteOptions` and `CreatePaletteFromColorsOptions` now accept `targetContrast`. The resolved value is persisted as `palette.targetContrast` so consumers and exported artifacts can retain the generation intent.

## 4. Validate inputs before the boundary

The library rejects:

- non-opaque colors, even when a format could otherwise be parsed;
- palette or harmony requests larger than `MAX_PALETTE_SIZE` (64 colors).

Out-of-range or non-integer `baseIndex` values now fail explicitly with `INVALID_INDEX`; they are no longer silently clamped.

If an application previously accepted transparency, composite it against a known background in application code before passing the resulting opaque color to Coloristic Core.

## 5. Integrate into the Coloristic application

Adopt the package incrementally:

1. Replace site-local WCAG, color-vision, and normalization utilities.
2. Replace harmony and shade generation.
3. Replace semantic role assignment and wire every `on*` role into token consumers.
4. Migrate exporters with fixture coverage.
5. Remove superseded local implementations only after application tests pass.

The package exporters intentionally use a DTCG color object rather than a hexadecimal string value. ASE output is `Uint8Array`; wrap it in a `Blob` only at a browser download boundary.

Before deleting site-local code, compare fixtures for every harmony mode, light and dark roles, WCAG pairs, all export formats, invalid/non-opaque colors, and the 64-color boundary.

## 6. Move from a local archive to npm

The public package now uses the official domain-backed scope `@coloristic.org/core`. Replace any prerelease dependency on `@coloristic/core` and update all imports to the new scope before installing version 0.1.0.

For release-candidate integration:

```sh
npm install /absolute/path/to/coloristic.org-core-0.1.0.tgz
```

After the public release:

```sh
npm install @coloristic.org/core@^0.1.0
```

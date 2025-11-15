import { validateContrastTarget } from "./accessibility.js";
import { normalizeColors } from "./color.js";
import { ColoristicError } from "./errors.js";
import { generateHarmony } from "./harmony.js";
import { assignPaletteRoles } from "./roles.js";
import {
  MAX_PALETTE_NAME_LENGTH,
  type CreatePaletteFromColorsOptions,
  type CreatePaletteOptions,
  type HarmonyMode,
  type Palette,
  type ThemeMode,
} from "./types.js";

const HARMONIES = new Set<HarmonyMode>([
  "custom",
  "monochromatic",
  "complementary",
  "split-complementary",
  "analogous",
  "triadic",
  "tetradic",
  "square",
]);
const THEMES = new Set<ThemeMode>(["light", "dark"]);

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function cleanName(name: string | undefined): string {
  if (name !== undefined && typeof name !== "string") {
    throw new ColoristicError("INVALID_ARGUMENT", "Palette name must be a string.");
  }
  const value = name?.trim().normalize("NFC");
  if (!value) return "Untitled palette";
  if (hasUnpairedSurrogate(value)) {
    throw new ColoristicError("INVALID_ARGUMENT", "Palette name must contain valid Unicode text.");
  }
  if ([...value].length > MAX_PALETTE_NAME_LENGTH) {
    throw new ColoristicError(
      "INVALID_ARGUMENT",
      `Palette name cannot exceed ${MAX_PALETTE_NAME_LENGTH} Unicode code points.`,
    );
  }
  return value;
}

function assertOptions(
  value: unknown,
  label: string,
): asserts value is Record<PropertyKey, unknown> {
  if (!isRecord(value)) {
    throw new ColoristicError("INVALID_ARGUMENT", `${label} options must be an object.`);
  }
}

function validateImportedHarmony(value: HarmonyMode): HarmonyMode {
  if (typeof value !== "string" || !HARMONIES.has(value)) {
    throw new ColoristicError("INVALID_ARGUMENT", `Unsupported harmony: ${String(value)}.`);
  }
  return value;
}

function validateTheme(value: ThemeMode): ThemeMode {
  if (typeof value !== "string" || !THEMES.has(value)) {
    throw new ColoristicError("INVALID_ARGUMENT", `Unsupported theme: ${String(value)}.`);
  }
  return value;
}

/**
 * Creates a deeply immutable semantic palette from one base color and a harmony rule.
 *
 * @throws {@link ColoristicError} for missing/non-object options, invalid colors,
 * unsupported modes, invalid counts/indexes, names, themes, or contrast targets.
 */
export function createPalette(options: CreatePaletteOptions): Palette {
  assertOptions(options, "createPalette");
  const name = cleanName(options.name);
  const count = options.count ?? 5;
  const baseIndex = options.baseIndex ?? Math.min(2, count - 1);
  const harmony = options.harmony ?? "analogous";
  const theme = validateTheme(options.theme ?? "light");
  const targetContrast = validateContrastTarget(options.targetContrast ?? 4.5, "targetContrast");
  const colors = generateHarmony(options.baseColor, harmony, count, baseIndex);
  const roles = assignPaletteRoles(colors, { baseIndex, theme, targetContrast });
  return Object.freeze({
    name,
    harmony,
    colors,
    baseIndex,
    theme,
    targetContrast,
    roles,
  });
}

/**
 * Creates a deeply immutable semantic palette from an existing color list.
 *
 * @throws {@link ColoristicError} for missing/non-object options, invalid colors,
 * unsupported modes, invalid indexes, names, themes, sizes, or contrast targets.
 */
export function createPaletteFromColors(options: CreatePaletteFromColorsOptions): Palette {
  assertOptions(options, "createPaletteFromColors");
  const name = cleanName(options.name);
  const harmony = validateImportedHarmony(options.harmony ?? "custom");
  const theme = validateTheme(options.theme ?? "light");
  const targetContrast = validateContrastTarget(options.targetContrast ?? 4.5, "targetContrast");
  const colors = normalizeColors(options.colors);
  const baseIndex = options.baseIndex ?? Math.min(2, colors.length - 1);
  const roles = assignPaletteRoles(colors, { baseIndex, theme, targetContrast });
  return Object.freeze({
    name,
    harmony,
    colors,
    baseIndex,
    theme,
    targetContrast,
    roles,
  });
}

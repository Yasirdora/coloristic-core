import { formatHex, oklch, parse, toGamut, type Oklch } from "culori";
import { normalizeColor } from "./color.js";
import { ColoristicError } from "./errors.js";
import { MAX_PALETTE_SIZE, type HarmonyMode } from "./types.js";

const DEFAULT_COUNT = 5;
const mapToSrgb = toGamut("rgb", "oklch");
const GENERATED_HARMONIES = new Set<Exclude<HarmonyMode, "custom">>([
  "monochromatic",
  "complementary",
  "split-complementary",
  "analogous",
  "triadic",
  "tetradic",
  "square",
]);

function normalizeHue(hue: number | undefined): number {
  return (((hue ?? 0) % 360) + 360) % 360;
}

function readOklch(input: string): Oklch {
  const color = oklch(parse(normalizeColor(input)));
  if (!color || !Number.isFinite(color.l) || !Number.isFinite(color.c)) {
    throw new ColoristicError(
      "INVALID_COLOR",
      `Could not convert ${JSON.stringify(input)} to OKLCH.`,
    );
  }
  return color;
}

function toHex(color: Oklch): string {
  const mapped = mapToSrgb(color);
  const hex = mapped ? formatHex(mapped) : undefined;
  if (!hex) {
    throw new ColoristicError(
      "INVALID_COLOR",
      "Could not convert the generated OKLCH color to sRGB.",
    );
  }
  return hex.toLowerCase();
}

function validateCount(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > MAX_PALETTE_SIZE) {
    throw new ColoristicError(
      "INVALID_COUNT",
      `Palette size must be an integer between 1 and ${MAX_PALETTE_SIZE}.`,
    );
  }
  return value;
}

function validateBaseIndex(value: number, count: number): number {
  if (!Number.isInteger(value) || value < 0 || value >= count) {
    throw new ColoristicError(
      "INVALID_INDEX",
      `baseIndex must be an integer between 0 and ${count - 1}.`,
    );
  }
  return value;
}

function validateHarmony(mode: Exclude<HarmonyMode, "custom">): Exclude<HarmonyMode, "custom"> {
  if (typeof mode !== "string" || !GENERATED_HARMONIES.has(mode)) {
    throw new ColoristicError(
      "INVALID_ARGUMENT",
      `Unsupported generated harmony: ${String(mode)}.`,
    );
  }
  return mode;
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function patternOffset(pattern: readonly number[], relativeIndex: number): number {
  return pattern[positiveModulo(relativeIndex, pattern.length)] ?? 0;
}

function harmonyHue(
  mode: Exclude<HarmonyMode, "custom">,
  baseHue: number,
  relativeIndex: number,
): number {
  switch (mode) {
    case "monochromatic":
      return baseHue;
    case "complementary":
      return baseHue + patternOffset([0, 180], relativeIndex);
    case "split-complementary":
      return baseHue + patternOffset([0, 150, 210], relativeIndex);
    case "analogous":
      return baseHue + relativeIndex * 15;
    case "triadic":
      return baseHue + patternOffset([0, 120, 240], relativeIndex);
    case "tetradic":
      return baseHue + patternOffset([0, 60, 180, 240], relativeIndex);
    case "square":
      return baseHue + patternOffset([0, 90, 180, 270], relativeIndex);
  }
}

function partnerColor(hue: number, base: Oklch, relativePosition: number): string {
  const lightness = Math.max(0.1, Math.min(0.92, (base.l ?? 0.55) + relativePosition * 0.3));
  const sourceChroma = base.c ?? 0;
  const chroma =
    sourceChroma <= 1e-6
      ? 0
      : Math.max(0, Math.min(0.32, sourceChroma * (1 - Math.abs(relativePosition) * 0.35)));
  return toHex({ mode: "oklch", l: lightness, c: chroma, h: normalizeHue(hue) });
}

/**
 * Generates an immutable, deterministic OKLCH harmony around an exact base-color anchor.
 *
 * Hue geometry is rotated relative to `baseIndex`, so moving the anchor preserves every
 * mode's intended angular relationships rather than replacing one of its partner hues.
 *
 * @throws {@link ColoristicError} for an invalid color, harmony, count, or base index.
 */
export function generateHarmony(
  baseColor: string,
  mode: Exclude<HarmonyMode, "custom">,
  count = DEFAULT_COUNT,
  baseIndex = Math.min(2, count - 1),
): readonly string[] {
  const size = validateCount(count);
  const anchorIndex = validateBaseIndex(baseIndex, size);
  const harmony = validateHarmony(mode);
  const anchor = normalizeColor(baseColor);
  const base = readOklch(anchor);
  const baseHue = normalizeHue(base.h);
  const maximumDistance = Math.max(anchorIndex, size - 1 - anchorIndex, 1);

  return Object.freeze(
    Array.from({ length: size }, (_, index) => {
      if (index === anchorIndex) return anchor;
      const relativeIndex = index - anchorIndex;
      return partnerColor(
        harmonyHue(harmony, baseHue, relativeIndex),
        base,
        relativeIndex / maximumDistance,
      );
    }),
  );
}

/**
 * Generates an immutable light-to-dark OKLCH shade scale while preserving source hue.
 *
 * @throws {@link ColoristicError} for an invalid color or step count.
 */
export function generateShades(color: string, steps = 11): readonly string[] {
  const count = validateCount(steps);
  if (count === 1) return Object.freeze([normalizeColor(color)]);
  const base = readOklch(color);
  return Object.freeze(
    Array.from({ length: count }, (_, index) => {
      const progress = index / (count - 1);
      return toHex({ ...base, l: 0.95 - progress * 0.9 });
    }),
  );
}

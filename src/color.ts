import { converter, formatHex, hsl, oklch, parse, rgb, toGamut } from "./vendor/culori.js";
import { ColoristicError } from "./errors.js";
import { MAX_PALETTE_SIZE, type ColorValues } from "./types.js";

const toLab = converter("lab");
const toRgb = converter("rgb");
const mapToSrgb = toGamut("rgb", "oklch");

function roundedHue(hue: number | undefined): number {
  return ((Math.round(hue ?? 0) % 360) + 360) % 360;
}

function invalidColor(input: unknown, detail = "Invalid color"): never {
  let rendered: string;
  try {
    rendered = JSON.stringify(input) ?? String(input);
  } catch {
    try {
      rendered = String(input);
    } catch {
      rendered = "<unprintable value>";
    }
  }
  throw new ColoristicError("INVALID_COLOR", `${detail}: ${rendered}`);
}

/**
 * Converts an opaque CSS color to canonical lowercase six-digit sRGB hex.
 *
 * Colors containing `none`, missing/non-finite components, or alpha other than exactly
 * `1` are rejected because silently flattening transparency would corrupt contrast data.
 *
 * @throws {@link ColoristicError} when `input` is not a valid opaque CSS color.
 */
export function normalizeColor(input: string): string {
  if (typeof input !== "string") invalidColor(input, "Color must be a string");
  const source = input.trim();
  if (source.length === 0 || /\bnone\b/i.test(source)) invalidColor(input);

  const parsed = parse(source);
  if (!parsed) invalidColor(input);
  const converted = toRgb(parsed);
  if (
    !converted ||
    !Number.isFinite(converted.r) ||
    !Number.isFinite(converted.g) ||
    !Number.isFinite(converted.b)
  ) {
    invalidColor(input, "Color components must be finite");
  }
  if ("alpha" in converted && (!Number.isFinite(converted.alpha) || converted.alpha !== 1)) {
    invalidColor(input, "Color must be fully opaque");
  }

  // Culori's default `toGamut` settings implement the CSS Color 4 OKLCH
  // local-MINDE gamut-mapping algorithm instead of raw RGB channel clipping.
  const mapped = mapToSrgb(parsed);
  const hex = mapped ? formatHex(mapped) : undefined;
  if (!hex) invalidColor(input);
  return hex.toLowerCase();
}

/**
 * Normalizes and freezes a non-empty list of at most {@link MAX_PALETTE_SIZE} colors.
 *
 * @throws {@link ColoristicError} when the input is not an array, is empty or oversized,
 * or contains an invalid or non-opaque color.
 */
export function normalizeColors(inputs: readonly string[]): readonly string[] {
  if (!Array.isArray(inputs)) {
    throw new ColoristicError("INVALID_ARGUMENT", "Palette colors must be an array.");
  }
  if (inputs.length === 0) {
    throw new ColoristicError("EMPTY_PALETTE", "A palette must contain at least one color.");
  }
  if (inputs.length > MAX_PALETTE_SIZE) {
    throw new ColoristicError(
      "PALETTE_TOO_LARGE",
      `A palette cannot contain more than ${MAX_PALETTE_SIZE} colors.`,
    );
  }

  const normalized = Array.from({ length: inputs.length }, (_, index) =>
    normalizeColor(inputs[index] as string),
  );
  return Object.freeze(normalized);
}

/**
 * Returns immutable RGB, HSL, OKLCH and Lab representations of an opaque CSS color.
 *
 * @throws {@link ColoristicError} when `input` is not a valid opaque CSS color.
 */
export function getColorValues(input: string): ColorValues {
  const hex = normalizeColor(input);
  const parsed = parse(hex);
  if (!parsed) invalidColor(input);

  const rgbValue = rgb(parsed);
  const hslValue = hsl(parsed);
  const oklchValue = oklch(parsed);
  const labValue = toLab(parsed);
  if (!rgbValue || !hslValue || !oklchValue || !labValue) {
    invalidColor(input, "Could not convert color");
  }

  return Object.freeze({
    hex,
    rgb: Object.freeze({
      r: Math.round((rgbValue.r ?? 0) * 255),
      g: Math.round((rgbValue.g ?? 0) * 255),
      b: Math.round((rgbValue.b ?? 0) * 255),
    }),
    hsl: Object.freeze({
      h: roundedHue(hslValue.h),
      s: Math.round((hslValue.s ?? 0) * 100),
      l: Math.round((hslValue.l ?? 0) * 100),
    }),
    oklch: Object.freeze({
      l: oklchValue.l ?? 0,
      c: oklchValue.c ?? 0,
      h: oklchValue.h ?? 0,
    }),
    lab: Object.freeze({
      l: labValue.l ?? 0,
      a: labValue.a ?? 0,
      b: labValue.b ?? 0,
    }),
  });
}

/**
 * Returns an opaque color's clamped sRGB components in the inclusive range 0–1.
 *
 * @throws {@link ColoristicError} when `input` is not a valid opaque CSS color.
 */
export function toSrgbComponents(input: string): readonly [number, number, number] {
  const parsed = toRgb(normalizeColor(input));
  if (!parsed) invalidColor(input, "Could not convert color to sRGB");
  const round = (value: number | undefined) =>
    Number(Math.max(0, Math.min(1, value ?? 0)).toFixed(6));
  const components: [number, number, number] = [round(parsed.r), round(parsed.g), round(parsed.b)];
  return Object.freeze(components);
}

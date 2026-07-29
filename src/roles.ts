import { converter, differenceEuclidean, formatHex, toGamut } from "./vendor/culori.js";
import { getContrastRatio, suggestContrastFix, validateContrastTarget } from "./accessibility.js";
import { normalizeColors } from "./color.js";
import { ColoristicError } from "./errors.js";
import type { AssignPaletteRolesOptions, PaletteRoles, ThemeMode } from "./types.js";

const toOklch = converter("oklch");
const oklchDistance = differenceEuclidean("oklch");
const mapToSrgb = toGamut("rgb", "oklch");
const THEMES = new Set<ThemeMode>(["light", "dark"]);

interface AnalyzedColor {
  readonly hex: string;
  readonly l: number;
  readonly c: number;
  readonly index: number;
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function analyze(hex: string, index: number): AnalyzedColor {
  const value = toOklch(hex);
  if (!value || !Number.isFinite(value.l) || !Number.isFinite(value.c)) {
    throw new ColoristicError(
      "INVALID_COLOR",
      `Could not convert ${JSON.stringify(hex)} to OKLCH.`,
    );
  }
  return Object.freeze({ hex, l: value.l ?? 0, c: value.c ?? 0, index });
}

function shift(hex: string, lightness: number, chromaScale = 1): string {
  const value = toOklch(hex);
  if (!value) {
    throw new ColoristicError(
      "INVALID_COLOR",
      `Could not convert ${JSON.stringify(hex)} to OKLCH.`,
    );
  }
  const mapped = mapToSrgb({
    ...value,
    l: Math.max(0, Math.min(1, lightness)),
    c: Math.max(0, Math.min(0.32, (value.c ?? 0) * chromaScale)),
  });
  const shifted = mapped ? formatHex(mapped) : undefined;
  if (!shifted) {
    throw new ColoristicError("INVALID_COLOR", "Could not encode a generated semantic role.");
  }
  return shifted.toLowerCase();
}

function firstBy(
  colors: readonly AnalyzedColor[],
  compare: (left: AnalyzedColor, right: AnalyzedColor) => number,
  excluded: ReadonlySet<string> = new Set(),
): AnalyzedColor | undefined {
  return colors
    .filter((color) => !excluded.has(color.hex))
    .sort((left, right) => compare(left, right) || left.index - right.index)[0];
}

function distance(from: string, to: string): number {
  const left = toOklch(from);
  const right = toOklch(to);
  if (!left || !right) return Number.POSITIVE_INFINITY;
  const result = oklchDistance(left, right);
  return Number.isFinite(result) ? result : Number.POSITIVE_INFINITY;
}

function readablePair(
  initialBackground: string,
  target: number,
  theme: ThemeMode,
): readonly [background: string, foreground: string] {
  const blackRatio = getContrastRatio("#000000", initialBackground);
  const whiteRatio = getContrastRatio("#ffffff", initialBackground);
  if (Math.max(blackRatio, whiteRatio) >= target) {
    return Object.freeze(
      blackRatio >= whiteRatio ? [initialBackground, "#000000"] : [initialBackground, "#ffffff"],
    );
  }

  // Above ~4.58:1 an arbitrary unchanged background may have no readable black/white
  // foreground. Synthesize the smallest passing background adjustment instead.
  const darkBackground = suggestContrastFix(initialBackground, "#ffffff", target) ?? "#000000";
  const lightBackground = suggestContrastFix(initialBackground, "#000000", target) ?? "#ffffff";
  const darkDistance = distance(initialBackground, darkBackground);
  const lightDistance = distance(initialBackground, lightBackground);

  if (darkDistance < lightDistance || (darkDistance === lightDistance && theme === "dark")) {
    return Object.freeze([darkBackground, "#ffffff"]);
  }
  return Object.freeze([lightBackground, "#000000"]);
}

function validateOptions(
  options: AssignPaletteRolesOptions,
  colorCount: number,
): Required<AssignPaletteRolesOptions> {
  const candidate: unknown = options;
  if (!isRecord(candidate)) {
    throw new ColoristicError("INVALID_ARGUMENT", "Role options must be an object.");
  }

  const baseIndex = options.baseIndex ?? Math.min(2, colorCount - 1);
  if (!Number.isInteger(baseIndex) || baseIndex < 0 || baseIndex >= colorCount) {
    throw new ColoristicError(
      "INVALID_INDEX",
      `baseIndex must be an integer between 0 and ${colorCount - 1}.`,
    );
  }
  const theme = options.theme ?? "light";
  if (typeof theme !== "string" || !THEMES.has(theme)) {
    throw new ColoristicError("INVALID_ARGUMENT", `Unsupported theme: ${String(theme)}.`);
  }
  const targetContrast = validateContrastTarget(options.targetContrast ?? 4.5, "targetContrast");
  return Object.freeze({ baseIndex, theme, targetContrast });
}

/**
 * Assigns immutable semantic backgrounds and readable `on*` foregrounds to a palette.
 *
 * Assignment is deterministic. Each `on*` pair meets `targetContrast` (4.5:1 by
 * default). For targets above the universal black/white guarantee, semantic background
 * roles may be minimally synthesized; the original palette color array is never changed.
 *
 * @throws {@link ColoristicError} for invalid colors, options, theme, index, or target.
 */
export function assignPaletteRoles(
  inputColors: readonly string[],
  options: AssignPaletteRolesOptions = {},
): PaletteRoles {
  const colors = normalizeColors(inputColors);
  const { baseIndex, theme, targetContrast } = validateOptions(options, colors.length);
  const analyzed = colors.map(analyze);
  const anchor = colors[baseIndex];
  if (anchor === undefined) {
    throw new ColoristicError("INVALID_INDEX", "baseIndex did not resolve to a palette color.");
  }

  const ascendingLightness = (left: AnalyzedColor, right: AnalyzedColor) =>
    left.l - right.l || right.c - left.c;
  const descendingLightness = (left: AnalyzedColor, right: AnalyzedColor) =>
    right.l - left.l || left.c - right.c;

  const surfaceCandidate = firstBy(
    analyzed.filter((color) => (theme === "light" ? color.l >= 0.9 : color.l <= 0.2)),
    theme === "light" ? descendingLightness : ascendingLightness,
  )?.hex;
  const primaryCandidate = firstBy(
    analyzed,
    theme === "light" ? ascendingLightness : descendingLightness,
    new Set(surfaceCandidate ? [surfaceCandidate] : []),
  )?.hex;

  const surface = surfaceCandidate ?? shift(anchor, theme === "light" ? 0.97 : 0.12, 0.25);
  const primary = primaryCandidate ?? shift(anchor, theme === "light" ? 0.22 : 0.88, 0.55);
  const excluded = new Set([surface, primary, anchor]);
  const highlightCandidates = analyzed.filter((color) =>
    theme === "light" ? color.l >= 0.8 : color.l <= 0.3,
  );
  const highlight =
    firstBy(
      highlightCandidates,
      theme === "light" ? descendingLightness : ascendingLightness,
      excluded,
    )?.hex ?? shift(anchor, theme === "light" ? 0.9 : 0.25, 0.45);
  excluded.add(highlight);
  const secondary =
    firstBy(
      analyzed,
      (left, right) =>
        Math.abs(left.l - (theme === "light" ? 0.5 : 0.65)) -
          Math.abs(right.l - (theme === "light" ? 0.5 : 0.65)) || left.c - right.c,
      excluded,
    )?.hex ?? shift(anchor, theme === "light" ? 0.52 : 0.68, 0.6);

  const [readablePrimary, onPrimary] = readablePair(primary, targetContrast, theme);
  const [readableSecondary, onSecondary] = readablePair(secondary, targetContrast, theme);
  const [readableAccent, onAccent] = readablePair(anchor, targetContrast, theme);
  const [readableSurface, onSurface] = readablePair(surface, targetContrast, theme);
  const [readableHighlight, onHighlight] = readablePair(highlight, targetContrast, theme);

  return Object.freeze({
    primary: readablePrimary,
    onPrimary,
    secondary: readableSecondary,
    onSecondary,
    accent: readableAccent,
    onAccent,
    surface: readableSurface,
    onSurface,
    highlight: readableHighlight,
    onHighlight,
  });
}

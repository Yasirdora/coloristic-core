import {
  converter,
  differenceEuclidean,
  formatHex,
  toGamut,
  wcagContrast,
  type Oklch,
} from "culori";
import { normalizeColor, normalizeColors } from "./color.js";
import { ColoristicError } from "./errors.js";
import type {
  ColorVisionMode,
  ContrastAudit,
  PaletteAudit,
  WcagAuditOptions,
  WcagLevel,
} from "./types.js";

const toOklch = converter("oklch");
const toRgb = converter("rgb");
const oklchDistance = differenceEuclidean("oklch");
const mapToSrgb = toGamut("rgb", "oklch");
const BINARY_SEARCH_ITERATIONS = 24;

type Matrix3 = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
];

// Full-severity Machado, Oliveira and Fernandes (2009) matrices. These must be
// applied in linear-light RGB, not directly to gamma-encoded sRGB components.
const VISION_MATRICES: Readonly<Record<Exclude<ColorVisionMode, "normal">, Matrix3>> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

const COLOR_VISION_MODES = new Set<ColorVisionMode>([
  "normal",
  "protanopia",
  "deuteranopia",
  "tritanopia",
]);

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** @internal Validates a WCAG ratio used by multiple public modules. */
export function validateContrastTarget(value: number, argumentName: string): number {
  if (!Number.isFinite(value) || value < 1 || value > 21) {
    throw new ColoristicError(
      "INVALID_CONTRAST_TARGET",
      `${argumentName} must be a finite number between 1 and 21.`,
    );
  }
  return value;
}

function readTarget(options: WcagAuditOptions, argumentName = "targetWcagRatio"): number {
  const candidate: unknown = options;
  if (!isRecord(candidate)) {
    throw new ColoristicError("INVALID_ARGUMENT", "Audit options must be an object.");
  }
  return validateContrastTarget(options.targetWcagRatio ?? 4.5, argumentName);
}

function contrastNormalized(foreground: string, background: string): number {
  return wcagContrast(foreground, background);
}

/**
 * Calculates the WCAG 2 relative-luminance contrast ratio between two opaque colors.
 *
 * @throws {@link ColoristicError} when either color is invalid or transparent.
 */
export function getContrastRatio(foreground: string, background: string): number {
  return contrastNormalized(normalizeColor(foreground), normalizeColor(background));
}

/**
 * Classifies a valid WCAG contrast ratio using the WCAG 2 AA/AAA text thresholds.
 *
 * `aa-large` means the ratio reaches 3:1 but not the 4.5:1 normal-text threshold.
 *
 * @throws {@link ColoristicError} when `ratio` is outside the inclusive 1–21 range.
 */
export function getWcagLevel(ratio: number): WcagLevel {
  validateContrastTarget(ratio, "ratio");
  if (ratio >= 7) return "aaa";
  if (ratio >= 4.5) return "aa";
  if (ratio >= 3) return "aa-large";
  return "fail";
}

function srgbToLinear(component: number): number {
  return component <= 0.04045 ? component / 12.92 : ((component + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(component: number): number {
  const clamped = Math.max(0, Math.min(1, component));
  return clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055;
}

/**
 * Simulates a full-severity color-vision deficiency in linear-light sRGB.
 *
 * The implementation uses the Machado, Oliveira and Fernandes (2009) matrices. It is
 * intended as a design preview, not a medical diagnosis or proof of accessibility.
 *
 * @see https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html
 * @throws {@link ColoristicError} for an invalid color or unsupported mode.
 */
export function simulateColorVision(color: string, mode: ColorVisionMode): string {
  const normalized = normalizeColor(color);
  if (typeof mode !== "string" || !COLOR_VISION_MODES.has(mode)) {
    throw new ColoristicError(
      "INVALID_ARGUMENT",
      `Unsupported color-vision mode: ${String(mode)}.`,
    );
  }
  if (mode === "normal") return normalized;

  const value = toRgb(normalized);
  if (!value) {
    throw new ColoristicError(
      "INVALID_COLOR",
      `Could not convert ${JSON.stringify(color)} to sRGB.`,
    );
  }
  const input: readonly [number, number, number] = [
    srgbToLinear(value.r ?? 0),
    srgbToLinear(value.g ?? 0),
    srgbToLinear(value.b ?? 0),
  ];
  const matrix = VISION_MATRICES[mode];
  const transform = (row: Matrix3[number]): number =>
    row[0] * input[0] + row[1] * input[1] + row[2] * input[2];
  const transformed: readonly [number, number, number] = [
    transform(matrix[0]),
    transform(matrix[1]),
    transform(matrix[2]),
  ];
  const result = formatHex({
    mode: "rgb",
    r: linearToSrgb(transformed[0]),
    g: linearToSrgb(transformed[1]),
    b: linearToSrgb(transformed[2]),
  });
  if (!result) {
    throw new ColoristicError("INVALID_COLOR", "Could not encode the simulated color.");
  }
  return result.toLowerCase();
}

function candidateAt(
  source: Oklch,
  endpointLightness: 0 | 1,
  progress: number,
): string | undefined {
  const mapped = mapToSrgb({
    mode: "oklch",
    l: (source.l ?? 0) + (endpointLightness - (source.l ?? 0)) * progress,
    c: (source.c ?? 0) * (1 - progress),
    ...(source.h === undefined ? {} : { h: source.h }),
  });
  return (mapped ? formatHex(mapped) : undefined)?.toLowerCase();
}

function suggestContrastFixNormalized(
  source: string,
  backdrop: string,
  targetRatio: number,
  sourceValue = toOklch(source),
): string | null {
  if (contrastNormalized(source, backdrop) >= targetRatio) return source;
  if (!sourceValue) return null;

  let best: Readonly<{ hex: string; distance: number }> | undefined;
  for (const endpoint of [0, 1] as const) {
    const endpointHex = candidateAt(sourceValue, endpoint, 1);
    if (!endpointHex || contrastNormalized(endpointHex, backdrop) < targetRatio) continue;

    let low = 0;
    let high = 1;
    let closestPassing = endpointHex;
    for (let iteration = 0; iteration < BINARY_SEARCH_ITERATIONS; iteration += 1) {
      const progress = (low + high) / 2;
      const candidate = candidateAt(sourceValue, endpoint, progress);
      if (candidate && contrastNormalized(candidate, backdrop) >= targetRatio) {
        high = progress;
        closestPassing = candidate;
      } else {
        low = progress;
      }

      // Break early if we've reached floating-point precision limits
      if (high - low < 0.0001) break;
    }

    const candidateValue = toOklch(closestPassing);
    if (!candidateValue) continue;
    const distance = oklchDistance(sourceValue, candidateValue);
    if (Number.isFinite(distance) && (!best || distance < best.distance)) {
      best = Object.freeze({ hex: closestPassing, distance });
    }
  }
  return best?.hex ?? null;
}

/**
 * Finds the smallest tested OKLCH adjustment that reaches a WCAG contrast target.
 *
 * The search uses 24 bounded binary-search iterations toward neutral black and white.
 * It returns the normalized source if it already passes, or `null` when no opaque sRGB
 * foreground can reach the requested ratio against the supplied background.
 *
 * @throws {@link ColoristicError} for invalid colors or a target outside 1–21.
 */
export function suggestContrastFix(
  foreground: string,
  background: string,
  targetRatio = 4.5,
): string | null {
  const target = validateContrastTarget(targetRatio, "targetRatio");
  return suggestContrastFixNormalized(
    normalizeColor(foreground),
    normalizeColor(background),
    target,
  );
}

function auditNormalized(
  foreground: string,
  background: string,
  targetWcagRatio: number,
  normalizedOklch?: Oklch,
): ContrastAudit {
  const wcagRatio = contrastNormalized(foreground, background);
  const passesWcag = wcagRatio >= targetWcagRatio;
  return Object.freeze({
    foreground,
    background,
    wcagRatio,
    wcagLevel: getWcagLevel(wcagRatio),
    passesWcag,
    suggestedForeground: passesWcag
      ? null
      : suggestContrastFixNormalized(foreground, background, targetWcagRatio, normalizedOklch),
  });
}

/**
 * Audits one ordered foreground/background pair against a WCAG 2 target.
 *
 * @throws {@link ColoristicError} for invalid colors, options, or contrast target.
 */
export function auditContrast(
  foreground: string,
  background: string,
  options: WcagAuditOptions = {},
): ContrastAudit {
  const targetWcagRatio = readTarget(options);
  const fg = normalizeColor(foreground);
  const bg = normalizeColor(background);
  return auditNormalized(fg, bg, targetWcagRatio, toOklch(fg));
}

/**
 * Audits every ordered pair in a palette against a WCAG 2 contrast target.
 *
 * Colors are normalized once and duplicate values are collapsed. Input is capped at
 * {@link MAX_PALETTE_SIZE} by {@link normalizeColors} to keep the synchronous O(n²)
 * operation predictable. Returned objects and arrays are frozen.
 *
 * @throws {@link ColoristicError} for invalid colors, options, size, or contrast target.
 */
export function auditPalette(
  inputColors: readonly string[],
  options: WcagAuditOptions = {},
): PaletteAudit {
  const targetWcagRatio = readTarget(options);
  const colors = [...new Set(normalizeColors(inputColors))];
  const converted = new Map(colors.map((color) => [color, toOklch(color)] as const));
  const pairs: ContrastAudit[] = [];

  for (const foreground of colors) {
    for (const background of colors) {
      if (foreground === background) continue;
      pairs.push(
        auditNormalized(foreground, background, targetWcagRatio, converted.get(foreground)),
      );
    }
  }

  pairs.sort(
    (a, b) =>
      b.wcagRatio - a.wcagRatio ||
      (a.foreground < b.foreground ? -1 : a.foreground > b.foreground ? 1 : 0) ||
      (a.background < b.background ? -1 : a.background > b.background ? 1 : 0),
  );
  const frozenPairs = Object.freeze(pairs);
  const passingPairs = Object.freeze(pairs.filter((pair) => pair.passesWcag));
  const failingPairs = Object.freeze(pairs.filter((pair) => !pair.passesWcag));
  return Object.freeze({ targetWcagRatio, pairs: frozenPairs, passingPairs, failingPairs });
}

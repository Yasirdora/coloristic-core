import { describe, expect, it } from "vitest";
import {
  MAX_PALETTE_NAME_LENGTH,
  MAX_PALETTE_SIZE,
  ColoristicError,
  assignPaletteRoles,
  createPalette,
  createPaletteFromColors,
  generateHarmony,
  generateShades,
  getColorValues,
  getContrastRatio,
  normalizeColor,
  normalizeColors,
  toSrgbComponents,
  type HarmonyMode,
  type PaletteRoles,
} from "../src/index.js";

const GENERATED_MODES = [
  "monochromatic",
  "complementary",
  "split-complementary",
  "analogous",
  "triadic",
  "tetradic",
  "square",
] as const;

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function patternOffset(pattern: readonly number[], relativeIndex: number): number {
  return pattern[positiveModulo(relativeIndex, pattern.length)] ?? 0;
}

function expectedHueOffset(mode: (typeof GENERATED_MODES)[number], relativeIndex: number): number {
  switch (mode) {
    case "monochromatic":
      return 0;
    case "complementary":
      return patternOffset([0, 180], relativeIndex);
    case "split-complementary":
      return patternOffset([0, 150, 210], relativeIndex);
    case "analogous":
      return relativeIndex * 15;
    case "triadic":
      return patternOffset([0, 120, 240], relativeIndex);
    case "tetradic":
      return patternOffset([0, 60, 180, 240], relativeIndex);
    case "square":
      return patternOffset([0, 90, 180, 270], relativeIndex);
  }
}

function angularDistance(left: number, right: number): number {
  const delta = Math.abs((((left - right) % 360) + 360) % 360);
  return Math.min(delta, 360 - delta);
}

function expectRoleContrast(roles: PaletteRoles, target: number): void {
  for (const [background, foreground] of [
    [roles.primary, roles.onPrimary],
    [roles.secondary, roles.onSecondary],
    [roles.accent, roles.onAccent],
    [roles.surface, roles.onSurface],
    [roles.highlight, roles.onHighlight],
  ] as const) {
    expect(getContrastRatio(foreground, background)).toBeGreaterThanOrEqual(target);
  }
}

describe("color normalization", () => {
  it("normalizes opaque CSS syntax using deterministic sRGB gamut mapping", () => {
    expect(normalizeColor("rgb(37 99 235)")).toBe("#2563eb");
    expect(normalizeColor("rgba(1, 2, 3, 1)")).toBe("#010203");
    expect(normalizeColor("#ffffffff")).toBe("#ffffff");
    expect(normalizeColor("color(display-p3 1 0 0)")).toBe(
      normalizeColor("color(display-p3 1 0 0)"),
    );
    expect(normalizeColors(["white", "black"])).toEqual(["#ffffff", "#000000"]);
    expect(toSrgbComponents("#ff8000")).toEqual([1, 0.501961, 0]);
  });

  it.each([
    "transparent",
    "rgba(1, 2, 3, 0.999)",
    "#ffffff00",
    "rgb(none none none)",
    "oklch(none none none)",
    "color(srgb 1 0 0 / none)",
    "",
    "definitely-not-a-color",
  ])("rejects invalid, incomplete, or transparent color %j", (color) => {
    expect(() => normalizeColor(color)).toThrowError(
      expect.objectContaining({ code: "INVALID_COLOR" }),
    );
  });

  it("rejects non-string and malformed array input with stable errors", () => {
    expect(() => normalizeColor(42 as unknown as string)).toThrowError(ColoristicError);
    expect(() => normalizeColors("#fff" as unknown as readonly string[])).toThrowError(
      expect.objectContaining({ code: "INVALID_ARGUMENT" }),
    );
    expect(() => normalizeColors([])).toThrowError(
      expect.objectContaining({ code: "EMPTY_PALETTE" }),
    );
    expect(() => normalizeColors(Array(MAX_PALETTE_SIZE + 1).fill("#000"))).toThrowError(
      expect.objectContaining({ code: "PALETTE_TOO_LARGE" }),
    );
    expect(() => normalizeColors(Array(2) as string[])).toThrowError(
      expect.objectContaining({ code: "INVALID_COLOR" }),
    );
  });

  it("returns deeply frozen color representations", () => {
    const values = getColorValues("#2563eb");
    expect(values).toMatchObject({ hex: "#2563eb", rgb: { r: 37, g: 99, b: 235 } });
    expect(Object.isFrozen(values)).toBe(true);
    expect(Object.isFrozen(values.rgb)).toBe(true);
    expect(Object.isFrozen(toSrgbComponents("#2563eb"))).toBe(true);
    expect(Object.isFrozen(normalizeColors(["#000", "#fff"]))).toBe(true);
  });

  it("wraps rounded HSL hues into the canonical 0–359 range", () => {
    expect(getColorValues("#800001").hsl.h).toBe(0);
  });
});

describe("harmony generation", () => {
  it("rotates every hue pattern around every requested anchor", () => {
    const base = normalizeColor("oklch(60% 0.08 40)");
    const baseHue = getColorValues(base).oklch.h;

    for (const mode of GENERATED_MODES) {
      for (const baseIndex of [0, 2, 4]) {
        const colors = generateHarmony(base, mode, 5, baseIndex);
        expect(colors[baseIndex]).toBe(base);
        for (const [index, color] of colors.entries()) {
          if (index === baseIndex) continue;
          const expected = baseHue + expectedHueOffset(mode, index - baseIndex);
          expect(angularDistance(getColorValues(color).oklch.h, expected)).toBeLessThan(4);
        }
      }
    }
  });

  it("keeps achromatic seeds achromatic in every harmony mode", () => {
    for (const mode of GENERATED_MODES) {
      for (const color of generateHarmony("#777777", mode, 7, 3)) {
        const { r, g, b } = getColorValues(color).rgb;
        expect(r).toBe(g);
        expect(g).toBe(b);
      }
    }
  });

  it("supports the documented count boundaries and immutable output", () => {
    expect(generateHarmony("#2563eb", "analogous", 1, 0)).toEqual(["#2563eb"]);
    const maximum = generateHarmony("#2563eb", "square", MAX_PALETTE_SIZE, 32);
    expect(maximum).toHaveLength(MAX_PALETTE_SIZE);
    expect(Object.isFrozen(maximum)).toBe(true);
    expect(new Set(generateHarmony("#2563eb", "monochromatic", MAX_PALETTE_SIZE, 32)).size).toBe(
      MAX_PALETTE_SIZE,
    );
    expect(Object.isFrozen(generateShades("#2563eb", 5))).toBe(true);
  });

  it("keeps clipped extreme-anchor harmonies distinct without changing normal output", () => {
    expect(generateHarmony("#2563eb", "analogous", 5, 2)).toEqual([
      "#00253e",
      "#00488d",
      "#2563eb",
      "#868eff",
      "#cfc0ff",
    ]);

    for (const anchor of ["#000000", "#ffffff"]) {
      for (const mode of GENERATED_MODES) {
        const colors = generateHarmony(anchor, mode, MAX_PALETTE_SIZE, 32);
        expect(new Set(colors).size, `${anchor}/${mode}`).toBe(MAX_PALETTE_SIZE);
        expect(colors[32]).toBe(anchor);
        expect(
          colors.every((color) => {
            const { r, g, b } = getColorValues(color).rgb;
            return r === g && g === b;
          }),
          `${anchor}/${mode} remains achromatic`,
        ).toBe(true);
      }
    }
  });

  it.each([0, MAX_PALETTE_SIZE + 1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid count %s",
    (count) => {
      expect(() => generateHarmony("#fff", "analogous", count, 0)).toThrowError(
        expect.objectContaining({ code: "INVALID_COUNT" }),
      );
    },
  );

  it.each([-1, 5, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid base index %s",
    (baseIndex) => {
      expect(() => generateHarmony("#fff", "analogous", 5, baseIndex)).toThrowError(
        expect.objectContaining({ code: "INVALID_INDEX" }),
      );
    },
  );

  it("rejects unsupported harmony values at the JavaScript boundary", () => {
    expect(() =>
      generateHarmony("#fff", "invented" as Exclude<HarmonyMode, "custom">, 5, 2),
    ).toThrowError(expect.objectContaining({ code: "INVALID_ARGUMENT" }));
  });
});

describe("semantic palette construction", () => {
  const colors = ["#111827", "#475569", "#f97316", "#f8fafc", "#ffffff"];

  it("assigns deterministic light and dark roles with readable foreground partners", () => {
    const light = assignPaletteRoles(colors, { baseIndex: 2, theme: "light" });
    const dark = assignPaletteRoles(colors, { baseIndex: 2, theme: "dark" });

    expect(light.accent).toBe("#f97316");
    expect(light.primary).toBe("#111827");
    expect(dark.surface).not.toBe(light.surface);
    expectRoleContrast(light, 4.5);
    expectRoleContrast(dark, 4.5);
    expect(Object.isFrozen(light)).toBe(true);
    expect(createPaletteFromColors({ colors, baseIndex: 2 }).roles).toEqual(light);
  });

  it("synthesizes semantic backgrounds to guarantee an AAA target", () => {
    const roles = assignPaletteRoles(["#777777"], { targetContrast: 7 });
    expectRoleContrast(roles, 7);
  });

  it("honors the inclusive maximum contrast target", () => {
    const roles = assignPaletteRoles(["#777777"], { targetContrast: 21 });
    expectRoleContrast(roles, 21);
  });

  it("synthesizes theme-appropriate surfaces for degenerate palettes", () => {
    const lightFromBlack = assignPaletteRoles(["#000000"], { theme: "light" });
    const darkFromWhite = assignPaletteRoles(["#ffffff"], { theme: "dark" });
    expect(getColorValues(lightFromBlack.surface).oklch.l).toBeGreaterThan(0.9);
    expect(getColorValues(darkFromWhite.surface).oklch.l).toBeLessThan(0.2);
    expectRoleContrast(lightFromBlack, 4.5);
    expectRoleContrast(darkFromWhite, 4.5);
  });

  it("creates deeply immutable, deterministic palettes", () => {
    const options = {
      name: "Blue system",
      baseColor: "#2563eb",
      harmony: "triadic" as const,
      count: 5,
      baseIndex: 2,
    };
    const first = createPalette(options);
    const second = createPalette(options);
    expect(first).toEqual(second);
    expect(first.colors[2]).toBe("#2563eb");
    expect(first.targetContrast).toBe(4.5);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.colors)).toBe(true);
    expect(Object.isFrozen(first.roles)).toBe(true);
    expect(() => {
      (first.colors as string[])[0] = "#ffffff";
    }).toThrow(TypeError);
  });

  it("accepts 120 Unicode code points but rejects oversized or malformed names", () => {
    const accepted = createPalette({
      name: "🎨".repeat(MAX_PALETTE_NAME_LENGTH),
      baseColor: "#2563eb",
    });
    expect([...accepted.name]).toHaveLength(MAX_PALETTE_NAME_LENGTH);
    expect(() =>
      createPalette({
        name: "🎨".repeat(MAX_PALETTE_NAME_LENGTH + 1),
        baseColor: "#2563eb",
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_ARGUMENT" }));
    expect(() => createPalette({ name: "\ud800", baseColor: "#2563eb" })).toThrowError(
      expect.objectContaining({ code: "INVALID_ARGUMENT" }),
    );
  });

  it("validates all public JavaScript entry-point options", () => {
    expect(() =>
      createPalette(null as unknown as Parameters<typeof createPalette>[0]),
    ).toThrowError(expect.objectContaining({ code: "INVALID_ARGUMENT" }));
    expect(() =>
      createPaletteFromColors(null as unknown as Parameters<typeof createPaletteFromColors>[0]),
    ).toThrowError(expect.objectContaining({ code: "INVALID_ARGUMENT" }));
    expect(() => assignPaletteRoles(colors, null as never)).toThrowError(
      expect.objectContaining({ code: "INVALID_ARGUMENT" }),
    );
    expect(() => assignPaletteRoles(colors, { baseIndex: Number.NaN })).toThrowError(
      expect.objectContaining({ code: "INVALID_INDEX" }),
    );
    expect(() => assignPaletteRoles(colors, { theme: "sepia" as "light" })).toThrowError(
      expect.objectContaining({ code: "INVALID_ARGUMENT" }),
    );
    expect(() =>
      createPaletteFromColors({ colors, harmony: "invented" as HarmonyMode }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_ARGUMENT" }));
    expect(() => createPalette({ baseColor: "#fff", baseIndex: 99 })).toThrowError(
      expect.objectContaining({ code: "INVALID_INDEX" }),
    );
  });
});

import { describe, expect, expectTypeOf, it } from "vitest";
import {
  ColoristicError,
  createPaletteFromColors,
  exportPalette,
  toAndroidXml,
  toAse,
  toCssVariables,
  toDtcgTokens,
  toGimpPalette,
  toIosSwift,
  toJson,
  toScssVariables,
  toTailwindConfig,
  type ExportFormat,
  type Palette,
} from "../src/index.js";

const ROLE_NAMES = [
  "primary",
  "onPrimary",
  "secondary",
  "onSecondary",
  "accent",
  "onAccent",
  "surface",
  "onSurface",
  "highlight",
  "onHighlight",
] as const;

const palette = createPaletteFromColors({
  name: "Brand Pack",
  colors: ["#111827", "#64748b", "#2563eb", "#f1f5f9", "#ffffff"],
  baseIndex: 2,
});

const serializers: readonly ((value: Palette) => string | Uint8Array)[] = [
  toCssVariables,
  toScssVariables,
  toTailwindConfig,
  toDtcgTokens,
  toJson,
  toAndroidXml,
  toIosSwift,
  toGimpPalette,
  toAse,
];

function forged(overrides: Record<string, unknown>): Palette {
  return { ...palette, ...overrides } as unknown as Palette;
}

function readUint16(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(offset, false);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, false);
}

function readAseString(bytes: Uint8Array, offset: number): string {
  const lengthWithTerminator = readUint16(bytes, offset);
  const codeUnits = Array.from({ length: lengthWithTerminator - 1 }, (_, index) =>
    readUint16(bytes, offset + 2 + index * 2),
  );
  expect(readUint16(bytes, offset + 2 + (lengthWithTerminator - 1) * 2)).toBe(0);
  return String.fromCharCode(...codeUnits);
}

describe("exporters", () => {
  it("emits CSS variables for every semantic role using safe, stable names", () => {
    const css = toCssVariables(palette);
    expect(css).toContain(`--color-primary: ${palette.roles.primary};`);
    expect(css).toContain("--color-on-primary:");
    expect(css).toContain("--color-on-highlight-oklch:");
    expect(css).toContain("Brand Pack · custom · sRGB");

    const hueBoundary = createPaletteFromColors({ colors: ["#300818"], baseIndex: 0 });
    expect(toCssVariables(hueBoundary)).toContain("--color-accent-oklch: oklch(21.4% 0.067 0);");
  });

  it("emits deterministic DTCG 2025.10 color objects for every role", () => {
    const serialized = toDtcgTokens(palette);
    const result = JSON.parse(serialized);
    const group = result["brand-pack"];

    expect(toDtcgTokens(palette)).toBe(serialized);
    expect(group.$type).toBe("color");
    expect(Object.keys(group)).toEqual(["$type", ...ROLE_NAMES]);
    expect(group.accent.$value).toMatchObject({
      colorSpace: "srgb",
      alpha: 1,
      hex: palette.roles.accent.toUpperCase(),
    });
    expect(group.accent.$value.components).toHaveLength(3);
  });

  it("emits every role using platform-appropriate mobile resource names", () => {
    const android = toAndroidXml(palette);
    const ios = toIosSwift(palette);

    expect(android).toContain(`<color name="accent">${palette.roles.accent.toUpperCase()}</color>`);
    expect(android).toContain('<color name="on_accent">');
    expect(android.match(/<color name=/g)).toHaveLength(ROLE_NAMES.length);
    expect(ios).toContain("static let accent = UIColor(");
    expect(ios).toContain("static let onAccent = UIColor(");
  });

  it("emits deterministic SCSS, Tailwind, and detailed normalized JSON", () => {
    expect(toScssVariables(palette)).toContain(`$color-primary: ${palette.roles.primary};`);
    expect(toScssVariables(palette)).toContain("$color-on-primary:");
    expect(toTailwindConfig(palette)).toContain(`accent: "${palette.roles.accent}"`);
    expect(toTailwindConfig(palette)).toContain("onAccent:");

    const colorNames = forged({
      colors: ["navy", "white"],
      baseIndex: 0,
      roles: Object.fromEntries(
        ROLE_NAMES.map((role, index) => [role, index % 2 === 0 ? "black" : "white"]),
      ),
    });
    const json = JSON.parse(toJson(colorNames));
    expect(json.colors.map((color: { hex: string }) => color.hex)).toEqual(["#000080", "#ffffff"]);
    expect(json.roles.primary).toBe("#000000");
    expect(json.roles.onPrimary).toBe("#ffffff");
    expect(json.targetContrast).toBe(palette.targetContrast);
    expect(json).not.toHaveProperty("exportedAt");
  });

  it("emits a valid GPL header and every normalized palette color", () => {
    const result = toGimpPalette(palette);
    expect(result).toMatch(/^GIMP Palette\nName: Brand Pack/);
    expect(result).toContain(" 37  99 235\t#2563eb");
    expect(result.trim().split("\n")).toHaveLength(palette.colors.length + 4);
  });

  it("emits a portable ASE sequence with correct UTF-16BE astral Unicode", () => {
    const emojiPalette = forged({ name: "Brand 🎨", colors: ["#2563eb"], baseIndex: 0 });
    const bytes = toAse(emojiPalette);
    const expectedName = "Brand 🎨 1";

    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("ASEF");
    expect(readUint32(bytes, 8)).toBe(1);
    expect(readUint16(bytes, 12)).toBe(1);
    expect(readUint32(bytes, 14)).toBe(bytes.byteLength - 18);
    expect(readUint16(bytes, 18)).toBe(expectedName.length + 1);
    expect(readAseString(bytes, 18)).toBe(expectedName);
    expect(() => toAse(forged({ name: "🎨".repeat(120) }))).not.toThrow();
  });

  it("routes every supported format and preserves binary versus text return types", () => {
    for (const format of [
      "css",
      "scss",
      "tailwind",
      "dtcg",
      "json",
      "android",
      "ios",
      "gpl",
    ] as const) {
      expect(typeof exportPalette(palette, format)).toBe("string");
    }
    expect(exportPalette(palette, "ase")).toBeInstanceOf(Uint8Array);
    expectTypeOf(exportPalette(palette, "ase")).toEqualTypeOf<Uint8Array>();
    expectTypeOf(exportPalette(palette, "css")).toEqualTypeOf<string>();
    expectTypeOf((format: ExportFormat) => exportPalette(palette, format)).returns.toEqualTypeOf<
      string | Uint8Array
    >();
    expect(() => exportPalette(palette, "yaml" as ExportFormat)).toThrowError(
      expect.objectContaining({ code: "UNSUPPORTED_FORMAT" }),
    );
  });

  it("contains hostile metadata within its intended comment or header context", () => {
    const injected = forged({
      name: 'Brand */\nbody{display:none}\u2028process.exit(1)// --> <color name="owned">#000</color><!--',
    });
    const css = toCssVariables(injected);
    const scss = toScssVariables(injected);
    const tailwind = toTailwindConfig(injected);
    const swift = toIosSwift(injected);
    const android = toAndroidXml(injected);
    const gpl = toGimpPalette(injected);

    expect(css).not.toContain("Brand */");
    expect(css).not.toContain("\nbody{display:none}");
    expect(scss.split("\n").at(-2)).toContain("body{display:none}");
    expect(tailwind.split("\n")[1]).toBe("export default {");
    expect(swift.split("\n")[1]).toBe("import UIKit");
    expect(android).not.toContain("Brand");
    expect(android).not.toContain("owned");
    expect(gpl.split("\n")[1]).toMatch(/^Name: Brand/);
    expect(gpl.split("\n")[2]).toMatch(/^Columns:/);
    for (const output of [css, scss, tailwind, swift, gpl]) {
      expect(output).not.toContain("\u2028");
      expect(output).not.toContain("\u2029");
    }

    const json = toJson(forged({ name: "Line\u2028Paragraph\u2029End" }));
    expect(json).toContain("Line\\u2028Paragraph\\u2029End");
    expect(json).not.toContain("Line\u2028Paragraph");
    const injectedJson = toJson(injected);
    expect(injectedJson).not.toContain("<color");
    expect(JSON.parse(injectedJson).name).toBe(injected.name);
  });

  it("rejects malicious role values before every serializer, including palette-only formats", () => {
    const invalid = forged({
      roles: { ...palette.roles, accent: '#fff"; process.exit(1); //' },
    });

    for (const serialize of serializers) {
      expect(() => serialize(invalid)).toThrowError(
        expect.objectContaining({ name: "ColoristicError", code: "INVALID_COLOR" }),
      );
    }
  });

  it("rejects malformed forged palette structures at every serializer boundary", () => {
    const invalidPalettes: readonly (readonly [string, Palette])[] = [
      ["null palette", null as unknown as Palette],
      ["array palette", [] as unknown as Palette],
      ["empty name", forged({ name: "   " })],
      ["non-string name", forged({ name: 42 })],
      ["long ASCII name", forged({ name: "x".repeat(121) })],
      ["long Unicode name", forged({ name: "🎨".repeat(121) })],
      ["unpaired surrogate", forged({ name: "broken\ud800" })],
      ["unknown harmony", forged({ harmony: "random" })],
      ["unknown theme", forged({ theme: "system" })],
      ["non-array colors", forged({ colors: "#fff" })],
      ["non-string color", forged({ colors: ["#fff", 42] })],
      ["NaN base index", forged({ baseIndex: Number.NaN })],
      ["fractional base index", forged({ baseIndex: 1.5 })],
      ["out-of-range base index", forged({ baseIndex: palette.colors.length })],
      ["non-numeric contrast", forged({ targetContrast: "4.5" })],
      ["null roles", forged({ roles: null })],
      ["inherited roles", forged({ roles: Object.create(palette.roles) })],
      ["missing role", forged({ roles: { ...palette.roles, onPrimary: undefined } })],
    ];

    for (const [label, invalid] of invalidPalettes) {
      for (const serialize of serializers) {
        expect(() => serialize(invalid), `${label} through ${serialize.name}`).toThrowError(
          expect.objectContaining({ name: "ColoristicError", code: "INVALID_PALETTE" }),
        );
      }
    }
  });

  it("validates colors even when a target format does not directly serialize them", () => {
    const invalidColor = forged({ colors: ["not-a-color"], baseIndex: 0 });
    for (const serialize of serializers) {
      expect(() => serialize(invalidColor)).toThrowError(ColoristicError);
    }
  });

  it("rejects invalid numeric contrast targets with the core contrast error", () => {
    for (const targetContrast of [Number.NaN, Number.POSITIVE_INFINITY, 0.99, 21.01]) {
      const invalid = forged({ targetContrast });
      for (const serialize of serializers) {
        expect(() => serialize(invalid)).toThrowError(
          expect.objectContaining({ name: "ColoristicError", code: "INVALID_CONTRAST_TARGET" }),
        );
      }
    }
  });

  it("rejects an empty palette with the core empty-palette error", () => {
    const empty = forged({ colors: [], baseIndex: 0 });
    for (const serialize of serializers) {
      expect(() => serialize(empty)).toThrowError(
        expect.objectContaining({ name: "ColoristicError", code: "EMPTY_PALETTE" }),
      );
    }
  });

  it("enforces the shared palette size limit at every serializer boundary", () => {
    const tooLarge = forged({ colors: Array.from({ length: 65 }, () => "#ffffff") });
    for (const serialize of serializers) {
      expect(() => serialize(tooLarge)).toThrowError(
        expect.objectContaining({ name: "ColoristicError", code: "PALETTE_TOO_LARGE" }),
      );
    }
  });

  it("rejects forged semantic roles that do not meet their declared contrast target", () => {
    const inaccessible = forged({
      roles: Object.fromEntries(ROLE_NAMES.map((role) => [role, "#777777"])),
    });
    for (const serialize of serializers) {
      expect(() => serialize(inaccessible)).toThrowError(
        expect.objectContaining({ name: "ColoristicError", code: "INVALID_PALETTE" }),
      );
    }
  });
});

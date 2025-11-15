import { getContrastRatio, validateContrastTarget } from "./accessibility.js";
import { getColorValues, normalizeColor, normalizeColors, toSrgbComponents } from "./color.js";
import { ColoristicError } from "./errors.js";
import {
  MAX_PALETTE_NAME_LENGTH,
  MAX_PALETTE_SIZE,
  type ExportFormat,
  type HarmonyMode,
  type Palette,
  type ThemeMode,
} from "./types.js";

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
const ROLE_PAIRS = [
  ["primary", "onPrimary"],
  ["secondary", "onSecondary"],
  ["accent", "onAccent"],
  ["surface", "onSurface"],
  ["highlight", "onHighlight"],
] as const;
const HARMONY_MODES = new Set<HarmonyMode>([
  "custom",
  "monochromatic",
  "complementary",
  "split-complementary",
  "analogous",
  "triadic",
  "tetradic",
  "square",
]);
const THEME_MODES = new Set<ThemeMode>(["light", "dark"]);
const UINT16_MAX = 0xffff;
const UINT32_MAX = 0xffff_ffff;

type RoleName = (typeof ROLE_NAMES)[number];

interface ValidatedPalette {
  readonly name: string;
  readonly harmony: HarmonyMode;
  readonly colors: readonly string[];
  readonly baseIndex: number;
  readonly theme: ThemeMode;
  readonly targetContrast: number;
  readonly roles: Readonly<Record<RoleName, string>>;
}

function invalidPalette(message: string): never {
  throw new ColoristicError("INVALID_PALETTE", message);
}

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

function normalizeName(value: unknown): string {
  if (typeof value !== "string") invalidPalette("Palette name must be a string.");
  const name = value.trim().normalize("NFC");
  if (name.length === 0) invalidPalette("Palette name must not be empty.");
  if (hasUnpairedSurrogate(name)) invalidPalette("Palette name must contain valid Unicode text.");
  if ([...name].length > MAX_PALETTE_NAME_LENGTH) {
    invalidPalette(`Palette name must not exceed ${MAX_PALETTE_NAME_LENGTH} Unicode code points.`);
  }
  return name;
}

function validatePalette(palette: Palette): ValidatedPalette {
  const candidate: unknown = palette;
  if (!isRecord(candidate)) invalidPalette("Palette must be an object.");

  const name = normalizeName(candidate.name);
  const harmony = candidate.harmony;
  if (typeof harmony !== "string" || !HARMONY_MODES.has(harmony as HarmonyMode)) {
    invalidPalette("Palette harmony is not supported.");
  }
  const theme = candidate.theme;
  if (typeof theme !== "string" || !THEME_MODES.has(theme as ThemeMode)) {
    invalidPalette("Palette theme must be either light or dark.");
  }
  const inputColors = candidate.colors;
  if (!Array.isArray(inputColors)) invalidPalette("Palette colors must be an array.");
  if (inputColors.length > MAX_PALETTE_SIZE) {
    throw new ColoristicError(
      "PALETTE_TOO_LARGE",
      `Palette cannot contain more than ${MAX_PALETTE_SIZE} colors when exported.`,
    );
  }
  const colorValues: unknown[] = Array.from(
    { length: inputColors.length },
    (_, index) => inputColors[index],
  );
  if (!colorValues.every((color) => typeof color === "string")) {
    invalidPalette("Every palette color must be a string.");
  }

  const colors = normalizeColors(colorValues as string[]);
  const inputBaseIndex = candidate.baseIndex;
  if (!Number.isInteger(inputBaseIndex)) invalidPalette("Palette baseIndex must be an integer.");
  const baseIndex = inputBaseIndex as number;
  if (baseIndex < 0 || baseIndex >= colors.length) {
    invalidPalette("Palette baseIndex must identify an existing palette color.");
  }
  const inputTargetContrast = candidate.targetContrast;
  if (typeof inputTargetContrast !== "number") {
    invalidPalette("Palette targetContrast must be a number.");
  }
  const targetContrast = validateContrastTarget(inputTargetContrast, "Palette targetContrast");
  const inputRoles = candidate.roles;
  if (!isRecord(inputRoles)) invalidPalette("Palette roles must be an object.");

  const roles = {} as Record<RoleName, string>;
  for (const role of ROLE_NAMES) {
    if (!Object.hasOwn(inputRoles, role)) {
      invalidPalette(`Palette role ${role} must be a color string.`);
    }
    const value = inputRoles[role];
    if (typeof value !== "string") invalidPalette(`Palette role ${role} must be a color string.`);
    roles[role] = normalizeColor(value);
  }
  for (const [backgroundRole, foregroundRole] of ROLE_PAIRS) {
    if (
      getContrastRatio(roles[foregroundRole], roles[backgroundRole]) + Number.EPSILON <
      targetContrast
    ) {
      invalidPalette(
        `Palette roles ${foregroundRole} and ${backgroundRole} do not meet targetContrast.`,
      );
    }
  }

  return {
    name,
    harmony: harmony as HarmonyMode,
    colors,
    baseIndex,
    theme: theme as ThemeMode,
    targetContrast,
    roles,
  };
}

function roleEntries(roles: ValidatedPalette["roles"]): readonly (readonly [RoleName, string])[] {
  return ROLE_NAMES.map((role) => [role, roles[role]] as const);
}

function toKebabCase(value: RoleName): string {
  return value.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
}

function toSnakeCase(value: RoleName): string {
  return value.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`);
}

function slugify(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "palette"
  );
}

function isUnsafeMetadataCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0) ?? 0;
  return (
    codePoint <= 0x1f ||
    (codePoint >= 0x7f && codePoint <= 0x9f) ||
    codePoint === 0x061c ||
    codePoint === 0x200e ||
    codePoint === 0x200f ||
    (codePoint >= 0x2028 && codePoint <= 0x202e) ||
    (codePoint >= 0x2066 && codePoint <= 0x2069)
  );
}

function safeSingleLine(value: string): string {
  return Array.from(value, (character) => (isUnsafeMetadataCharacter(character) ? " " : character))
    .join("")
    .replace(/ {2,}/g, " ")
    .trim();
}

function safeBlockComment(value: string): string {
  return safeSingleLine(value)
    .replace(/\*\//g, "* /")
    .replace(/</g, "\\3c ")
    .replace(/>/g, "\\3e ");
}

function stringifyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)
    .replace(/&/g, "\\u0026")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029")}\n`;
}

/**
 * Serializes a palette as CSS custom properties containing hex, RGB, and OKLCH values.
 *
 * @throws {@link ColoristicError} when the palette structure or any color is invalid.
 */
export function toCssVariables(palette: Palette): string {
  const validated = validatePalette(palette);
  const lines = roleEntries(validated.roles).flatMap(([role, color]) => {
    const name = toKebabCase(role);
    const values = getColorValues(color);
    return [
      `  --color-${name}: ${values.hex};`,
      `  --color-${name}-rgb: ${values.rgb.r} ${values.rgb.g} ${values.rgb.b};`,
      `  --color-${name}-oklch: oklch(${(values.oklch.l * 100).toFixed(1)}% ${values.oklch.c.toFixed(3)} ${Math.round(values.oklch.h)});`,
    ];
  });
  const metadata = `${validated.name} · ${validated.harmony} · sRGB`;
  return `:root {\n${lines.join("\n")}\n}\n\n/* ${safeBlockComment(metadata)} */\n`;
}

/**
 * Serializes a palette as SCSS variables using stable kebab-case role names.
 *
 * @throws {@link ColoristicError} when the palette structure or any color is invalid.
 */
export function toScssVariables(palette: Palette): string {
  const validated = validatePalette(palette);
  const lines = roleEntries(validated.roles).map(
    ([role, color]) => `$color-${toKebabCase(role)}: ${color};`,
  );
  return `${lines.join("\n")}\n\n// ${safeSingleLine(`${validated.name} · ${validated.harmony}`)}\n`;
}

/**
 * Serializes a palette as an ESM-compatible Tailwind theme extension.
 *
 * @throws {@link ColoristicError} when the palette structure or any color is invalid.
 */
export function toTailwindConfig(palette: Palette): string {
  const validated = validatePalette(palette);
  const entries = roleEntries(validated.roles).map(
    ([role, color]) => `        ${role}: ${JSON.stringify(color)},`,
  );
  return `// ${safeSingleLine(validated.name)}\nexport default {\n  theme: {\n    extend: {\n      colors: {\n${entries.join("\n")}\n      },\n    },\n  },\n};\n`;
}

/**
 * Serializes semantic roles using the DTCG 2025.10 color object representation.
 *
 * @throws {@link ColoristicError} when the palette structure or any color is invalid.
 */
export function toDtcgTokens(palette: Palette): string {
  const validated = validatePalette(palette);
  const tokens = Object.fromEntries(
    roleEntries(validated.roles).map(([role, color]) => [
      role,
      {
        $value: {
          colorSpace: "srgb",
          components: toSrgbComponents(color),
          alpha: 1,
          hex: color.toUpperCase(),
        },
      },
    ]),
  );
  return stringifyJson({ [slugify(validated.name)]: { $type: "color", ...tokens } });
}

/**
 * Serializes all normalized palette data as deterministic JSON.
 *
 * @throws {@link ColoristicError} when the palette structure or any color is invalid.
 */
export function toJson(palette: Palette): string {
  const validated = validatePalette(palette);
  return stringifyJson({
    name: validated.name,
    harmony: validated.harmony,
    theme: validated.theme,
    targetContrast: validated.targetContrast,
    baseIndex: validated.baseIndex,
    colors: validated.colors.map(getColorValues),
    roles: Object.fromEntries(roleEntries(validated.roles)),
  });
}

/**
 * Serializes semantic roles as an Android color resource document.
 *
 * User-controlled metadata is intentionally excluded because XML comments cannot safely
 * represent arbitrary strings.
 *
 * @throws {@link ColoristicError} when the palette structure or any color is invalid.
 */
export function toAndroidXml(palette: Palette): string {
  const validated = validatePalette(palette);
  const entries = roleEntries(validated.roles).map(
    ([role, color]) => `    <color name="${toSnakeCase(role)}">${color.toUpperCase()}</color>`,
  );
  return `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n${entries.join("\n")}\n</resources>\n`;
}

/**
 * Serializes semantic roles as a Swift `UIColor` namespace for iOS applications.
 *
 * @throws {@link ColoristicError} when the palette structure or any color is invalid.
 */
export function toIosSwift(palette: Palette): string {
  const validated = validatePalette(palette);
  const entries = roleEntries(validated.roles).map(([role, color]) => {
    const { r, g, b } = getColorValues(color).rgb;
    return `    static let ${role} = UIColor(red: ${(r / 255).toFixed(4)}, green: ${(g / 255).toFixed(4)}, blue: ${(b / 255).toFixed(4)}, alpha: 1)`;
  });
  return `// ${safeSingleLine(validated.name)}\nimport UIKit\n\nenum ColoristicPalette {\n${entries.join("\n")}\n}\n`;
}

/**
 * Serializes every palette color using the GIMP Palette (GPL) text format.
 *
 * @throws {@link ColoristicError} when the palette structure or any color is invalid.
 */
export function toGimpPalette(palette: Palette): string {
  const validated = validatePalette(palette);
  const rows = validated.colors.map((color) => {
    const values = getColorValues(color);
    const { r, g, b } = values.rgb;
    return `${String(r).padStart(3)} ${String(g).padStart(3)} ${String(b).padStart(3)}\t${values.hex}`;
  });
  return `GIMP Palette\nName: ${safeSingleLine(validated.name)}\nColumns: ${Math.min(validated.colors.length, 16)}\n#\n${rows.join("\n")}\n`;
}

function pushUint16(bytes: number[], value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > UINT16_MAX) {
    invalidPalette("ASE data exceeds an unsigned 16-bit format limit.");
  }
  bytes.push((value >>> 8) & 0xff, value & 0xff);
}

function pushUint32(bytes: number[], value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > UINT32_MAX) {
    invalidPalette("ASE data exceeds an unsigned 32-bit format limit.");
  }
  bytes.push((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
}

function pushFloat32(bytes: number[], value: number): void {
  if (!Number.isFinite(value)) invalidPalette("ASE color components must be finite numbers.");
  const buffer = new ArrayBuffer(4);
  new DataView(buffer).setFloat32(0, value, false);
  bytes.push(...new Uint8Array(buffer));
}

function pushAseString(bytes: number[], value: string): void {
  const encodedLength = value.length + 1;
  if (encodedLength > UINT16_MAX)
    invalidPalette("ASE color names cannot exceed 65,534 UTF-16 code units.");
  pushUint16(bytes, encodedLength);
  for (let index = 0; index < value.length; index += 1) {
    pushUint16(bytes, value.charCodeAt(index));
  }
  pushUint16(bytes, 0);
}

/**
 * Serializes every palette color as an Adobe Swatch Exchange byte sequence.
 *
 * The returned bytes are portable across browsers and Node.js and do not depend on `Blob`.
 *
 * @throws {@link ColoristicError} when the palette structure, Unicode metadata, or any color is invalid.
 */
export function toAse(palette: Palette): Uint8Array {
  const validated = validatePalette(palette);
  const bytes: number[] = [0x41, 0x53, 0x45, 0x46, 0x00, 0x01, 0x00, 0x00];
  pushUint32(bytes, validated.colors.length);

  validated.colors.forEach((color, index) => {
    const name = `${safeSingleLine(validated.name)} ${index + 1}`;
    const block: number[] = [];
    pushAseString(block, name);
    block.push(0x52, 0x47, 0x42, 0x20);
    for (const component of toSrgbComponents(color)) pushFloat32(block, component);
    pushUint16(block, 0);

    pushUint16(bytes, 0x0001);
    pushUint32(bytes, block.length);
    bytes.push(...block);
  });

  return new Uint8Array(bytes);
}

/**
 * Serializes a palette in one of the supported text or binary export formats.
 *
 * @returns A `Uint8Array` for `ase`; every other format returns a string.
 * @throws {@link ColoristicError} when the format, palette structure, or any color is invalid.
 */
export function exportPalette(palette: Palette, format: ExportFormat): string | Uint8Array {
  switch (format) {
    case "css":
      return toCssVariables(palette);
    case "scss":
      return toScssVariables(palette);
    case "tailwind":
      return toTailwindConfig(palette);
    case "dtcg":
      return toDtcgTokens(palette);
    case "json":
      return toJson(palette);
    case "android":
      return toAndroidXml(palette);
    case "ios":
      return toIosSwift(palette);
    case "gpl":
      return toGimpPalette(palette);
    case "ase":
      return toAse(palette);
    default:
      throw new ColoristicError(
        "UNSUPPORTED_FORMAT",
        `Unsupported export format: ${String(format)}`,
      );
  }
}

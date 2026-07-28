/** Maximum number of colors accepted by palette generation and audit APIs. */
export const MAX_PALETTE_SIZE = 64;

/** Maximum palette-name length in Unicode code points. */
export const MAX_PALETTE_NAME_LENGTH = 120;

/** A supported relationship used to generate palette hues. */
export type HarmonyMode =
  | "custom"
  | "monochromatic"
  | "complementary"
  | "split-complementary"
  | "analogous"
  | "triadic"
  | "tetradic"
  | "square";

/** The visual context used when assigning semantic palette roles. */
export type ThemeMode = "light" | "dark";

/** A supported full-severity color-vision-deficiency simulation. */
export type ColorVisionMode = "normal" | "protanopia" | "deuteranopia" | "tritanopia";

/** The WCAG 2 contrast classification for a color pair. */
export type WcagLevel = "fail" | "aa-large" | "aa" | "aaa";

/** Semantic color roles and their guaranteed readable foreground partners. */
export interface PaletteRoles {
  readonly primary: string;
  readonly onPrimary: string;
  readonly secondary: string;
  readonly onSecondary: string;
  readonly accent: string;
  readonly onAccent: string;
  readonly surface: string;
  readonly onSurface: string;
  readonly highlight: string;
  readonly onHighlight: string;
}

/** An immutable generated or imported color palette. */
export interface Palette {
  readonly name: string;
  readonly harmony: HarmonyMode;
  readonly colors: readonly string[];
  readonly baseIndex: number;
  readonly theme: ThemeMode;
  readonly targetContrast: number;
  readonly roles: PaletteRoles;
}

/** Options for deterministic harmony-based palette generation. */
export interface CreatePaletteOptions {
  readonly name?: string;
  readonly baseColor: string;
  readonly harmony?: Exclude<HarmonyMode, "custom">;
  readonly count?: number;
  readonly baseIndex?: number;
  readonly theme?: ThemeMode;
  readonly targetContrast?: number;
}

/** Options for creating a palette from an existing list of colors. */
export interface CreatePaletteFromColorsOptions {
  readonly name?: string;
  readonly colors: readonly string[];
  readonly baseIndex?: number;
  readonly harmony?: HarmonyMode;
  readonly theme?: ThemeMode;
  readonly targetContrast?: number;
}

/** Options for assigning semantic roles to normalized palette colors. */
export interface AssignPaletteRolesOptions {
  readonly baseIndex?: number;
  readonly theme?: ThemeMode;
  readonly targetContrast?: number;
}

/** Normalized representations of one opaque sRGB color. */
export interface ColorValues {
  readonly hex: string;
  readonly rgb: Readonly<{ r: number; g: number; b: number }>;
  readonly hsl: Readonly<{ h: number; s: number; l: number }>;
  readonly oklch: Readonly<{ l: number; c: number; h: number }>;
  readonly lab: Readonly<{ l: number; a: number; b: number }>;
}

/** Options shared by WCAG contrast audit APIs. */
export interface WcagAuditOptions {
  /** Required contrast ratio, inclusive, from 1 through 21. */
  readonly targetWcagRatio?: number;
}

/** An immutable WCAG 2 contrast result for one ordered foreground/background pair. */
export interface ContrastAudit {
  readonly foreground: string;
  readonly background: string;
  readonly wcagRatio: number;
  readonly wcagLevel: WcagLevel;
  readonly passesWcag: boolean;
  readonly suggestedForeground: string | null;
}

/** An immutable WCAG 2 audit of every ordered pair in a palette. */
export interface PaletteAudit {
  readonly targetWcagRatio: number;
  readonly pairs: readonly ContrastAudit[];
  readonly passingPairs: readonly ContrastAudit[];
  readonly failingPairs: readonly ContrastAudit[];
}

/** A supported palette serialization target. */
export type ExportFormat =
  | "android"
  | "ase"
  | "css"
  | "dtcg"
  | "gpl"
  | "ios"
  | "json"
  | "scss"
  | "tailwind";

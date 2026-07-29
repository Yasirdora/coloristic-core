/** Internal types for the audited Culori 4.0.2 snapshot bundled with Coloristic Core. */

export interface Rgb {
  readonly mode: "rgb";
  readonly r?: number;
  readonly g?: number;
  readonly b?: number;
  readonly alpha?: number;
}

export interface Hsl {
  readonly mode: "hsl";
  readonly h?: number;
  readonly s?: number;
  readonly l?: number;
  readonly alpha?: number;
}

export interface Oklch {
  readonly mode: "oklch";
  readonly l?: number;
  readonly c?: number;
  readonly h?: number;
  readonly alpha?: number;
}

export interface Lab {
  readonly mode: "lab";
  readonly l?: number;
  readonly a?: number;
  readonly b?: number;
  readonly alpha?: number;
}

export interface GenericColor {
  readonly mode: string;
  readonly alpha?: number;
  readonly [component: string]: string | number | undefined;
}

export type Color = Rgb | Hsl | Oklch | Lab | GenericColor;
export type ColorInput = string | Color;

export function converter(mode: "rgb"): (color: ColorInput) => Rgb | undefined;
export function converter(mode: "oklch"): (color: ColorInput) => Oklch | undefined;
export function converter(mode: "lab"): (color: ColorInput) => Lab | undefined;
export function converter(mode: string): (color: ColorInput) => GenericColor | undefined;

export function differenceEuclidean(
  mode?: string,
): (first: ColorInput, second: ColorInput) => number;
export function formatHex(color: ColorInput | undefined): string | undefined;
export function hsl(color: ColorInput): Hsl | undefined;
export function oklch(color: ColorInput | undefined): Oklch | undefined;
export function parse(color: string): Color | undefined;
export function rgb(color: ColorInput): Rgb | undefined;
export function toGamut(
  targetMode: "rgb",
  clippingMode?: string,
): (color: ColorInput) => Rgb | undefined;
export function wcagContrast(first: ColorInput, second: ColorInput): number;

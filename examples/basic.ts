import {
  assignPaletteRoles,
  auditContrast,
  auditPalette,
  createPalette,
  exportPalette,
  getContrastRatio,
} from "../src/index.js";

const palette = createPalette({
  name: "Northstar",
  baseColor: "#2563eb",
  harmony: "split-complementary",
  count: 5,
  theme: "light",
  targetContrast: 4.5,
});

const roles = assignPaletteRoles(palette.colors, {
  baseIndex: palette.baseIndex,
  theme: palette.theme,
  targetContrast: 4.5,
});

const primaryContrast = getContrastRatio(roles.onPrimary, roles.primary);
const primaryAudit = auditContrast(roles.onPrimary, roles.primary);
const paletteAudit = auditPalette(palette.colors);
const css = exportPalette({ ...palette, roles }, "css");

console.log({
  primary: roles.primary,
  onPrimary: roles.onPrimary,
  primaryContrast,
  primaryPasses: primaryAudit.passesWcag,
  arbitraryPairFailures: paletteAudit.failingPairs.length,
});
console.log(css);

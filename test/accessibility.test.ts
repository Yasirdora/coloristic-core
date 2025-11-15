import { describe, expect, it } from "vitest";
import {
  MAX_PALETTE_SIZE,
  auditContrast,
  auditPalette,
  getContrastRatio,
  getWcagLevel,
  simulateColorVision,
  suggestContrastFix,
  type ColorVisionMode,
} from "../src/index.js";

describe("WCAG contrast", () => {
  it("calculates canonical ratios and classifications", () => {
    expect(getContrastRatio("#000", "#fff")).toBeCloseTo(21, 8);
    expect(getContrastRatio("#fff", "#000")).toBeCloseTo(21, 8);
    expect(getWcagLevel(21)).toBe("aaa");
    expect(getWcagLevel(7)).toBe("aaa");
    expect(getWcagLevel(4.5)).toBe("aa");
    expect(getWcagLevel(3)).toBe("aa-large");
    expect(getWcagLevel(2.9)).toBe("fail");
    expect(getWcagLevel(1)).toBe("fail");
  });

  it.each([0.99, 21.01, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects invalid contrast target %s",
    (target) => {
      expect(() => getWcagLevel(target)).toThrowError(
        expect.objectContaining({ code: "INVALID_CONTRAST_TARGET" }),
      );
      expect(() => suggestContrastFix("#777", "#fff", target)).toThrowError(
        expect.objectContaining({ code: "INVALID_CONTRAST_TARGET" }),
      );
    },
  );

  it("finds deterministic bounded repairs and identifies impossible targets", () => {
    const original = "#94a3b8";
    const fixed = suggestContrastFix(original, "#ffffff", 4.5);
    expect(fixed).not.toBeNull();
    expect(fixed).not.toBe(original);
    if (fixed === null) throw new Error("Expected a reachable contrast repair.");
    expect(getContrastRatio(fixed, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(suggestContrastFix(original, "#ffffff", 4.5)).toBe(fixed);
    expect(suggestContrastFix("#000", "#fff", 7)).toBe("#000000");
    expect(suggestContrastFix("#123456", "#777777", 21)).toBeNull();
  });

  it("reaches requested ratios across representative colors whenever physically possible", () => {
    const foregrounds = ["#ef4444", "#22c55e", "#3b82f6", "#777777", "#f8fafc"];
    const backgrounds = ["#000000", "#ffffff", "#334155", "#d1d5db"];
    for (const foreground of foregrounds) {
      for (const background of backgrounds) {
        for (const target of [3, 4.5, 7]) {
          const candidate = suggestContrastFix(foreground, background, target);
          if (candidate !== null) {
            expect(getContrastRatio(candidate, background)).toBeGreaterThanOrEqual(target);
          }
        }
      }
    }
  });

  it("rejects transparent colors instead of producing misleading contrast", () => {
    expect(() => getContrastRatio("rgb(0 0 0 / 50%)", "#fff")).toThrowError(
      expect.objectContaining({ code: "INVALID_COLOR" }),
    );
  });
});

describe("contrast audits", () => {
  it("returns a frozen WCAG-only single-pair audit", () => {
    const audit = auditContrast("#111827", "#ffffff");
    expect(audit).toEqual({
      foreground: "#111827",
      background: "#ffffff",
      wcagRatio: getContrastRatio("#111827", "#ffffff"),
      wcagLevel: "aaa",
      passesWcag: true,
      suggestedForeground: null,
    });
    expect(Object.isFrozen(audit)).toBe(true);
  });

  it("audits each ordered unique pair once and freezes all results", () => {
    const audit = auditPalette(["#000000", "#777777", "#ffffff", "#000"]);
    expect(audit.pairs).toHaveLength(6);
    expect(audit.passingPairs.length + audit.failingPairs.length).toBe(6);
    expect(new Set(audit.pairs.map((pair) => `${pair.foreground}/${pair.background}`)).size).toBe(
      6,
    );
    expect(Object.isFrozen(audit)).toBe(true);
    expect(Object.isFrozen(audit.pairs)).toBe(true);
    expect(audit.pairs.every(Object.isFrozen)).toBe(true);
  });

  it("validates options, targets, and synchronous input limits", () => {
    expect(() => auditContrast("#000", "#fff", null as never)).toThrowError(
      expect.objectContaining({ code: "INVALID_ARGUMENT" }),
    );
    expect(() => auditPalette(["#000", "#fff"], { targetWcagRatio: Number.NaN })).toThrowError(
      expect.objectContaining({ code: "INVALID_CONTRAST_TARGET" }),
    );
    expect(() => auditPalette(Array(MAX_PALETTE_SIZE + 1).fill("#000"))).toThrowError(
      expect.objectContaining({ code: "PALETTE_TOO_LARGE" }),
    );
  });
});

describe("color-vision simulation", () => {
  it("uses stable full-severity Machado fixtures in linear-light sRGB", () => {
    expect(simulateColorVision("#ef4444", "normal")).toBe("#ef4444");
    expect(simulateColorVision("#ef4444", "protanopia")).toBe("#766c42");
    expect(simulateColorVision("#ef4444", "deuteranopia")).toBe("#a0913e");
    expect(simulateColorVision("#ef4444", "tritanopia")).toBe("#ff0046");
    expect(simulateColorVision("#ef4444", "deuteranopia")).toBe(
      simulateColorVision("#ef4444", "deuteranopia"),
    );
    expect(simulateColorVision("#000000", "protanopia")).toBe("#000000");
    expect(simulateColorVision("#ffffff", "tritanopia")).toBe("#ffffff");
  });

  it("rejects unknown modes at the JavaScript boundary", () => {
    expect(() => simulateColorVision("#ef4444", "achromatopsia" as ColorVisionMode)).toThrowError(
      expect.objectContaining({ code: "INVALID_ARGUMENT" }),
    );
  });
});

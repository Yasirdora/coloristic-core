import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  dts: true,
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  minify: false,
  outDir: "dist",
  platform: "neutral",
  sourcemap: true,
  splitting: false,
  target: "es2022",
  treeshake: true,
});

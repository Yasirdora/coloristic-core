import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoot = await mkdtemp(join(tmpdir(), "coloristic-core-smoke-"));
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function run(args, options = {}) {
  return execFileSync(npmCommand, args, {
    cwd: options.cwd ?? packageRoot,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });
}

function assertSafeTemporaryPath(path) {
  const resolved = resolve(path);
  const temporaryPrefix = `${resolve(tmpdir())}${sep}`;
  assert.ok(resolved.startsWith(temporaryPrefix), `Refusing to clean outside ${tmpdir()}`);
  assert.ok(basename(resolved).startsWith("coloristic-core-smoke-"), "Unexpected temporary path");
}

try {
  // Keep this command independently useful outside `npm run check`, where the build
  // has already run. Packing then uses --ignore-scripts so its JSON remains parseable.
  run(["run", "build"]);
  const packedOutput = run(
    ["pack", "--json", "--ignore-scripts", "--pack-destination", temporaryRoot],
    { capture: true },
  );
  const packed = JSON.parse(packedOutput);
  const filename = packed[0]?.filename;
  assert.equal(typeof filename, "string", "npm pack did not report a tarball filename");

  const tarball = join(temporaryRoot, filename);
  const consumerRoot = join(temporaryRoot, "consumer");
  await writeFile(
    join(temporaryRoot, "package-list.json"),
    JSON.stringify(packed[0]?.files ?? [], null, 2),
  );
  await mkdir(consumerRoot);
  await writeFile(
    join(consumerRoot, "package.json"),
    JSON.stringify({ name: "coloristic-core-smoke-consumer", private: true, type: "module" }),
  );

  // `npm ci` has already populated the caller's cache. Reusing it with `--offline`
  // keeps the release gate deterministic and independent of registry availability.
  run(["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", tarball], {
    cwd: consumerRoot,
  });

  const installedPackageRoot = join(consumerRoot, "node_modules", "@coloristic.org", "core");
  const [sourceManifestText, installedManifestText, sourceLicense, installedLicense] =
    await Promise.all([
      readFile(join(packageRoot, "package.json"), "utf8"),
      readFile(join(installedPackageRoot, "package.json"), "utf8"),
      readFile(join(packageRoot, "LICENSE"), "utf8"),
      readFile(join(installedPackageRoot, "LICENSE"), "utf8"),
    ]);
  const sourceManifest = JSON.parse(sourceManifestText);
  const installedManifest = JSON.parse(installedManifestText);
  assert.equal(installedManifest.name, sourceManifest.name, "Installed package name changed");
  assert.equal(
    installedManifest.version,
    sourceManifest.version,
    "Installed package version changed",
  );
  assert.equal(
    installedManifest.license,
    sourceManifest.license,
    "Installed license metadata changed",
  );
  assert.ok(sourceLicense.trim().length > 0, "Source LICENSE must not be empty");
  assert.match(sourceLicense, /^MIT License$/m, "Source LICENSE must contain the MIT heading");
  assert.match(sourceLicense, /Yasir Dora/, "Source LICENSE must identify the copyright holder");
  assert.equal(installedLicense, sourceLicense, "Installed LICENSE does not match the source file");

  const esmSource = `
    import assert from "node:assert/strict";
    import { createPalette, getContrastRatio, MAX_PALETTE_SIZE } from "@coloristic.org/core";
    const palette = createPalette({ baseColor: "#2563eb", targetContrast: 4.5 });
    assert.equal(MAX_PALETTE_SIZE, 64);
    assert.ok(getContrastRatio(palette.roles.onPrimary, palette.roles.primary) >= 4.5);
    assert.equal(palette.targetContrast, 4.5);
  `;
  const cjsSource = `
    const assert = require("node:assert/strict");
    const { createPalette, getContrastRatio, MAX_PALETTE_SIZE } = require("@coloristic.org/core");
    const palette = createPalette({ baseColor: "#2563eb", targetContrast: 4.5 });
    assert.equal(MAX_PALETTE_SIZE, 64);
    assert.ok(getContrastRatio(palette.roles.onSurface, palette.roles.surface) >= 4.5);
    assert.equal(palette.targetContrast, 4.5);
  `;

  await writeFile(join(consumerRoot, "esm-smoke.mjs"), esmSource);
  await writeFile(join(consumerRoot, "cjs-smoke.cjs"), cjsSource);
  execFileSync(process.execPath, ["esm-smoke.mjs"], { cwd: consumerRoot, stdio: "inherit" });
  execFileSync(process.execPath, ["cjs-smoke.cjs"], { cwd: consumerRoot, stdio: "inherit" });

  const esmTypesSource = `
    import {
      createPalette,
      exportPalette,
      getContrastRatio,
      type Palette,
    } from "@coloristic.org/core";
    const palette: Palette = createPalette({ baseColor: "#2563eb" });
    const ratio: number = getContrastRatio(palette.roles.onPrimary, palette.roles.primary);
    const colors: readonly string[] = palette.colors;
    const css: string = exportPalette(palette, "css");
    const ase: Uint8Array = exportPalette(palette, "ase");
    void [ratio, colors, css, ase];
    // @ts-expect-error The packed ESM declaration must reject invalid source types.
    createPalette({ baseColor: 42 });
  `;
  const cjsTypesSource = `
    import core = require("@coloristic.org/core");
    const palette: core.Palette = core.createPalette({ baseColor: "#2563eb" });
    const ratio: number = core.getContrastRatio(palette.roles.onSurface, palette.roles.surface);
    const colors: readonly string[] = palette.colors;
    const css: string = core.exportPalette(palette, "css");
    const ase: Uint8Array = core.exportPalette(palette, "ase");
    void [ratio, colors, css, ase];
    // @ts-expect-error The packed CommonJS declaration must reject invalid source types.
    core.getContrastRatio("#000000", 42);
  `;
  const consumerTsconfig = {
    compilerOptions: {
      exactOptionalPropertyTypes: true,
      lib: ["ES2022"],
      module: "NodeNext",
      moduleResolution: "NodeNext",
      noEmit: true,
      noUncheckedIndexedAccess: true,
      skipLibCheck: false,
      strict: true,
      target: "ES2022",
      types: [],
      verbatimModuleSyntax: true,
    },
    include: ["esm-types.mts", "cjs-types.cts"],
  };
  await writeFile(join(consumerRoot, "esm-types.mts"), esmTypesSource);
  await writeFile(join(consumerRoot, "cjs-types.cts"), cjsTypesSource);
  await writeFile(
    join(consumerRoot, "tsconfig.json"),
    `${JSON.stringify(consumerTsconfig, null, 2)}\n`,
  );
  const typescriptCompiler = resolve(packageRoot, "node_modules", "typescript", "bin", "tsc");
  execFileSync(process.execPath, [typescriptCompiler, "--project", "tsconfig.json"], {
    cwd: consumerRoot,
    stdio: "inherit",
  });

  const packageList = JSON.parse(await readFile(join(temporaryRoot, "package-list.json"), "utf8"));
  const paths = new Set(packageList.map((file) => file.path));
  for (const required of [
    "package.json",
    "README.md",
    "LICENSE",
    "dist/index.js",
    "dist/index.cjs",
    "dist/index.d.ts",
    "dist/index.d.cts",
  ]) {
    assert.ok(paths.has(required), `Packed package is missing ${required}`);
  }
  assert.ok(!paths.has("MIGRATION.md"), "Packed package contains the obsolete migration guide");

  console.log(
    "Package smoke test passed for ESM/CommonJS runtime and type consumers, including the license.",
  );
} finally {
  assertSafeTemporaryPath(temporaryRoot);
  await rm(temporaryRoot, { force: true, recursive: true });
}

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

  run(["install", "--ignore-scripts", "--no-audit", "--no-fund", tarball], { cwd: consumerRoot });

  const esmSource = `
    import assert from "node:assert/strict";
    import { createPalette, getContrastRatio, MAX_PALETTE_SIZE } from "@coloristic/core";
    const palette = createPalette({ baseColor: "#2563eb", targetContrast: 4.5 });
    assert.equal(MAX_PALETTE_SIZE, 64);
    assert.ok(getContrastRatio(palette.roles.onPrimary, palette.roles.primary) >= 4.5);
    assert.equal(palette.targetContrast, 4.5);
  `;
  const cjsSource = `
    const assert = require("node:assert/strict");
    const { createPalette, getContrastRatio, MAX_PALETTE_SIZE } = require("@coloristic/core");
    const palette = createPalette({ baseColor: "#2563eb", targetContrast: 4.5 });
    assert.equal(MAX_PALETTE_SIZE, 64);
    assert.ok(getContrastRatio(palette.roles.onSurface, palette.roles.surface) >= 4.5);
    assert.equal(palette.targetContrast, 4.5);
  `;

  await writeFile(join(consumerRoot, "esm-smoke.mjs"), esmSource);
  await writeFile(join(consumerRoot, "cjs-smoke.cjs"), cjsSource);
  execFileSync(process.execPath, ["esm-smoke.mjs"], { cwd: consumerRoot, stdio: "inherit" });
  execFileSync(process.execPath, ["cjs-smoke.cjs"], { cwd: consumerRoot, stdio: "inherit" });

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

  console.log("Package smoke test passed for ESM and CommonJS consumers.");
} finally {
  assertSafeTemporaryPath(temporaryRoot);
  await rm(temporaryRoot, { force: true, recursive: true });
}

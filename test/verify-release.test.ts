import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const VERSION = "1.2.3";
const PREVIOUS_VERSION = "1.2.2";
const PACKAGE_NAME = "@coloristic.org/core";
const CULORI_VERSION = "4.0.2";
const FIXTURE_PREFIX = "coloristic-release-verify-";
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const verifierPath = resolve(repositoryRoot, "scripts/verify-release.mjs");
const fixtureRoots: string[] = [];

interface FixtureOptions {
  readonly headingCount?: number;
  readonly lockVersion?: string;
  readonly notices?: string;
  readonly previousVersion?: string;
  readonly runtimeDependencies?: Record<string, string>;
  readonly runtimeScripts?: Record<string, string>;
  readonly vendorSource?: string;
  readonly vendorMetadata?: string;
}

function changelog(headingCount: number, previousVersion: string): string {
  const headings = Array.from(
    { length: headingCount },
    () => `## [${VERSION}] - 2026-07-29\n\n- Fixture release.`,
  ).join("\n\n");
  return `# Changelog\n\n## [Unreleased]\n\n${headings}\n\n[Unreleased]: https://github.com/Yasirdora/coloristic-core/compare/v${VERSION}...HEAD\n[${VERSION}]: https://github.com/Yasirdora/coloristic-core/compare/v${previousVersion}...v${VERSION}\n`;
}

async function createFixture(options: FixtureOptions = {}): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), FIXTURE_PREFIX));
  fixtureRoots.push(root);
  const packageJson = {
    name: PACKAGE_NAME,
    version: VERSION,
    license: "MIT",
    ...(options.runtimeDependencies ? { dependencies: options.runtimeDependencies } : {}),
    ...(options.runtimeScripts ? { scripts: options.runtimeScripts } : {}),
    devDependencies: {},
    engines: { node: ">=20" },
  };
  const packageLock = {
    name: PACKAGE_NAME,
    version: options.lockVersion ?? VERSION,
    lockfileVersion: 3,
    packages: {
      "": packageJson,
    },
  };

  const vendorSource =
    options.vendorSource ??
    "/* Culori 4.0.2 — MIT — Copyright (c) 2018 Dan Burzo. See THIRD_PARTY_NOTICES.md. */\n";
  const vendorSha256 = createHash("sha256").update(vendorSource).digest("hex");
  await mkdir(resolve(root, "src/vendor"), { recursive: true });
  await Promise.all([
    writeFile(resolve(root, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`),
    writeFile(resolve(root, "package-lock.json"), `${JSON.stringify(packageLock, null, 2)}\n`),
    writeFile(
      resolve(root, "CHANGELOG.md"),
      changelog(options.headingCount ?? 1, options.previousVersion ?? PREVIOUS_VERSION),
    ),
    writeFile(
      resolve(root, "THIRD_PARTY_NOTICES.md"),
      options.notices ?? "# Third-party notices\n\nCulori\n\nCopyright (c) 2018 Dan Burzo\n",
    ),
    writeFile(resolve(root, "src/vendor/culori.js"), vendorSource),
    writeFile(
      resolve(root, "src/vendor/README.md"),
      options.vendorMetadata ?? `Snapshot SHA-256: \`${vendorSha256}\`\n`,
    ),
  ]);
  return root;
}

function runVerifier(root: string, tag: string) {
  return spawnSync(process.execPath, [verifierPath, tag], {
    encoding: "utf8",
    env: {
      ...process.env,
      COLORISTIC_RELEASE_ROOT: root,
      GITHUB_REF_NAME: "",
      RELEASE_TAG: "",
    },
    timeout: 5_000,
  });
}

function assertSafeFixtureRoot(path: string): void {
  const resolved = resolve(path);
  if (!resolved.startsWith(`${resolve(tmpdir())}${sep}`)) {
    throw new Error(`Refusing to clean fixture outside ${tmpdir()}.`);
  }
  if (!basename(resolved).startsWith(FIXTURE_PREFIX)) {
    throw new Error("Refusing to clean an unexpected fixture path.");
  }
}

afterEach(async () => {
  const roots = fixtureRoots.splice(0);
  await Promise.all(
    roots.map(async (root) => {
      assertSafeFixtureRoot(root);
      await rm(root, { force: true, recursive: true });
    }),
  );
});

describe("release verifier", () => {
  it("accepts a canonical release fixture", async () => {
    const root = await createFixture();
    const result = runVerifier(root, `v${VERSION}`);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(`Verified ${PACKAGE_NAME} ${VERSION}`);
  });

  it.each([
    [VERSION, "noncanonical"],
    ["v1.2.4", "mismatched"],
  ])("rejects a %s release tag (%s)", async (tag) => {
    const root = await createFixture();
    const result = runVerifier(root, tag);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`Release tag must be v${VERSION}; received ${tag}.`);
  });

  it("rejects package-lock version drift", async () => {
    const root = await createFixture({ lockVersion: "1.2.2" });
    const result = runVerifier(root, `v${VERSION}`);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "package-lock.json name or version does not match package.json.",
    );
  });

  it("rejects a consumer-installed runtime dependency", async () => {
    const root = await createFixture({ runtimeDependencies: { culori: CULORI_VERSION } });
    const result = runVerifier(root, `v${VERSION}`);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("The published package must not declare dependencies.");
  });

  it("rejects an install lifecycle script", async () => {
    const root = await createFixture({ runtimeScripts: { postinstall: "node setup.js" } });
    const result = runVerifier(root, `v${VERSION}`);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "The published package must not declare a postinstall lifecycle script.",
    );
  });

  it("rejects missing bundled-code attribution", async () => {
    const root = await createFixture({ notices: "# Third-party notices\n" });
    const result = runVerifier(root, `v${VERSION}`);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("THIRD_PARTY_NOTICES.md must include the Culori attribution.");
  });

  it("rejects an unidentified vendored snapshot", async () => {
    const root = await createFixture({ vendorSource: "export const parse = () => undefined;\n" });
    const result = runVerifier(root, `v${VERSION}`);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "The vendored Culori snapshot must identify its version, license, and author.",
    );
  });

  it("rejects a minified-looking vendored snapshot", async () => {
    const header =
      "/* Culori 4.0.2 — MIT — Copyright (c) 2018 Dan Burzo. See THIRD_PARTY_NOTICES.md. */";
    const root = await createFixture({ vendorSource: `${header}\n${"x".repeat(1_001)}\n` });
    const result = runVerifier(root, `v${VERSION}`);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "The vendored Culori snapshot contains a minified-looking long line.",
    );
  });

  it("rejects a vendored snapshot digest mismatch", async () => {
    const root = await createFixture({ vendorMetadata: "Snapshot SHA-256: `incorrect`\n" });
    const result = runVerifier(root, `v${VERSION}`);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "The vendored Culori snapshot does not match its recorded SHA-256 digest.",
    );
  });

  it.each([
    [0, "missing"],
    [2, "duplicate"],
  ])("rejects a %s release heading (%s)", async (headingCount) => {
    const root = await createFixture({ headingCount });
    const result = runVerifier(root, `v${VERSION}`);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      `CHANGELOG.md must contain exactly one dated ${VERSION} release heading.`,
    );
  });

  it.each([VERSION, "1.2.4", "1.3.0", "2.0.0"])(
    "rejects a non-lower comparison version %s",
    async (previousVersion) => {
      const root = await createFixture({ previousVersion });
      const result = runVerifier(root, `v${VERSION}`);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        `CHANGELOG.md must link ${VERSION} from a lower previous stable version`,
      );
    },
  );
});

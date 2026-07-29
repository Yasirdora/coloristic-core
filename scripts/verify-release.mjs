import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const defaultPackageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = process.env.COLORISTIC_RELEASE_ROOT
  ? resolve(process.env.COLORISTIC_RELEASE_ROOT)
  : defaultPackageRoot;
const [packageText, lockText, changelog, thirdPartyNotices, vendoredCulori, vendorMetadata] =
  await Promise.all([
    readFile(resolve(packageRoot, "package.json"), "utf8"),
    readFile(resolve(packageRoot, "package-lock.json"), "utf8"),
    readFile(resolve(packageRoot, "CHANGELOG.md"), "utf8"),
    readFile(resolve(packageRoot, "THIRD_PARTY_NOTICES.md"), "utf8"),
    readFile(resolve(packageRoot, "src/vendor/culori.js"), "utf8"),
    readFile(resolve(packageRoot, "src/vendor/README.md"), "utf8"),
  ]);
const packageJson = JSON.parse(packageText);
const packageLock = JSON.parse(lockText);
const rawTag = process.argv[2] ?? process.env.RELEASE_TAG ?? process.env.GITHUB_REF_NAME;
const stableVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sortedEntries(value, label) {
  if (value === undefined) return [];
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  return Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
}

function assertMatchingSection(section, lockRoot) {
  const manifestEntries = sortedEntries(packageJson[section], `package.json ${section}`);
  const lockEntries = sortedEntries(lockRoot[section], `package-lock.json root ${section}`);
  if (JSON.stringify(manifestEntries) !== JSON.stringify(lockEntries)) {
    throw new Error(`package-lock.json root ${section} does not match package.json.`);
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compareStableVersions(left, right) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

if (!rawTag) {
  throw new Error("Release tag is required as an argument, RELEASE_TAG, or GITHUB_REF_NAME.");
}

const { name, version } = packageJson;
if (typeof name !== "string" || name.length === 0) {
  throw new Error("package.json must contain a package name.");
}
if (typeof version !== "string" || !stableVersionPattern.test(version)) {
  throw new Error(`package.json version must be a stable canonical SemVer; received ${version}.`);
}

const expectedTag = `v${version}`;
if (rawTag !== expectedTag) {
  throw new Error(`Release tag must be ${expectedTag}; received ${rawTag}.`);
}

if (packageLock.lockfileVersion !== 3) {
  throw new Error("package-lock.json must use lockfileVersion 3.");
}
if (packageLock.name !== name || packageLock.version !== version) {
  throw new Error("package-lock.json name or version does not match package.json.");
}
const lockRoot = packageLock.packages?.[""];
if (!isRecord(lockRoot)) {
  throw new Error("package-lock.json is missing its root package entry.");
}
if (
  lockRoot.name !== name ||
  lockRoot.version !== version ||
  lockRoot.license !== packageJson.license
) {
  throw new Error("package-lock.json root package metadata does not match package.json.");
}
for (const section of [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
  "engines",
]) {
  assertMatchingSection(section, lockRoot);
}

for (const section of ["dependencies", "optionalDependencies", "peerDependencies"]) {
  if (sortedEntries(packageJson[section], `package.json ${section}`).length > 0) {
    throw new Error(`The published package must not declare ${section}.`);
  }
}
for (const scriptName of ["preinstall", "install", "postinstall"]) {
  if (packageJson.scripts?.[scriptName] !== undefined) {
    throw new Error(`The published package must not declare a ${scriptName} lifecycle script.`);
  }
}

for (const dependencyName of ["culori", "@types/culori"]) {
  if (packageJson.devDependencies?.[dependencyName] !== undefined) {
    throw new Error(`${dependencyName} must not remain in the published package manifest.`);
  }
  if (packageLock.packages?.[`node_modules/${dependencyName}`] !== undefined) {
    throw new Error(`${dependencyName} must not remain in the package lock.`);
  }
}
if (!thirdPartyNotices.includes("Culori") || !thirdPartyNotices.includes("Dan Burzo")) {
  throw new Error("THIRD_PARTY_NOTICES.md must include the Culori attribution.");
}
if (!vendoredCulori.startsWith("/* Culori 4.0.2 — MIT — Copyright (c) 2018 Dan Burzo.")) {
  throw new Error("The vendored Culori snapshot must identify its version, license, and author.");
}
const longestVendoredLine = Math.max(...vendoredCulori.split(/\r?\n/).map((line) => line.length));
if (longestVendoredLine > 1_000) {
  throw new Error("The vendored Culori snapshot contains a minified-looking long line.");
}
const vendoredCuloriSha256 = createHash("sha256").update(vendoredCulori).digest("hex");
if (!vendorMetadata.includes(`Snapshot SHA-256: \`${vendoredCuloriSha256}\``)) {
  throw new Error("The vendored Culori snapshot does not match its recorded SHA-256 digest.");
}

const escapedVersion = escapeRegExp(version);
const releaseHeadings = [
  ...changelog.matchAll(new RegExp(`^## \\[${escapedVersion}\\] - (\\d{4}-\\d{2}-\\d{2})$`, "gm")),
];
if (releaseHeadings.length !== 1) {
  throw new Error(`CHANGELOG.md must contain exactly one dated ${version} release heading.`);
}
const releaseDate = releaseHeadings[0]?.[1];
const parsedReleaseDate = new Date(`${releaseDate}T00:00:00.000Z`);
if (
  !releaseDate ||
  Number.isNaN(parsedReleaseDate.valueOf()) ||
  parsedReleaseDate.toISOString().slice(0, 10) !== releaseDate
) {
  throw new Error(`CHANGELOG.md contains an invalid release date for ${version}.`);
}

const repositoryUrl = "https://github.com/Yasirdora/coloristic-core";
const changelogLines = new Set(changelog.split(/\r?\n/));
const expectedUnreleasedLink = `[Unreleased]: ${repositoryUrl}/compare/${expectedTag}...HEAD`;
if (!changelogLines.has(expectedUnreleasedLink)) {
  throw new Error(`CHANGELOG.md must contain: ${expectedUnreleasedLink}`);
}
const releaseLinkPrefix = `[${version}]: ${repositoryUrl}/compare/v`;
const releaseLinkSuffix = `...${expectedTag}`;
const releaseLink = [...changelogLines].find(
  (line) => line.startsWith(releaseLinkPrefix) && line.endsWith(releaseLinkSuffix),
);
const previousVersion = releaseLink?.slice(releaseLinkPrefix.length, -releaseLinkSuffix.length);
if (
  !releaseLink ||
  !previousVersion ||
  !stableVersionPattern.test(previousVersion) ||
  compareStableVersions(previousVersion, version) >= 0
) {
  throw new Error(
    `CHANGELOG.md must link ${version} from a lower previous stable version on ${repositoryUrl}.`,
  );
}

console.log(
  `Verified ${name} ${version}: canonical tag, dependency-free runtime, audited vendored source, attribution, and changelog (${releaseDate}).`,
);

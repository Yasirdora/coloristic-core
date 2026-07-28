import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(resolve(packageRoot, "package.json"), "utf8"));
const rawTag = process.argv[2] ?? process.env.RELEASE_TAG ?? process.env.GITHUB_REF_NAME;

if (!rawTag) {
  throw new Error("Release tag is required as an argument, RELEASE_TAG, or GITHUB_REF_NAME.");
}

const tagVersion = rawTag.startsWith("v") ? rawTag.slice(1) : rawTag;
if (tagVersion !== packageJson.version) {
  throw new Error(`Release tag ${rawTag} does not match package version ${packageJson.version}.`);
}

console.log(`Release tag ${rawTag} matches ${packageJson.name} ${packageJson.version}.`);

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const ignoredDirectories = new Set([".git", ".temp", ".vercel", ".worktrees", "dist", "node_modules"]);
const ignoredFiles = new Set([
  "docs/superpowers/specs/2026-07-28-perk-brand-consistency-design.md",
  "docs/superpowers/plans/2026-07-28-perk-brand-consistency.md",
]);
const allowedValues = ["perkup.shop@youthserviceph.org"];
const legacyBrandPattern = new RegExp("perk" + "up", "i");
const violations = [];

const normalize = (value) => value.split(path.sep).join("/");
const removeAllowedValues = (value) =>
  allowedValues.reduce((result, allowed) => result.replaceAll(allowed, ""), value);

async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;

    const absolutePath = path.join(directory, entry.name);
    const relativePath = normalize(path.relative(root, absolutePath));

    if (entry.isDirectory()) {
      await scan(absolutePath);
      continue;
    }
    if (ignoredFiles.has(relativePath)) continue;

    if (legacyBrandPattern.test(removeAllowedValues(relativePath))) {
      violations.push(`${relativePath}: legacy brand in path`);
    }

    const buffer = await readFile(absolutePath);
    if (buffer.includes(0)) continue;

    const text = removeAllowedValues(buffer.toString("utf8"));
    text.split(/\r?\n/).forEach((line, index) => {
      if (legacyBrandPattern.test(line)) {
        violations.push(`${relativePath}:${index + 1}: ${line.trim()}`);
      }
    });
  }
}

await scan(root);

if (violations.length) {
  console.error(["Legacy brand references remain:", ...violations].join("\n"));
  process.exit(1);
}

console.log("Perk brand consistency check passed.");

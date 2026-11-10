/**
 * Writes the package.json for the API release uploaded to the droplet.
 * Usage: node infra/make-release-package.mjs <output path>
 *
 * The workspace packages are bundled into dist/server.js, so they are dropped
 * here. Third-party packages are pinned to the exact versions installed locally,
 * so the server runs what was built and tested. They are installed on the server
 * because sharp and Prisma ship platform-specific binaries. The prisma CLI is
 * included because the server runs the migrations.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const outPath = process.argv[2];
if (!outPath) {
  console.error("Usage: node infra/make-release-package.mjs <output path>");
  process.exit(1);
}

const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), "../apps/api");

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const moduleDir = (from, name) => join(from, "node_modules", ...name.split("/"));
const installedVersion = (from, name) => readJson(join(moduleDir(from, name), "package.json")).version;
const isWorkspace = (range) => String(range).startsWith("workspace:");

const api = readJson(join(apiDir, "package.json"));
const dependencies = {};

for (const [name, range] of Object.entries(api.dependencies ?? {})) {
  if (isWorkspace(range)) continue;
  dependencies[name] = installedVersion(apiDir, name);
}

// Third-party packages imported by bundled workspace code must exist at runtime.
for (const [name, range] of Object.entries(api.dependencies ?? {})) {
  if (!isWorkspace(range)) continue;
  const workspaceDir = moduleDir(apiDir, name);
  const workspace = readJson(join(workspaceDir, "package.json"));
  for (const [dep, depRange] of Object.entries(workspace.dependencies ?? {})) {
    if (isWorkspace(depRange) || dependencies[dep]) continue;
    dependencies[dep] = installedVersion(workspaceDir, dep);
  }
}

if (!api.devDependencies?.prisma) {
  console.error("apps/api must list prisma in devDependencies.");
  process.exit(1);
}
dependencies.prisma = installedVersion(apiDir, "prisma");

const sorted = Object.fromEntries(Object.entries(dependencies).sort(([a], [b]) => a.localeCompare(b)));

const release = {
  name: "kaamwala-api-release",
  private: true,
  version: api.version,
  type: "module",
  scripts: { start: "node dist/server.js" },
  dependencies: sorted,
};

writeFileSync(outPath, `${JSON.stringify(release, null, 2)}\n`);
console.log(`Wrote ${outPath} with ${Object.keys(sorted).length} dependencies.`);

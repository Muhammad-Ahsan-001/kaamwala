import { defineConfig } from "tsup";

const shared = {
  format: ["esm"] as const,
  target: "node24",
  // Workspace packages are bundled in, so a release needs only the npm dependencies.
  noExternal: [/^@kaamwala\//],
  splitting: false,
};

export default defineConfig([
  { ...shared, entry: { server: "src/server.ts" }, outDir: "dist" },
  { ...shared, entry: { seed: "prisma/seed.ts" }, outDir: "dist/seed" },
]);

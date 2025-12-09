// tsup.config.ts
import { defineConfig } from "tsup";

export default defineConfig({
   entry: {
      // main library
      index: "src/index.ts",

      // CLIs (match the bin paths in package.json)
      "cli/cli": "src/cli/cli.ts",
      "cli/migrator.index": "src/cli/migrator.index.ts",
      "cli/models.index": "src/cli/models.index.ts",
      "cli/ts.index": "src/cli/ts.index.ts"
   },

   outDir: "dist",

   format: ["esm"],
   platform: "node",
   target: "esnext",

   sourcemap: true,
   clean: true,
   splitting: false,   // 1 file per entry – nicer for CLIs
   treeshake: true,
   minify: false,

   dts: true,          // generate dist/*.d.ts for all entries

   // External deps (like @prisma/*) are left as imports by default,
   // so nothing weird gets bundled. No need to change external/noExternal.
});
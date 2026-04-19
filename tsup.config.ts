import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/main.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  banner: {
    js: "#!/usr/bin/env node",
  },
  sourcemap: true,
  clean: true,
  dts: false,
  shims: false,
  splitting: false,
  esbuildOptions(options) {
    options.supported = {
      ...options.supported,
      "node-colon-prefix-import": true,
      "node-colon-prefix-require": true,
    };
  },
});

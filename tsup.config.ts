import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/main.ts"],
  format: ["esm"],
  target: "node22",
  sourcemap: true,
  clean: true,
  dts: false,
  shims: false,
  splitting: false,
});

import typescript from "@rollup/plugin-typescript";
import css from "rollup-plugin-css-only";

export default [
  {
    input: "src/index.ts",
    output: {
      dir: "dist",
      format: "es",
    },
    external: ["mapbox-gl"],
    plugins: [typescript(), css({ output: "./dist/mapbox-gl-path.css" })],
  },
];

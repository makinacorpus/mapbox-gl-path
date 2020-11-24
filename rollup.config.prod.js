import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
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
    plugins: [
      resolve(),
      commonjs(),
      typescript(),
      css({ output: "./dist/mapbox-gl-path.css" }),
    ],
  },
];

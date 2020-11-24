import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";
import html from "@rollup/plugin-html";
import css from "rollup-plugin-css-only";
import serve from "rollup-plugin-serve";
import livereload from "rollup-plugin-livereload";

const mapboxglToken = process.env.mapboxglToken;

export default [
  {
    input: "src/index.ts",
    output: {
      dir: "dev",
      format: "es",
    },
    plugins: [
      resolve(),
      commonjs(),
      typescript(),
      html({
        fileName: "index.html",
        template: () => {
          const attribute = `lang= "en"`;
          const meta = `<meta charset="utf-8">`;
          const title = `mapbox-gl-path`;
          const linkFavicon = `<link rel="shortcut icon" type="image/x-icon" href="https://makina-corpus.com/favicon.ico">`;
          const linkMapbox = `<link href="https://api.mapbox.com/mapbox-gl-js/v1.12.0/mapbox-gl.css" rel="stylesheet" />`;
          const linkPage = `<link href="./mapbox-gl-path.css" rel="stylesheet" />`;
          const links = `${linkFavicon}${linkMapbox}${linkPage}`;
          const content = `<div id="map" style="width: 100vw; height: 100vh;"></div>`;
          const scriptMapbox = `<script src="https://api.mapbox.com/mapbox-gl-js/v1.12.0/mapbox-gl.js"></script>`;
          const scriptPage = `<script type="module">import MapboxPathControl from "./index.js"; mapboxgl.accessToken = ${mapboxglToken}; var map = new mapboxgl.Map({ container: "map", style: "mapbox://styles/mapbox/light-v10", center: [2.21, 46.22], zoom: 5 }); map.addControl(new MapboxPathControl());</script>`;
          const scripts = `${scriptMapbox}${scriptPage}`;
          return `<!DOCTYPE html><html ${attribute}><head>${meta}<title>${title}</title>${links}</head><body style="margin: 0">${content}${scripts}</body></html>`;
        },
      }),
      css({ output: "./dev/mapbox-gl-path.css" }),
      serve({ contentBase: "dev", port: 9000 }),
      livereload(),
    ],
  },
];

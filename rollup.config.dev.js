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
          const languageId = `'fr'`;
          const layersCustomisation = `{
            pointCircleLayerCustomisation: {
              paint: {
                "circle-radius": 10,
                "circle-color": "#FFFFFF",
                "circle-stroke-width": 1,
                "circle-stroke-color": "#0D47A1",
              },
            },
            pointTextLayerCustomisation: { paint: { "text-color": "#B71C1C" } },
            lineLayerCustomisation: {
              paint: { "line-width": 10, "line-color": "#0D47A1" },
            },
            dashedLineLayerCustomisation: {
              paint: {
                "line-width": 10,
                "line-color": "#0D47A1",
                "line-dasharray": [1, 1],
              },
            },
          }`;
          const featureCollection = `undefined`;
          const directionsThemes = `[{
            id: 1,
            name: "mapbox cycling",
            getPathByCoordinates: async (coordinates) =>
              await fetch(
                'https://api.mapbox.com/directions/v5/mapbox/cycling/'+coordinates[0].toString()+';'+coordinates[1].toString()+'?geometries=geojson&overview=full&access_token=${mapboxglToken.slice(
                  1,
                  -1
                )}',
                {
                  method: "GET",
                  headers: { "Content-Type": "application/json" },
                }
              )
                .then((response) => response.json())
                .then((data) => data.code === "Ok"
                      ? { coordinates: data.routes[0].geometry.coordinates, waypoints: { departure: data.waypoints[0].location, arrival: data.waypoints[1].location }}
                      : undefined
                )
          },
          {
            id: 2,
            name: "mapbox walking",
            getPathByCoordinates: async (coordinates) =>
              await fetch(
                'https://api.mapbox.com/directions/v5/mapbox/walking/'+coordinates[0].toString()+';'+coordinates[1].toString()+'?geometries=geojson&overview=full&access_token=${mapboxglToken.slice(
                  1,
                  -1
                )}',
                {
                  method: "GET",
                  headers: { "Content-Type": "application/json" },
                }
              )
                .then((response) => response.json())
                .then((data) => data.code === "Ok"
                      ? { coordinates: data.routes[0].geometry.coordinates, waypoints: { departure: data.waypoints[0].location, arrival: data.waypoints[1].location }}
                      : undefined
                )
          }
        ]`;
          const scriptPage = `<script type="module">import MapboxPathControl from "./index.js"; mapboxgl.accessToken = ${mapboxglToken}; var map = new mapboxgl.Map({ container: "map", style: "mapbox://styles/mapbox/light-v10", center: [2.21, 46.22], zoom: 5 }); window.mapboxPathControl = new MapboxPathControl({ languageId: ${languageId}, layersCustomisation: ${layersCustomisation}, featureCollection: ${featureCollection}, directionsThemes: ${directionsThemes}}); map.addControl(window.mapboxPathControl);</script>`;
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

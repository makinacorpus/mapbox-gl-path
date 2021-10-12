const convertNumberToAlpha = (num) => {
  const letterPosition = Math.floor(num / 26);
  return letterPosition >= 0
    ? convertNumberToAlpha(letterPosition - 1) +
        String.fromCharCode(65 + (num % 26))
    : "";
};

const expression = Array.from({ length: 78 }, (_, index) => {
  return [["==", ["get", "index"], index], convertNumberToAlpha(index)];
}).flat();

const pathControl = {
  layersCustomisation: {
    pointLayerList: [
      {
        paint: {
          "circle-radius": 14,
          "circle-color": "#f7d4bc",
        },
      },
      {
        paint: {
          "circle-radius": 10,
          "circle-color": "#ffffff",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#846b8a",
        },
      },
      {
        paint: {
          "text-color": "#000",
        },
        type: "symbol",
        layout: {
          "text-field": ["case", ...expression, ["get", "index"]],
          "text-size": 14,
          "text-allow-overlap": true,
        },
      },
    ],
    lineLayerList: [
      {
        paint: { "line-width": 8, "line-color": "#f7d4bc" },
      },
      {
        paint: { "line-width": 4, "line-color": "#846b8a" },
      },
      {
        type: "symbol",
        layout: {
          "icon-image": "arrow",
          "icon-size": 0.6,
          "symbol-placement": "line",
          "icon-allow-overlap": true,
        },
      },
    ],
    phantomJunctionLineLayerList: [
      {
        paint: {
          "line-width": 4,
          "line-color": "#c98bb9",
          "line-dasharray": [1, 1],
        },
      },
    ],
  },
  directionsThemes: ["walking", "cycling"].map((theme, index) => ({
    id: index,
    name: `${theme.slice(0, 1).toUpperCase()}${theme.slice(1)}`,
    selected: index === 0,
    getPathByCoordinates: async (coordinates) => {
      return fetch(
        `https://api.mapbox.com/directions/v5/mapbox/${theme}/${coordinates.join(
          ";"
        )}?geometries=geojson&overview=full&access_token=${
          process.env.NEXT_PUBLIC_MAPBOX_TOKEN
        }`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        }
      )
        .then((response) => response.json())
        .then((data) =>
          data.code === "Ok"
            ? {
                coordinates: data.routes[0].geometry.coordinates,
                waypoints: {
                  departure: data.waypoints[0].location,
                  arrival: data.waypoints[1].location,
                },
              }
            : undefined
        );
    },
  })),
  themeSelectionType: "select",
};

export const icons = [{ path: "/icons/map-arrow.png", name: "arrow" }];
export const map = {
  center: [2.3522, 48.8566],
  style: "mapbox://styles/mapbox/dark-v10",
};

export default {
  pathControl,
  icons,
  map,
};

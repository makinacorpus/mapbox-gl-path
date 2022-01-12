const pathControl = {
  layersCustomization: {
    pointLayerList: [
      {
        paint: {
          "circle-radius": 10,
          "circle-color": "#ffffff",
          "circle-stroke-width": 1,
          "circle-stroke-color": "#0d47a1",
        },
      },
      {
        paint: {
          "text-color": "#B71C1C",
        },
        type: "symbol",
        layout: {
          "text-field": ["to-string", ["+", ["get", "index"], 1]],
          "text-allow-overlap": true,
        },
      },
    ],
    lineLayerList: [
      {
        paint: { "line-width": 4, "line-color": "#0d47a1" },
      },
    ],
    phantomJunctionLineLayerList: [
      {
        paint: {
          "line-width": 4,
          "line-color": "#0d47a1",
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
};

export default pathControl;

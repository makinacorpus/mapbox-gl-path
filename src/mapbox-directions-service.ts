export const getPathByCoordinates = async (
  mapboxToken: string,
  coordinates: number[][]
): Promise<number[][] | undefined> => {
  return await fetch(
    `https://api.mapbox.com/directions/v5/mapbox/cycling/${coordinates[0].toString()};${coordinates[1].toString()}?geometries=geojson&overview=full&access_token=${mapboxToken}`,
    { method: "GET", headers: { "Content-Type": "application/json" } }
  )
    .then((response) => response.json())
    .then((data) =>
      data.code === "Ok" ? data.routes[0].geometry.coordinates : undefined
    );
};

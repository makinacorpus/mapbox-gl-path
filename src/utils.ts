import { LngLat } from "mapbox-gl";

export function getLngLat(lngLat: LngLat, round: number = 6) {
  return lngLat.toArray().map((num) => Number(num.toFixed(round)));
}

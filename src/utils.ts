import { LngLat } from "mapbox-gl";

export function createElement(tagName: string, props: object = {}) {
  const element = document.createElement(tagName);
  if (tagName === "button") {
    element.setAttribute("type", "button");
  }
  return Object.assign(element, props);
}

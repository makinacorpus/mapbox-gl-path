import { GeoJSONSourceRaw, AnyLayout, AnyPaint } from "mapbox-gl";

export const sourcePointAndLineId = "gl-pathControl-points-and-lines";
export const pointCircleLayerId = "gl-pathControl-reference-points-circle";
export const pointTextLayerId = "gl-pathControl-reference-points-text";
export const betweenPointsLineLayerId = "gl-pathControl-between-points-lines";
export const phantomJunctionLineLayerId =
  "gl-pathControl-phantom-junction-lines";

export const pointsAndLinesSource: GeoJSONSourceRaw = {
  type: "geojson",
  data: { type: "FeatureCollection", features: [] },
};

export const defaultPointLayerList = [
  {
    paint: { "circle-radius": 10, "circle-color": "#000000" },
  },
  {
    type: "symbol",
    paint: { "text-color": "#FFFFFF" },
    layout: {
      "text-field": ["to-string", ["+", ["get", "index"], 1]],
      "text-allow-overlap": true,
    },
  },
];

export const defaultLineLayerList = [
  {
    paint: { "line-width": 10, "line-color": "#000000" },
  },
];

export const defaultPhantomJunctionLineLayerList = [
  {
    paint: {
      "line-width": 10,
      "line-color": "#000000",
      "line-dasharray": [1, 1],
    },
  },
];

export interface LayersCustomization {
  lineLayerList: LayerCustomization[];
  phantomJunctionLineLayerList: LayerCustomization[];
  pointLayerList: LayerCustomization[];
}

export interface LayerCustomization {
  id: string | undefined;
  layout: AnyLayout;
  paint: AnyPaint;
  type: string | undefined;
}

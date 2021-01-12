import { Layer, GeoJSONSourceRaw, AnyLayout, AnyPaint } from "mapbox-gl";

export const sourcePointAndLineId = "gl-pathControl-points-and-lines";
export const pointCircleLayerId = "gl-pathControl-reference-points-circle";
export const pointTextLayerId = "gl-pathControl-reference-points-text";
export const betweenPointsLineLayerId = "gl-pathControl-between-points-lines";
export const phantomJunctionLineLayerId = "gl-pathControl-phantom-junction-lines";

export const pointsAndLinesSource: GeoJSONSourceRaw = {
  type: "geojson",
  data: { type: "FeatureCollection", features: [] },
};

export const referencePointsCircleLayer: Layer = {
  id: pointCircleLayerId,
  type: "circle",
  source: sourcePointAndLineId,
  paint: { "circle-radius": 10, "circle-color": "#000000" },
  filter: ["in", "$type", "Point"],
};

export const referencePointsTextLayer: Layer = {
  id: pointTextLayerId,
  type: "symbol",
  source: sourcePointAndLineId,
  paint: { "text-color": "#FFFFFF" },
  layout: {
    "text-field": ["to-string", ["+", ["get", "index"], 1]],
    "text-allow-overlap": true,
  },
  filter: ["in", "$type", "Point"],
};

export const betweenPointsLineLayer: Layer = {
  id: betweenPointsLineLayerId,
  type: "line",
  source: sourcePointAndLineId,
  paint: { "line-width": 10, "line-color": "#000000" },
  filter: ["all", ["in", "$type", "LineString"], ["!has", "isPhantomJunction"]],
};

export const phantomJunctionLineLayer: Layer = {
  id: phantomJunctionLineLayerId,
  type: "line",
  source: sourcePointAndLineId,
  paint: {
    "line-width": 10,
    "line-color": "#000000",
    "line-dasharray": [1, 1],
  },
  filter: ["all", ["in", "$type", "LineString"], ["has", "isPhantomJunction"]],
};

export interface LayersCustomisation {
  pointCircleLayerCustomisation: LayerCustomisation;
  pointTextLayerCustomisation: LayerCustomisation;
  lineLayerCustomisation: LayerCustomisation;
  phantomJunctionLineLayerCustomisation: LayerCustomisation;
}

export interface LayerCustomisation {
  layout: AnyLayout;
  paint: AnyPaint;
}

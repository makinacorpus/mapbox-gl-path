import { Feature } from "geojson";
import {
  Map,
  IControl,
  MapMouseEvent,
  GeoJSONSource,
  GeoJSONSourceRaw,
  Layer,
} from "mapbox-gl";
import "./mapbox-gl-path.css";

export default class MapboxPathControl implements IControl {
  private map: Map | undefined;
  private pathControl: HTMLElement | undefined;
  private referencePoints: Feature[] = [];

  constructor() {}

  public onAdd(currentMap: Map): HTMLElement {
    this.map = currentMap;

    this.pathControl = document.createElement("div");
    this.pathControl.innerHTML = "mapbox-gl-path";
    this.pathControl.className = "mapbox-gl-path-container";

    this.map.on("load", () => this.configureMap());

    return this.pathControl;
  }

  public onRemove(): void {
    this.pathControl?.parentNode?.removeChild(this.pathControl);
    this.map = undefined;
  }

  private configureMap(): void {
    console.log("configureMap");

    const referencePointsSource: GeoJSONSourceRaw = {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    };
    const referencePointsLayerCircle: Layer = {
      id: "reference-points-circle",
      type: "circle",
      source: "reference-points",
      paint: { "circle-radius": 10, "circle-color": "#000000" },
    };
    const referencePointsLayerText: Layer = {
      id: "reference-points-text",
      type: "symbol",
      source: "reference-points",
      paint: { "text-color": "#ffffff" },
      layout: { "text-field": ["get", "id"] },
    };
    this.map?.addSource("reference-points", referencePointsSource);
    this.map?.addLayer(referencePointsLayerCircle);
    this.map?.addLayer(referencePointsLayerText);

    this.map?.on("click", this.onClickMap.bind(this));
  }

  private onClickMap(event: MapMouseEvent): void {
    console.log("onClickMap");

    const referencePoint: Feature = {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [event.lngLat.lng, event.lngLat.lat],
      },
      properties: { id: this.referencePoints.length + 1 },
    };
    this.referencePoints.push(referencePoint);

    const data: GeoJSON.FeatureCollection<GeoJSON.Geometry> = {
      type: "FeatureCollection",
      features: this.referencePoints,
    };
    (this.map?.getSource("reference-points") as GeoJSONSource).setData(data);
  }
}

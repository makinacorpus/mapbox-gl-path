import { Feature } from "geojson";
import {
  Map,
  IControl,
  MapMouseEvent,
  GeoJSONSource,
  GeoJSONSourceRaw,
  Layer,
  MapboxGeoJSONFeature,
} from "mapbox-gl";
import "./mapbox-gl-path.css";

export default class MapboxPathControl implements IControl {
  private map: Map | undefined;
  private pathControl: HTMLElement | undefined;
  private referencePoints: Feature[] = [];
  private selectedReferencePoint: Feature | undefined;
  private linesBetweenReferencePoints: Feature[] = [];
  private onMovePointBind = this.onMovePoint.bind(this);

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
    const pointsAndLinesSource: GeoJSONSourceRaw = {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    };
    const referencePointsLayerCircle: Layer = {
      id: "reference-points-circle",
      type: "circle",
      source: "points-and-lines",
      paint: { "circle-radius": 10, "circle-color": "#000000" },
      filter: ["in", "$type", "Point"],
    };
    const referencePointsLayerText: Layer = {
      id: "reference-points-text",
      type: "symbol",
      source: "points-and-lines",
      paint: { "text-color": "#ffffff" },
      layout: {
        "text-field": ["to-string", ["+", ["get", "index"], 1]],
        "text-allow-overlap": true,
      },
      filter: ["in", "$type", "Point"],
    };
    const referencePointsLayerLine: Layer = {
      id: "between-points-line",
      type: "line",
      source: "points-and-lines",
      paint: { "line-color": "#000000" },
      filter: ["in", "$type", "LineString"],
    };
    this.map!.addSource("points-and-lines", pointsAndLinesSource);
    this.map!.addLayer(referencePointsLayerCircle);
    this.map!.addLayer(referencePointsLayerText);
    this.map!.addLayer(referencePointsLayerLine, "reference-points-circle");

    this.map!.on("click", this.onClickMap.bind(this));
    this.map!.on("mouseenter", "reference-points-circle", () => {
      this.map!.getCanvas().style.cursor = "pointer";
    });
    this.map!.on("mouseleave", "reference-points-circle", () => {
      this.map!.getCanvas().style.cursor = "";
    });
    this.map!.on("mousedown", "reference-points-circle", (event) => {
      event.preventDefault();
      const referencePointsUnderMouse: MapboxGeoJSONFeature[] = this.map!.queryRenderedFeatures(
        event.point,
        {
          layers: ["reference-points-circle"],
        }
      );

      if (referencePointsUnderMouse && referencePointsUnderMouse.length > 0) {
        this.map!.getCanvas().style.cursor = "grab";
        this.selectedReferencePoint = referencePointsUnderMouse[0];
        this.map!.on("mousemove", this.onMovePointBind);
        this.map!.once("mouseup", this.onUpPoint.bind(this));
      }
    });
  }

  private onClickMap(event: MapMouseEvent): void {
    const referencePointIsUnderMouse: boolean = Boolean(
      this.map!.queryRenderedFeatures(event.point, {
        layers: ["reference-points-circle"],
      }).length
    );

    if (!referencePointIsUnderMouse) {
      const referencePoint: Feature = {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [event.lngLat.lng, event.lngLat.lat],
        },
        properties: { index: this.referencePoints.length },
      };
      this.referencePoints.push(referencePoint);

      if (this.referencePoints.length > 1) {
        const previousReferencePoint = this.referencePoints[
          this.referencePoints.length - 2
        ];
        const lineBetweenReferencePoint: Feature = {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              (previousReferencePoint.geometry as any).coordinates,
              [event.lngLat.lng, event.lngLat.lat],
            ],
          },
          properties: { index: this.referencePoints.length },
        };
        this.linesBetweenReferencePoints.push(lineBetweenReferencePoint);
      }

      const data: GeoJSON.FeatureCollection<GeoJSON.Geometry> = {
        type: "FeatureCollection",
        features: [
          ...this.referencePoints,
          ...this.linesBetweenReferencePoints,
        ],
      };
      (this.map!.getSource("points-and-lines") as GeoJSONSource).setData(data);
    }
  }

  private onMovePoint(event: MapMouseEvent): void {
    this.map!.getCanvas().style.cursor = "grabbing";
    (this.referencePoints[this.selectedReferencePoint!.properties!.index]
      .geometry as any).coordinates = [event.lngLat.lng, event.lngLat.lat];

    if (
      this.selectedReferencePoint!.properties!.index === 0 &&
      this.referencePoints.length > 1
    ) {
      (this.linesBetweenReferencePoints[
        this.selectedReferencePoint!.properties!.index
      ].geometry as any).coordinates = [
        [event.lngLat.lng, event.lngLat.lat],
        (this.linesBetweenReferencePoints[
          this.selectedReferencePoint!.properties!.index
        ].geometry as any).coordinates[1],
      ];
    } else if (
      this.selectedReferencePoint!.properties!.index ===
      this.referencePoints.length - 1
    ) {
      (this.linesBetweenReferencePoints[
        this.selectedReferencePoint!.properties!.index - 1
      ].geometry as any).coordinates = [
        (this.linesBetweenReferencePoints[
          this.selectedReferencePoint!.properties!.index - 1
        ].geometry as any).coordinates[0],
        [event.lngLat.lng, event.lngLat.lat],
      ];
    } else {
      (this.linesBetweenReferencePoints[
        this.selectedReferencePoint!.properties!.index
      ].geometry as any).coordinates = [
        [event.lngLat.lng, event.lngLat.lat],
        (this.linesBetweenReferencePoints[
          this.selectedReferencePoint!.properties!.index
        ].geometry as any).coordinates[1],
      ];
      (this.linesBetweenReferencePoints[
        this.selectedReferencePoint!.properties!.index - 1
      ].geometry as any).coordinates = [
        (this.linesBetweenReferencePoints[
          this.selectedReferencePoint!.properties!.index - 1
        ].geometry as any).coordinates[0],
        [event.lngLat.lng, event.lngLat.lat],
      ];
    }

    const data: GeoJSON.FeatureCollection<GeoJSON.Geometry> = {
      type: "FeatureCollection",
      features: [...this.referencePoints, ...this.linesBetweenReferencePoints],
    };
    (this.map!.getSource("points-and-lines") as GeoJSONSource).setData(data);
  }

  private onUpPoint(): void {
    this.map!.off("mousemove", this.onMovePointBind);
    this.map!.getCanvas().style.cursor = "grab";
  }
}

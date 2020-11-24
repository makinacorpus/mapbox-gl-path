import { Feature, Point, LineString } from "geojson";
import {
  Map,
  IControl,
  MapMouseEvent,
  GeoJSONSource,
  GeoJSONSourceRaw,
  Layer,
  MapboxGeoJSONFeature,
  Popup,
} from "mapbox-gl";
import { point, lineString } from "@turf/helpers";
import nearestPointOnLine from "@turf/nearest-point-on-line";
import "./mapbox-gl-path.css";

export default class MapboxPathControl implements IControl {
  private map: Map | undefined;
  private pathControl: HTMLElement | undefined;
  private referencePoints: Feature[] = [];
  private selectedReferencePoint: Feature | undefined;
  private linesBetweenReferencePoints: Feature[] = [];
  private onMovePointBind = this.onMovePoint.bind(this);
  private actionsPanel: Popup = new Popup();

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
      paint: { "line-color": "#000000", "line-width": 10 },
      filter: ["in", "$type", "LineString"],
    };
    this.map!.addSource("points-and-lines", pointsAndLinesSource);
    this.map!.addLayer(referencePointsLayerCircle);
    this.map!.addLayer(referencePointsLayerText);
    this.map!.addLayer(referencePointsLayerLine, "reference-points-circle");

    this.map!.on("click", this.onClickMap.bind(this));
    this.map!.on("contextmenu", this.onContextMenu.bind(this));
    this.map!.on("mouseenter", "reference-points-circle", () => {
      this.map!.getCanvas().style.cursor = "pointer";
    });
    this.map!.on("mouseleave", "reference-points-circle", () => {
      this.map!.getCanvas().style.cursor = "";
    });
    this.map!.on("mouseenter", "between-points-line", () => {
      this.map!.getCanvas().style.cursor = "pointer";
    });
    this.map!.on("mouseleave", "between-points-line", () => {
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
    if (this.actionsPanel.isOpen()) {
      this.actionsPanel.remove();
      return;
    }
    const referencePointOrLineIsUnderMouse: boolean = Boolean(
      this.map!.queryRenderedFeatures(event.point, {
        layers: ["reference-points-circle", "between-points-line"],
      }).length
    );

    if (!referencePointOrLineIsUnderMouse) {
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
          properties: { index: this.linesBetweenReferencePoints.length },
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

    if (this.actionsPanel.isOpen()) {
      this.actionsPanel.remove();
    }

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

  private onContextMenuPoint(event: MapMouseEvent): void {
    event.preventDefault();
    const referencePointsUnderMouse: MapboxGeoJSONFeature[] = this.map!.queryRenderedFeatures(
      event.point,
      {
        layers: ["reference-points-circle"],
      }
    );

    if (referencePointsUnderMouse && referencePointsUnderMouse.length > 0) {
      this.selectedReferencePoint = referencePointsUnderMouse[0];
      const deleteButton = document.createElement("button");
      deleteButton.innerHTML = "Supprimer";
      deleteButton.setAttribute("type", "button");
      deleteButton.onclick = this.deletePoint.bind(this);
      this.actionsPanel
        .setLngLat([event.lngLat.lng, event.lngLat.lat])
        .setDOMContent(deleteButton)
        .addTo(this.map!);
    }
  }

  private deletePoint(): void {
    if (this.selectedReferencePoint!.properties!.index === 0) {
      this.referencePoints.shift();
      if (this.referencePoints.length > 0) {
        this.linesBetweenReferencePoints.shift();
      }
      this.syncIndex();
    } else if (
      this.selectedReferencePoint!.properties!.index ===
      this.referencePoints.length - 1
    ) {
      this.referencePoints.splice(
        this.selectedReferencePoint!.properties!.index,
        1
      );
      this.linesBetweenReferencePoints.splice(
        this.selectedReferencePoint!.properties!.index - 1,
        1
      );
    } else {
      (this.linesBetweenReferencePoints[
        this.selectedReferencePoint!.properties!.index - 1
      ]!.geometry as any).coordinates = [
        (this.referencePoints[
          this.selectedReferencePoint!.properties!.index - 1
        ].geometry as any).coordinates,
        (this.referencePoints[
          this.selectedReferencePoint!.properties!.index + 1
        ].geometry as any).coordinates,
      ];
      this.referencePoints.splice(
        this.selectedReferencePoint!.properties!.index,
        1
      );
      this.linesBetweenReferencePoints.splice(
        this.selectedReferencePoint!.properties!.index,
        1
      );
      this.syncIndex();
    }

    const data: GeoJSON.FeatureCollection<GeoJSON.Geometry> = {
      type: "FeatureCollection",
      features: [...this.referencePoints, ...this.linesBetweenReferencePoints],
    };
    (this.map!.getSource("points-and-lines") as GeoJSONSource).setData(data);
    this.actionsPanel.remove();
  }

  private syncIndex(): void {
    this.referencePoints.map((point, index) => {
      point.properties!.index = index;
    });
    this.linesBetweenReferencePoints.map((line, index) => {
      line.properties!.index = index;
    });
  }

  private onContextMenu(event: MapMouseEvent): void {
    const featuresUnderMouse: MapboxGeoJSONFeature[] = this.map!.queryRenderedFeatures(
      event.point,
      {
        layers: ["reference-points-circle", "between-points-line"],
      }
    );
    if (featuresUnderMouse.length > 0) {
      if (
        featuresUnderMouse.find((feature) => {
          return feature.layer.id === "reference-points-circle";
        })
      ) {
        this.onContextMenuPoint(event);
      } else {
        this.onContextMenuLine(event);
      }
    }
  }

  private onContextMenuLine(event: MapMouseEvent): void {
    const createNewPointOnLine = document.createElement("button");
    createNewPointOnLine.innerHTML = "Créer un nouveau point";
    createNewPointOnLine.setAttribute("type", "button");
    createNewPointOnLine.onclick = this.createNewPoint.bind(this, event);
    const createIntermediatePointOnLine = document.createElement("button");
    createIntermediatePointOnLine.innerHTML = "Créer un point intermédiaire";
    createIntermediatePointOnLine.setAttribute("type", "button");
    createIntermediatePointOnLine.onclick = this.createIntermediatePoint.bind(
      this,
      event
    );
    const actionsPanelContainer = document.createElement("div");
    actionsPanelContainer.append(
      createNewPointOnLine,
      createIntermediatePointOnLine
    );

    this.actionsPanel
      .setLngLat([event.lngLat.lng, event.lngLat.lat])
      .setDOMContent(actionsPanelContainer)
      .addTo(this.map!);
  }

  private createNewPoint(event: MapMouseEvent): void {
    const lineUnderMouse: MapboxGeoJSONFeature[] = this.map!.queryRenderedFeatures(
      event.point,
      {
        layers: ["between-points-line"],
      }
    );
    if (lineUnderMouse.length > 0) {
      const currentLineString: Feature<LineString> = lineString(
        (lineUnderMouse[0].geometry as any).coordinates
      );
      const currentPoint: Feature<Point> = point([
        event.lngLat.lng,
        event.lngLat.lat,
      ]);
      const nearestPoint: Feature = nearestPointOnLine(
        currentLineString,
        currentPoint
      );

      const referencePoint: Feature = {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: (nearestPoint.geometry as any).coordinates,
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
              (nearestPoint.geometry as any).coordinates,
            ],
          },
          properties: { index: this.linesBetweenReferencePoints.length },
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
      this.actionsPanel.remove();
    }
  }

  private createIntermediatePoint(event: MapMouseEvent): void {
    console.log("createIntermediatePoint", event);
    const lineUnderMouse: MapboxGeoJSONFeature[] = this.map!.queryRenderedFeatures(
      event.point,
      {
        layers: ["between-points-line"],
      }
    );
    if (lineUnderMouse.length > 0) {
      const lineUnderMouseIndex: number = lineUnderMouse[0].properties!.index;
      const currentLineString: Feature<LineString> = lineString(
        (lineUnderMouse[0].geometry as any).coordinates
      );
      const currentPoint: Feature<Point> = point([
        event.lngLat.lng,
        event.lngLat.lat,
      ]);
      const nearestPoint: Feature = nearestPointOnLine(
        currentLineString,
        currentPoint
      );

      const referencePoint: Feature = {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: (nearestPoint.geometry as any).coordinates,
        },
        properties: { index: this.referencePoints.length },
      };
      this.referencePoints.splice(lineUnderMouseIndex + 1, 0, referencePoint);

      if (this.referencePoints.length > 1) {
        const previousReferencePoint = this.referencePoints[
          lineUnderMouseIndex
        ];
        const nextReferencePoint = this.referencePoints[
          lineUnderMouseIndex + 2
        ];
        const previousLineBetweenReferencePoint: Feature = {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              (previousReferencePoint.geometry as any).coordinates,
              (nearestPoint.geometry as any).coordinates,
            ],
          },
          properties: { index: this.linesBetweenReferencePoints.length },
        };
        const nextLineBetweenReferencePoint: Feature = {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              (nearestPoint.geometry as any).coordinates,
              (nextReferencePoint.geometry as any).coordinates,
            ],
          },
          properties: { index: this.linesBetweenReferencePoints.length },
        };
        this.linesBetweenReferencePoints.splice(
          lineUnderMouseIndex,
          1,
          previousLineBetweenReferencePoint
        );
        this.linesBetweenReferencePoints.splice(
          lineUnderMouseIndex + 1,
          0,
          nextLineBetweenReferencePoint
        );
      }

      this.syncIndex();
      const data: GeoJSON.FeatureCollection<GeoJSON.Geometry> = {
        type: "FeatureCollection",
        features: [
          ...this.referencePoints,
          ...this.linesBetweenReferencePoints,
        ],
      };
      (this.map!.getSource("points-and-lines") as GeoJSONSource).setData(data);
      this.actionsPanel.remove();
    }
  }
}

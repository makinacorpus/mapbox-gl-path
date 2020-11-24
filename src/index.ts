import { Feature, Point, LineString } from "geojson";
import { Map, IControl, MapMouseEvent, GeoJSONSource, Popup } from "mapbox-gl";
import { point, lineString } from "@turf/helpers";
import nearestPointOnLine from "@turf/nearest-point-on-line";
import lineSplit from "@turf/line-split";
import debounce from "lodash.debounce";
import {
  sourcePointAndLineId,
  pointsAndLinesSource,
  pointCircleLayerId,
  betweenPointsLineLayerId,
  referencePointsCircleLayer,
  referencePointsTextLayer,
  betweenPointsLineLayer,
} from "./source-and-layers";
import { getPathByCoordinates } from "./mapbox-directions-service";
import "./mapbox-gl-path.css";

export default class MapboxPathControl implements IControl {
  private map: Map | undefined;
  private mapboxToken = "";
  private pathControl: HTMLElement | undefined;
  private referencePoints: Feature<Point>[] = [];
  private selectedReferencePointIndex: number | undefined;
  private linesBetweenReferencePoints: Feature<LineString>[] = [];
  private onMovePointFunction = (event: MapMouseEvent) =>
    this.onMovePoint(event);
  private changeDirectionsModeOnPreviousLineWithDebounce = debounce(
    this.changeDirectionsModeOnLine,
    500,
    { maxWait: 1000 }
  );
  private changeDirectionsModeOnNextLineWithDebounce = debounce(
    this.changeDirectionsModeOnLine,
    500,
    { maxWait: 1000 }
  );
  private actionsPanel: Popup = new Popup();
  private directionsIsActive = false;

  constructor(
    mapboxToken: string,
    featureCollection: GeoJSON.FeatureCollection<GeoJSON.Geometry> | undefined
  ) {
    this.mapboxToken = mapboxToken;

    if (featureCollection) {
      this.referencePoints = featureCollection.features
        .filter((feature) => feature.geometry.type === "Point")
        .sort((a, b) => {
          if (a.properties!.index > b.properties!.index) {
            return 1;
          } else if (a.properties!.index < b.properties!.index) {
            return -1;
          }
          return 0;
        }) as Feature<Point>[];
      this.linesBetweenReferencePoints = featureCollection.features
        .filter((feature) => feature.geometry.type === "LineString")
        .sort((a, b) => {
          if (a.properties!.index > b.properties!.index) {
            return 1;
          } else if (a.properties!.index < b.properties!.index) {
            return -1;
          }
          return 0;
        }) as Feature<LineString>[];
    }
  }

  public onAdd(currentMap: Map): HTMLElement {
    this.map = currentMap;

    this.pathControl = this.createUI();

    this.map.on("load", () => this.configureMap());

    return this.pathControl;
  }

  public onRemove(): void {
    this.pathControl?.remove();
    this.map = undefined;
  }

  private createUI(): HTMLDivElement {
    const pathControlContainer = document.createElement("div");
    pathControlContainer.className = "mapbox-gl-path-container";
    const pathControlCheckbox = document.createElement("input");
    pathControlCheckbox.setAttribute("id", "checkbox-path");
    pathControlCheckbox.setAttribute("type", "checkbox");
    pathControlCheckbox.addEventListener(
      "change",
      (event) =>
        (this.directionsIsActive = (event.target as HTMLInputElement).checked)
    );
    const pathControlSelect = document.createElement("select");
    pathControlSelect.setAttribute("disabled", "true");
    const pathControlSelectOption = document.createElement("option");
    pathControlSelectOption.textContent = "Mapbox";
    const pathControlLabel = document.createElement("label");
    pathControlLabel.textContent = "Suivre la direction";
    pathControlLabel.setAttribute("for", "checkbox-path");

    pathControlSelect.append(pathControlSelectOption);
    pathControlContainer.append(
      pathControlCheckbox,
      pathControlLabel,
      pathControlSelect
    );

    return pathControlContainer;
  }

  private configureMap(): void {
    this.initializeSourceAndLayers();
    this.initializeEvents();

    if (this.referencePoints.length > 0) {
      this.updateSource();
    }
  }

  private initializeSourceAndLayers(): void {
    this.map!.addSource(sourcePointAndLineId, pointsAndLinesSource);
    this.map!.addLayer(referencePointsCircleLayer);
    this.map!.addLayer(referencePointsTextLayer);
    this.map!.addLayer(betweenPointsLineLayer, pointCircleLayerId);
  }

  private initializeEvents(): void {
    this.map!.on("click", (event) => this.onClickMap(event));
    this.map!.on("contextmenu", (event) => this.onContextMenuMap(event));
    this.map!.on("mousedown", pointCircleLayerId, (event) =>
      this.onMouseDownPoint(event)
    );

    this.map!.on("mouseenter", pointCircleLayerId, () =>
      this.handleMapCursor("pointer")
    );
    this.map!.on("mouseleave", pointCircleLayerId, () =>
      this.handleMapCursor("")
    );
    this.map!.on("mouseenter", betweenPointsLineLayerId, () =>
      this.handleMapCursor("pointer")
    );
    this.map!.on("mouseleave", betweenPointsLineLayerId, () =>
      this.handleMapCursor("")
    );
  }

  private handleMapCursor(cursor: string): void {
    this.map!.getCanvas().style.cursor = cursor;
  }

  private async onClickMap(event: MapMouseEvent): Promise<void> {
    if (this.actionsPanel.isOpen()) {
      this.actionsPanel.remove();
      return;
    }

    const referencePointOrLineIsUnderMouse: boolean = Boolean(
      this.map!.queryRenderedFeatures(event.point, {
        layers: [pointCircleLayerId, betweenPointsLineLayerId],
      }).length
    );

    if (!referencePointOrLineIsUnderMouse) {
      const newPointCoordinates = event.lngLat.toArray();
      const previousReferencePoint: Feature<Point> | null =
        this.referencePoints.length > 0
          ? this.referencePoints[this.referencePoints.length - 1]
          : null;

      if (previousReferencePoint) {
        const line = this.directionsIsActive
          ? await getPathByCoordinates(this.mapboxToken, [
              previousReferencePoint.geometry.coordinates,
              newPointCoordinates,
            ])
          : [previousReferencePoint.geometry.coordinates, newPointCoordinates];
        if (line) {
          this.createNewPointAndLine(
            newPointCoordinates,
            this.directionsIsActive,
            line
          );
        }
      } else {
        this.createNewPointAndLine(
          newPointCoordinates,
          this.directionsIsActive
        );
      }
    }
  }

  private onContextMenuMap(event: MapMouseEvent): void {
    const featuresUnderMouse = this.map!.queryRenderedFeatures(event.point, {
      layers: [pointCircleLayerId, betweenPointsLineLayerId],
    });

    if (featuresUnderMouse.length > 0) {
      featuresUnderMouse.find(
        (feature) => feature.layer.id === pointCircleLayerId
      )
        ? this.onContextMenuPoint(event)
        : this.onContextMenuLine(event);
    }
  }

  private onContextMenuPoint(event: MapMouseEvent): void {
    event.preventDefault();

    const referencePointsUnderMouse = this.map!.queryRenderedFeatures(
      event.point,
      {
        layers: [pointCircleLayerId],
      }
    );

    if (referencePointsUnderMouse.length > 0) {
      const deleteButton = document.createElement("button");
      deleteButton.textContent = "Supprimer";
      deleteButton.setAttribute("type", "button");
      deleteButton.onclick = () => this.deletePoint();

      this.selectedReferencePointIndex = referencePointsUnderMouse[0].properties!.index;
      this.actionsPanel
        .setLngLat(event.lngLat)
        .setDOMContent(deleteButton)
        .addTo(this.map!);
    }
  }

  private onContextMenuLine(event: MapMouseEvent): void {
    const createNewPointOnLineButton = document.createElement("button");
    createNewPointOnLineButton.textContent = "Créer un nouveau point";
    createNewPointOnLineButton.setAttribute("type", "button");
    createNewPointOnLineButton.onclick = () => this.createNewPointOnLine(event);
    const createIntermediatePointOnLineButton = document.createElement(
      "button"
    );
    createIntermediatePointOnLineButton.textContent =
      "Créer un point intermédiaire";
    createIntermediatePointOnLineButton.setAttribute("type", "button");
    createIntermediatePointOnLineButton.onclick = () =>
      this.createIntermediatePointOnLine(event);

    const lineUnderMouse = this.map!.queryRenderedFeatures(event.point, {
      layers: [betweenPointsLineLayerId],
    }) as Feature<LineString>[];
    const changePathModeOnButton = document.createElement("button");
    changePathModeOnButton.textContent = lineUnderMouse[0].properties!
      .directionsIsActive
      ? "Désactiver la direction"
      : "Activer la direction";
    changePathModeOnButton.setAttribute("type", "button");
    changePathModeOnButton.onclick = () =>
      this.changeDirectionsModeOnLine(lineUnderMouse[0]);
    const actionsPanelContainer = document.createElement("div");
    actionsPanelContainer.append(
      createNewPointOnLineButton,
      createIntermediatePointOnLineButton,
      changePathModeOnButton
    );

    this.actionsPanel
      .setLngLat(event.lngLat)
      .setDOMContent(actionsPanelContainer)
      .addTo(this.map!);
  }

  private onMouseDownPoint(event: MapMouseEvent): void {
    event.preventDefault();

    const referencePointsUnderMouse = this.map!.queryRenderedFeatures(
      event.point,
      {
        layers: [pointCircleLayerId],
      }
    );

    if (referencePointsUnderMouse.length > 0) {
      this.handleMapCursor("grab");
      this.selectedReferencePointIndex = referencePointsUnderMouse[0].properties!.index;
      this.map!.on("mousemove", this.onMovePointFunction);
      this.map!.once("mouseup", () => this.onUpPoint());
    }
  }

  private onMovePoint(event: MapMouseEvent): void {
    const eventCoordinates = event.lngLat.toArray();
    const previousLine = this.linesBetweenReferencePoints[
      this.selectedReferencePointIndex! - 1
    ];
    const nextLine = this.linesBetweenReferencePoints[
      this.selectedReferencePointIndex!
    ];

    this.handleMapCursor("grabbing");

    if (this.actionsPanel.isOpen()) {
      this.actionsPanel.remove();
    }

    this.referencePoints[
      this.selectedReferencePointIndex!
    ].geometry.coordinates = eventCoordinates;
    if (
      this.selectedReferencePointIndex! === 0 &&
      this.referencePoints.length > 1
    ) {
      if (nextLine && !nextLine.properties!.directionsIsActive) {
        this.linesBetweenReferencePoints[
          nextLine.properties!.index
        ].geometry.coordinates = [
          eventCoordinates,
          this.linesBetweenReferencePoints[nextLine.properties!.index].geometry
            .coordinates[1],
        ];
      }
    } else if (
      this.selectedReferencePointIndex! ===
      this.referencePoints.length - 1
    ) {
      if (previousLine && !previousLine.properties!.directionsIsActive) {
        this.linesBetweenReferencePoints[
          previousLine.properties!.index
        ].geometry.coordinates = [
          this.linesBetweenReferencePoints[previousLine.properties!.index]
            .geometry.coordinates[0],
          eventCoordinates,
        ];
      }
    } else {
      if (previousLine && !previousLine.properties!.directionsIsActive) {
        this.linesBetweenReferencePoints[
          previousLine.properties!.index
        ].geometry.coordinates = [
          this.linesBetweenReferencePoints[previousLine.properties!.index]
            .geometry.coordinates[0],
          eventCoordinates,
        ];
      }
      if (nextLine && !nextLine.properties!.directionsIsActive) {
        this.linesBetweenReferencePoints[
          nextLine.properties!.index
        ].geometry.coordinates = [
          eventCoordinates,
          this.linesBetweenReferencePoints[nextLine.properties!.index].geometry
            .coordinates[1],
        ];
      }
    }

    if (previousLine && previousLine.properties!.directionsIsActive) {
      this.changeDirectionsModeOnPreviousLineWithDebounce(previousLine, true);
    }
    if (nextLine && nextLine.properties!.directionsIsActive) {
      this.changeDirectionsModeOnNextLineWithDebounce(nextLine, true);
    }

    this.updateSource();
  }

  private onUpPoint(): void {
    this.map!.off("mousemove", this.onMovePointFunction);
    this.handleMapCursor("grab");
  }

  private createNewPointAndLine(
    newPointCoordinates: number[],
    directionsIsActive: boolean,
    previousLineCoordinates?: number[][],
    nextLineCoordinates?: number[][],
    currentLineIndex?: number
  ): void {
    const referencePoint: Feature<Point> = {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: newPointCoordinates,
      },
      properties: { index: this.referencePoints.length },
    };

    if (currentLineIndex !== undefined) {
      this.referencePoints.splice(currentLineIndex + 1, 0, referencePoint);
    } else {
      this.referencePoints.push(referencePoint);
    }

    if (previousLineCoordinates) {
      const previousLineBetweenReferencePoint: Feature<LineString> = {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: previousLineCoordinates,
        },
        properties: {
          index: this.linesBetweenReferencePoints.length,
          directionsIsActive,
        },
      };

      if (currentLineIndex !== undefined) {
        this.linesBetweenReferencePoints.splice(
          currentLineIndex,
          1,
          previousLineBetweenReferencePoint
        );
      } else {
        this.linesBetweenReferencePoints.push(
          previousLineBetweenReferencePoint
        );
      }
    }

    if (nextLineCoordinates) {
      const nextLineBetweenReferencePoint: Feature<LineString> = {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: nextLineCoordinates,
        },
        properties: {
          index: this.linesBetweenReferencePoints.length,
          directionsIsActive,
        },
      };

      if (currentLineIndex !== undefined) {
        this.linesBetweenReferencePoints.splice(
          currentLineIndex + 1,
          0,
          nextLineBetweenReferencePoint
        );
      } else {
        this.linesBetweenReferencePoints.push(nextLineBetweenReferencePoint);
      }
    }

    this.updateSource();
  }

  private async createNewPointOnLine(event: MapMouseEvent): Promise<void> {
    const lineUnderMouse = this.map!.queryRenderedFeatures(event.point, {
      layers: [betweenPointsLineLayerId],
    }) as Feature<LineString>[];

    if (lineUnderMouse.length > 0) {
      const currentLineString: Feature<LineString> = lineString(
        lineUnderMouse[0].geometry.coordinates
      );
      const currentPoint: Feature<Point> = point(event.lngLat.toArray());
      const nearestPoint: Feature<Point> = nearestPointOnLine(
        currentLineString,
        currentPoint
      );
      const previousReferencePoint = this.referencePoints[
        this.referencePoints.length - 1
      ];
      const line = this.directionsIsActive
        ? await getPathByCoordinates(this.mapboxToken, [
            previousReferencePoint.geometry.coordinates,
            nearestPoint.geometry.coordinates,
          ])
        : [
            previousReferencePoint.geometry.coordinates,
            nearestPoint.geometry.coordinates,
          ];

      this.createNewPointAndLine(
        nearestPoint.geometry.coordinates,
        this.directionsIsActive,
        line
      );

      this.updateSource();
      this.actionsPanel.remove();
    }
  }

  private createIntermediatePointOnLine(event: MapMouseEvent): void {
    const lineUnderMouse = this.map!.queryRenderedFeatures(event.point, {
      layers: [betweenPointsLineLayerId],
    }) as Feature<LineString>[];

    if (lineUnderMouse.length > 0) {
      const lineUnderMouseIndex: number = lineUnderMouse[0].properties!.index;
      const currentLineString: Feature<LineString> = lineString(
        lineUnderMouse[0].geometry.coordinates
      );
      const currentPoint: Feature<Point> = point(event.lngLat.toArray());
      const nearestPoint: Feature<Point> = nearestPointOnLine(
        currentLineString,
        currentPoint
      );
      const newLines = lineSplit(currentLineString, nearestPoint);
      this.createNewPointAndLine(
        nearestPoint.geometry.coordinates,
        lineUnderMouse[0].properties!.directionsIsActive,
        newLines.features[0].geometry!.coordinates,
        newLines.features[1].geometry!.coordinates,
        lineUnderMouseIndex
      );

      this.syncIndex();
      this.updateSource();
      this.actionsPanel.remove();
    }
  }

  private async deletePoint(): Promise<void> {
    const previousLine = this.linesBetweenReferencePoints[
      this.selectedReferencePointIndex! - 1
    ];
    const nextLine = this.linesBetweenReferencePoints[
      this.selectedReferencePointIndex!
    ];
    if (this.selectedReferencePointIndex! === 0) {
      this.referencePoints.shift();
      if (this.referencePoints.length > 0) {
        this.linesBetweenReferencePoints.shift();
      }
      this.syncIndex();
    } else if (
      this.selectedReferencePointIndex! ===
      this.referencePoints.length - 1
    ) {
      this.referencePoints.splice(this.selectedReferencePointIndex!, 1);
      this.linesBetweenReferencePoints.splice(
        previousLine.properties!.index,
        1
      );
    } else {
      const previousPoint = this.referencePoints[
        this.selectedReferencePointIndex! - 1
      ];
      const nextPoint = this.referencePoints[
        this.selectedReferencePointIndex! + 1
      ];
      if (
        !previousLine.properties!.directionsIsActive ||
        !nextLine.properties!.directionsIsActive
      ) {
        this.linesBetweenReferencePoints[
          previousLine.properties!.index
        ]!.geometry.coordinates = [
          previousPoint.geometry.coordinates,
          nextPoint.geometry.coordinates,
        ];
      } else {
        const coordinates = await getPathByCoordinates(this.mapboxToken, [
          previousPoint.geometry.coordinates,
          nextPoint.geometry.coordinates,
        ]);

        this.linesBetweenReferencePoints[
          previousLine.properties!.index
        ]!.geometry.coordinates = coordinates
          ? coordinates
          : [
              previousPoint.geometry.coordinates,
              nextPoint.geometry.coordinates,
            ];
      }
      this.referencePoints.splice(this.selectedReferencePointIndex!, 1);
      this.linesBetweenReferencePoints.splice(nextLine.properties!.index, 1);
      this.syncIndex();
    }

    this.updateSource();
    this.actionsPanel.remove();
  }

  private updateSource(): void {
    const data: GeoJSON.FeatureCollection<GeoJSON.Geometry> = {
      type: "FeatureCollection",
      features: [...this.referencePoints, ...this.linesBetweenReferencePoints],
    };
    (this.map!.getSource(sourcePointAndLineId) as GeoJSONSource).setData(data);
  }

  private syncIndex(): void {
    this.referencePoints.forEach(
      (point, index) => (point.properties!.index = index)
    );
    this.linesBetweenReferencePoints.forEach(
      (line, index) => (line.properties!.index = index)
    );
  }

  private async changeDirectionsModeOnLine(
    line: Feature<LineString>,
    forceDirections: boolean = false
  ): Promise<void> {
    let coordinates: number[][] | undefined = [];
    const previousPoint = this.referencePoints[line.properties!.index];
    const nextPoint = this.referencePoints[line.properties!.index + 1];
    if (line.properties!.directionsIsActive && !forceDirections) {
      coordinates = [
        previousPoint.geometry.coordinates,
        nextPoint.geometry.coordinates,
      ];
    } else {
      coordinates = await getPathByCoordinates(this.mapboxToken, [
        previousPoint.geometry.coordinates,
        nextPoint.geometry.coordinates,
      ]);
    }
    if (coordinates) {
      this.linesBetweenReferencePoints.splice(line.properties!.index, 1, {
        ...line,
        geometry: {
          type: "LineString",
          coordinates,
        },
        properties: {
          ...line.properties,
          directionsIsActive:
            !Boolean(line.properties!.directionsIsActive) || forceDirections,
        },
      });
      this.updateSource();
      this.actionsPanel.remove();
    }
  }

  public getFeatureCollection(): GeoJSON.FeatureCollection<GeoJSON.Geometry> {
    return {
      type: "FeatureCollection",
      features: [...this.referencePoints, ...this.linesBetweenReferencePoints],
    };
  }
}

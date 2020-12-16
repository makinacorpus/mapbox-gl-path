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
  phantomJunctionLineLayer,
  LayersCustomisation,
  pointTextLayerId,
  phantomJunctionLineLayerId,
} from "./source-and-layers";
import { languages, AvailableLanguages } from "./i18n";
import "./mapbox-gl-path.css";

interface DirectionsTheme {
  id: number;
  name: string;
  getPathByCoordinates: (
    coordinates: number[][]
  ) => Promise<DirectionsThemeResponse | undefined>;
}

interface DirectionsThemeResponse {
  coordinates: number[][];
  waypoints: Waypoints | undefined;
}

interface Waypoints {
  departure: number[];
  arrival: number[];
}

interface Parameters {
  languageId: AvailableLanguages | undefined;
  layersCustomisation: LayersCustomisation | undefined;
  featureCollection: GeoJSON.FeatureCollection<GeoJSON.Geometry> | undefined;
  directionsThemes: DirectionsTheme[] | undefined;
}

export default class MapboxPathControl implements IControl {
  private map: Map | undefined;
  private languageId: AvailableLanguages = "en";
  private pathControl: HTMLElement | undefined;
  private referencePoints: Feature<Point>[] = [];
  private selectedReferencePointIndex: number | undefined;
  private linesBetweenReferencePoints: Feature<LineString>[] = [];
  private phantomJunctionLines: Feature<LineString>[] = [];
  private onMovePointFunction = (event: MapMouseEvent) =>
    this.onMovePoint(event);

  private onClickMapFunction = (event: MapMouseEvent) => this.onClickMap(event);

  private onContextMenuMapFunction = (event: MapMouseEvent) =>
    this.onContextMenuMap(event);

  private onMouseDownPointFunction = (event: MapMouseEvent) =>
    this.onMouseDownPoint(event);

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
  private isFollowingDirections = false;
  private layersCustomisation: LayersCustomisation | undefined;
  private directionsThemes: DirectionsTheme[] | undefined;
  private selectedDirectionsTheme: DirectionsTheme | undefined;

  constructor(parameters: Parameters | undefined) {
    if (parameters) {
      if (parameters.languageId) {
        this.languageId = parameters.languageId;
      }

      if (
        parameters.directionsThemes &&
        parameters.directionsThemes.length > 0
      ) {
        this.directionsThemes = parameters.directionsThemes;
        this.selectedDirectionsTheme = parameters.directionsThemes[0];
      }

      this.layersCustomisation = parameters.layersCustomisation;

      if (parameters.featureCollection) {
        this.setFeatureCollection(parameters.featureCollection);
      }
    }
  }

  public onAdd(currentMap: Map): HTMLElement {
    this.map = currentMap;

    this.pathControl = this.createUI();
    this.map.once("idle", () => this.configureMap());
    return this.pathControl;
  }

  public onRemove(): void {
    this.removeEvents();
    [
      pointCircleLayerId,
      pointTextLayerId,
      betweenPointsLineLayerId,
      phantomJunctionLineLayerId,
    ].forEach((layer) => {
      if (this.map!.getLayer(layer)) {
        this.map!.removeLayer(layer);
      }
    });
    if (this.map!.getSource(sourcePointAndLineId)) {
      this.map!.removeSource(sourcePointAndLineId);
    }

    this.pathControl?.remove();
  }

  private createUI(): HTMLDivElement {
    const pathControlContainer = document.createElement("div");

    if (this.directionsThemes && this.directionsThemes.length > 0) {
      pathControlContainer.className = "mapbox-gl-path-container";
      const pathControlCheckbox = document.createElement("input");
      pathControlCheckbox.setAttribute("id", "checkbox-path");
      pathControlCheckbox.setAttribute("type", "checkbox");
      pathControlCheckbox.addEventListener(
        "change",
        (event) =>
          (this.isFollowingDirections = (event.target as HTMLInputElement).checked)
      );
      const pathControlSelect = document.createElement("select");
      pathControlSelect.onchange = (event) => {
        this.selectedDirectionsTheme = this.directionsThemes?.find(
          (directionsTheme) =>
            directionsTheme.id ===
            Number((event.target as HTMLSelectElement).value)
        );
      };
      if (this.directionsThemes.length === 1) {
        pathControlSelect.setAttribute("disabled", "true");
      }
      this.directionsThemes.forEach((theme) => {
        const pathControlSelectOption = document.createElement("option");
        pathControlSelectOption.value = theme.id.toString();
        pathControlSelectOption.textContent = theme.name;
        pathControlSelect.append(pathControlSelectOption);
      });

      const pathControlLabel = document.createElement("label");
      pathControlLabel.textContent = languages[this.languageId].followDirection;
      pathControlLabel.setAttribute("for", "checkbox-path");

      pathControlContainer.append(
        pathControlCheckbox,
        pathControlLabel,
        pathControlSelect
      );
    }

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
    this.map!.addLayer(
      this.layersCustomisation &&
        this.layersCustomisation.pointCircleLayerCustomisation
        ? {
            ...referencePointsCircleLayer,
            ...this.layersCustomisation.pointCircleLayerCustomisation,
          }
        : referencePointsCircleLayer
    );
    this.map!.addLayer(
      this.layersCustomisation &&
        this.layersCustomisation.pointTextLayerCustomisation
        ? {
            ...referencePointsTextLayer,
            ...this.layersCustomisation.pointTextLayerCustomisation,
          }
        : referencePointsTextLayer
    );
    this.map!.addLayer(
      this.layersCustomisation &&
        this.layersCustomisation.lineLayerCustomisation
        ? {
            ...betweenPointsLineLayer,
            ...this.layersCustomisation.lineLayerCustomisation,
          }
        : betweenPointsLineLayer,
      pointCircleLayerId
    );
    this.map!.addLayer(
      this.layersCustomisation &&
        this.layersCustomisation.phantomJunctionLineLayerCustomisation
        ? {
            ...phantomJunctionLineLayer,
            ...this.layersCustomisation.phantomJunctionLineLayerCustomisation,
          }
        : phantomJunctionLineLayer,
      pointCircleLayerId
    );
  }

  private initializeEvents(): void {
    this.map!.on("click", this.onClickMapFunction);
    this.map!.on("contextmenu", this.onContextMenuMapFunction);
    this.map!.on(
      "mousedown",
      pointCircleLayerId,
      this.onMouseDownPointFunction
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

  private removeEvents(): void {
    this.map!.off("click", this.onClickMapFunction);
    this.map!.off("contextmenu", this.onContextMenuMapFunction);
    this.map!.off("mousemove", this.onMovePointFunction);
    this.map!.off(
      "mousedown",
      pointCircleLayerId,
      this.onMouseDownPointFunction
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
        const line = this.isFollowingDirections
          ? await this.selectedDirectionsTheme!.getPathByCoordinates([
              previousReferencePoint.geometry.coordinates,
              newPointCoordinates,
            ])
          : [previousReferencePoint.geometry.coordinates, newPointCoordinates];
        if (line) {
          this.createNewPointAndLine(
            newPointCoordinates,
            this.isFollowingDirections,
            this.isFollowingDirections
              ? (line as DirectionsThemeResponse).coordinates
              : (line as number[][]),
            undefined,
            undefined,
            this.isFollowingDirections
              ? (line as DirectionsThemeResponse).waypoints
              : undefined
          );
        }
      } else {
        this.createNewPointAndLine(newPointCoordinates);
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
      deleteButton.textContent = languages[this.languageId].deletePoint;
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
    const createPointOnLineButton = document.createElement("button");
    createPointOnLineButton.textContent =
      languages[this.languageId].createPoint;
    createPointOnLineButton.setAttribute("type", "button");
    createPointOnLineButton.onclick = () => this.createNewPointOnLine(event);
    const createIntermediatePointOnLineButton = document.createElement(
      "button"
    );
    createIntermediatePointOnLineButton.textContent =
      languages[this.languageId].createIntermediatePoint;
    createIntermediatePointOnLineButton.setAttribute("type", "button");
    createIntermediatePointOnLineButton.onclick = () =>
      this.createIntermediatePointOnLine(event);

    const lineUnderMouse = this.map!.queryRenderedFeatures(event.point, {
      layers: [betweenPointsLineLayerId],
    }) as Feature<LineString>[];
    const changePathModeOnButton = document.createElement("button");
    changePathModeOnButton.textContent = lineUnderMouse[0].properties!
      .isFollowingDirections
      ? languages[this.languageId].enableFollowDirectionMode
      : languages[this.languageId].disableFollowDirectionMode;
    changePathModeOnButton.setAttribute("type", "button");
    changePathModeOnButton.onclick = () =>
      this.changeDirectionsModeOnLine(lineUnderMouse[0]);
    const actionsPanelContainer = document.createElement("div");
    actionsPanelContainer.append(
      createPointOnLineButton,
      createIntermediatePointOnLineButton
    );

    if (this.directionsThemes && this.directionsThemes.length > 0) {
      const changePathModeOnLineButton = document.createElement("button");
      changePathModeOnLineButton.textContent = !lineUnderMouse[0].properties!
        .isFollowingDirections
        ? languages[this.languageId].enableFollowDirectionMode
        : languages[this.languageId].disableFollowDirectionMode;
      changePathModeOnLineButton.setAttribute("type", "button");
      changePathModeOnLineButton.onclick = () =>
        this.changeDirectionsModeOnLine(lineUnderMouse[0]);
      actionsPanelContainer.append(changePathModeOnLineButton);
    }

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
      if (nextLine && !nextLine.properties!.isFollowingDirections) {
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
      if (previousLine && !previousLine.properties!.isFollowingDirections) {
        this.linesBetweenReferencePoints[
          previousLine.properties!.index
        ].geometry.coordinates = [
          this.linesBetweenReferencePoints[previousLine.properties!.index]
            .geometry.coordinates[0],
          eventCoordinates,
        ];
      }
    } else {
      if (previousLine && !previousLine.properties!.isFollowingDirections) {
        this.linesBetweenReferencePoints[
          previousLine.properties!.index
        ].geometry.coordinates = [
          this.linesBetweenReferencePoints[previousLine.properties!.index]
            .geometry.coordinates[0],
          eventCoordinates,
        ];
      }
      if (nextLine && !nextLine.properties!.isFollowingDirections) {
        this.linesBetweenReferencePoints[
          nextLine.properties!.index
        ].geometry.coordinates = [
          eventCoordinates,
          this.linesBetweenReferencePoints[nextLine.properties!.index].geometry
            .coordinates[1],
        ];
      }
    }

    if (previousLine && previousLine.properties!.isFollowingDirections) {
      this.changeDirectionsModeOnPreviousLineWithDebounce(previousLine, true);
    }
    if (nextLine && nextLine.properties!.isFollowingDirections) {
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
    isFollowingDirections?: boolean,
    previousLineCoordinates?: number[][],
    nextLineCoordinates?: number[][],
    currentLineIndex?: number,
    waypoints?: Waypoints
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
          index:
            currentLineIndex !== undefined
              ? currentLineIndex
              : this.linesBetweenReferencePoints.length,
          isFollowingDirections,
        },
      };

      if (waypoints) {
        this.addPhantomJunctionLines(
          this.linesBetweenReferencePoints.length,
          [
            this.referencePoints[this.referencePoints.length - 2].geometry
              .coordinates,
            waypoints.departure,
          ],
          [waypoints.arrival, newPointCoordinates]
        );
      }

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
          index: currentLineIndex! + 1,
          isFollowingDirections,
        },
      };
      const phantomJunctionLine = this.phantomJunctionLines.find(
        (phantomJunctionLine) =>
          phantomJunctionLine.properties!.index === currentLineIndex &&
          phantomJunctionLine.properties!.isDeparture === false
      );
      if (phantomJunctionLine) {
        phantomJunctionLine.properties!.index = currentLineIndex! + 1;
      }

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

    this.map!.fire("MapboxPathControl.create", {
      featureCollection: this.getFeatureCollection(),
      createdPoint: referencePoint,
    });

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
      const line = this.isFollowingDirections
        ? await this.selectedDirectionsTheme!.getPathByCoordinates([
            previousReferencePoint.geometry.coordinates,
            nearestPoint.geometry.coordinates,
          ])
        : [
            previousReferencePoint.geometry.coordinates,
            nearestPoint.geometry.coordinates,
          ];

      this.createNewPointAndLine(
        nearestPoint.geometry.coordinates,
        this.isFollowingDirections,
        this.isFollowingDirections
          ? (line as DirectionsThemeResponse).coordinates
          : (line as number[][]),
        undefined,
        undefined,
        this.isFollowingDirections
          ? (line as DirectionsThemeResponse).waypoints
          : undefined
      );

      this.map!.fire("MapboxPathControl.create", {
        featureCollection: this.getFeatureCollection(),
        createdPoint: currentPoint,
      });

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
        lineUnderMouse[0].properties!.isFollowingDirections,
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
    this.map!.fire("MapboxPathControl.delete", {
      deletedPoint: this.referencePoints[this.selectedReferencePointIndex!],
    });
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
        this.phantomJunctionLines = this.phantomJunctionLines.filter(
          (phantomJunctionLine) =>
            phantomJunctionLine.properties!.index !== nextLine.properties!.index
        );
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
      this.syncIndex();
      this.phantomJunctionLines = this.phantomJunctionLines.filter(
        (phantomJunctionLine) =>
          phantomJunctionLine.properties!.index !==
          previousLine.properties!.index
      );
    } else {
      const previousPoint = this.referencePoints[
        this.selectedReferencePointIndex! - 1
      ];
      const nextPoint = this.referencePoints[
        this.selectedReferencePointIndex! + 1
      ];

      this.phantomJunctionLines = this.phantomJunctionLines.filter(
        (phantomJunctionLine) =>
          phantomJunctionLine.properties!.index !==
            previousLine.properties!.index &&
          phantomJunctionLine.properties!.index !== nextLine.properties!.index
      );
      if (
        !previousLine.properties!.isFollowingDirections ||
        !nextLine.properties!.isFollowingDirections
      ) {
        const lineBetweenReferencePoint = this.linesBetweenReferencePoints[
          previousLine.properties!.index
        ];
        this.linesBetweenReferencePoints[previousLine.properties!.index] = {
          ...lineBetweenReferencePoint,
          geometry: {
            ...lineBetweenReferencePoint.geometry,
            coordinates: [
              previousPoint.geometry.coordinates,
              nextPoint.geometry.coordinates,
            ],
          },
          properties: {
            ...lineBetweenReferencePoint.properties,
            isFollowingDirections: false,
          },
        };
      } else {
        const directionsResponse = await this.selectedDirectionsTheme!.getPathByCoordinates(
          [previousPoint.geometry.coordinates, nextPoint.geometry.coordinates]
        );

        this.linesBetweenReferencePoints[
          previousLine.properties!.index
        ]!.geometry.coordinates =
          directionsResponse && directionsResponse.coordinates
            ? directionsResponse.coordinates
            : [
                previousPoint.geometry.coordinates,
                nextPoint.geometry.coordinates,
              ];

        if (directionsResponse?.waypoints) {
          this.addPhantomJunctionLines(
            previousLine.properties!.index,
            [
              previousPoint.geometry.coordinates,
              directionsResponse.waypoints.departure,
            ],
            [
              directionsResponse.waypoints.arrival,
              nextPoint.geometry.coordinates,
            ]
          );
        }
      }
      this.referencePoints.splice(this.selectedReferencePointIndex!, 1);
      this.linesBetweenReferencePoints.splice(nextLine.properties!.index, 1);
      this.syncIndex();
    }

    this.updateSource();
    this.actionsPanel.remove();
  }

  private updateSource(): void {
    const data = this.getFeatureCollection();
    const isSourceLoaded = () =>
      this.map!.getSource(sourcePointAndLineId) &&
      this.map!.isSourceLoaded(sourcePointAndLineId);

    const setData = () => {
      if (isSourceLoaded()) {
        (this.map!.getSource(sourcePointAndLineId) as GeoJSONSource).setData(
          data
        );
        this.map!.fire("MapboxPathControl.update", { featureCollection: data });
        this.map!.off("sourcedata", setData);
      }
    };

    if (isSourceLoaded()) {
      setData();
    } else {
      this.map!.on("sourcedata", setData);
    }
  }
  private syncIndex(): void {
    this.referencePoints.forEach(
      (point, index) => (point.properties!.index = index)
    );
    this.linesBetweenReferencePoints.forEach((line, index) => {
      if (line.properties!.index !== index) {
        this.phantomJunctionLines.forEach((phantomJunctionLine) => {
          if (
            phantomJunctionLine.properties!.index === line.properties!.index
          ) {
            phantomJunctionLine.properties!.index = index;
          }
        });
      }
      line.properties!.index = index;
    });
  }

  private async changeDirectionsModeOnLine(
    line: Feature<LineString>,
    forceDirections: boolean = false
  ): Promise<void> {
    let coordinates: number[][] | undefined = [];
    const previousPoint = this.referencePoints[line.properties!.index];
    const nextPoint = this.referencePoints[line.properties!.index + 1];
    if (line.properties!.isFollowingDirections && !forceDirections) {
      coordinates = [
        previousPoint.geometry.coordinates,
        nextPoint.geometry.coordinates,
      ];
      this.phantomJunctionLines = this.phantomJunctionLines.filter(
        (phantomJunctionLine) =>
          phantomJunctionLine.properties!.index !== line.properties!.index
      );
    } else {
      const directionsResponse = await this.selectedDirectionsTheme!.getPathByCoordinates(
        [previousPoint.geometry.coordinates, nextPoint.geometry.coordinates]
      );
      if (directionsResponse && directionsResponse.coordinates) {
        coordinates = directionsResponse.coordinates;
        this.phantomJunctionLines = this.phantomJunctionLines.filter(
          (phantomJunctionLine) =>
            phantomJunctionLine.properties!.index !== line.properties!.index
        );
        if (directionsResponse?.waypoints) {
          this.addPhantomJunctionLines(
            line.properties!.index,
            [
              previousPoint.geometry.coordinates,
              directionsResponse.waypoints.departure,
            ],
            [
              directionsResponse.waypoints.arrival,
              nextPoint.geometry.coordinates,
            ]
          );
        }
      }
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
          isFollowingDirections:
            !Boolean(line.properties!.isFollowingDirections) || forceDirections,
        },
      });
      this.updateSource();
      this.actionsPanel.remove();
    }
  }
  public setFeatureCollection({
    features,
  }: GeoJSON.FeatureCollection<GeoJSON.Geometry>): void {
    this.referencePoints = features
      .filter((feature) => feature.geometry.type === "Point")
      .sort((a, b) => a.properties!.index - b.properties!.index) as Feature<
      Point
    >[];

    this.linesBetweenReferencePoints = features
      .filter((feature) => feature.geometry.type === "LineString")
      .sort((a, b) => a.properties!.index - b.properties!.index) as Feature<
      LineString
    >[];

    this.syncIndex();
    this.updateSource();
  }

  public getFeatureCollection(): GeoJSON.FeatureCollection<GeoJSON.Geometry> {
    return {
      type: "FeatureCollection",
      features: [
        ...this.referencePoints,
        ...this.linesBetweenReferencePoints,
        ...this.phantomJunctionLines,
      ],
    };
  }

  public clearFeatureCollection(): void {
    this.referencePoints = [];
    this.linesBetweenReferencePoints = [];
    this.phantomJunctionLines = [];
    this.updateSource();
  }

  private addPhantomJunctionLines(
    index: number,
    departure: number[][],
    arrival: number[][]
  ): void {
    const phantomJunctionLines: Feature<LineString>[] = [
      {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: departure,
        },
        properties: {
          index,
          isPhantomJunction: true,
          isDeparture: true,
        },
      },
      {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: arrival,
        },
        properties: {
          index,
          isPhantomJunction: true,
          isDeparture: false,
        },
      },
    ];
    this.phantomJunctionLines = [
      ...this.phantomJunctionLines,
      ...phantomJunctionLines,
    ];
  }
}

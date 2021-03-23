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
import { translateMock, defaultLocales } from "./i18n";
import { createElement, getLngLat } from "./utils";
import "./mapbox-gl-path.css";

interface DirectionsTheme {
  id: number;
  name: string;
  selected: boolean;
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
  layersCustomisation: LayersCustomisation | undefined;
  featureCollection: GeoJSON.FeatureCollection<GeoJSON.Geometry> | undefined;
  lineString: GeoJSON.Feature<LineString> | undefined;
  directionsThemes: DirectionsTheme[] | undefined;
  translate: Function | undefined;
}

interface LineStringify {
  coordinates: number[][];
  paths: string[];
  points: number[][];
}

export default class MapboxPathControl implements IControl {
  private map: Map | undefined;
  private translate: Function = (text: string) => text;
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
  private actionsPanel: Popup = new Popup({
    className: "mapbox-gl-path-popup",
  });
  private isFollowingDirections = false;
  private layersCustomisation: LayersCustomisation | undefined;
  private directionsThemes: DirectionsTheme[] | undefined;
  private selectedDirectionsTheme: DirectionsTheme | undefined;

  constructor(parameters: Parameters | undefined) {
    if (parameters) {
      const {
        directionsThemes,
        layersCustomisation,
        featureCollection,
        lineString,
        translate,
      } = parameters;

      this.translate = translate || translateMock(defaultLocales);

      if (directionsThemes && directionsThemes.length > 0) {
        this.directionsThemes = directionsThemes;
        this.selectedDirectionsTheme =
          directionsThemes.find(({ selected }) => selected) ||
          directionsThemes[0];
      }

      this.layersCustomisation = layersCustomisation;

      if (featureCollection) {
        this.setFeatureCollection(featureCollection);
      } else if (lineString) {
        this.setLineString(lineString);
      }
    }
  }

  public onAdd(currentMap: Map): HTMLElement {
    this.map = currentMap;

    this.pathControl = this.createUI();
    this.map.once("idle", this.configureMap);
    return this.pathControl;
  }

  public onRemove(): void {
    this.map!.off("idle", this.configureMap);
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
      const hasSelectedDirectionThemes = this.directionsThemes.some(
        ({ selected }) => selected === true
      );
      pathControlContainer.className = "mapbox-gl-path-container";
      const pathControlCheckbox = createElement("input", {
        id: "checkbox-path",
        type: "checkbox",
      });
      if (hasSelectedDirectionThemes) {
        pathControlCheckbox.setAttribute(
          "checked",
          hasSelectedDirectionThemes.toString()
        );
        this.isFollowingDirections = true;
      }
      pathControlCheckbox.addEventListener(
        "change",
        (event) =>
          (this.isFollowingDirections = (event.target as HTMLInputElement).checked)
      );
      const pathControlSelect = createElement("select", {
        onchange: (event: { target: HTMLSelectElement }) => {
          this.selectedDirectionsTheme = this.directionsThemes?.find(
            (directionsTheme) =>
              directionsTheme.id === Number(event.target.value)
          );
        },
      });
      if (this.directionsThemes.length === 1) {
        pathControlSelect.setAttribute("disabled", "true");
      }
      this.directionsThemes.forEach((theme) => {
        const pathControlSelectOption = createElement("option", {
          selected: theme.selected,
          textContent: theme.name,
          value: theme.id.toString(),
        });
        pathControlSelect.append(pathControlSelectOption);
      });

      const pathControlLabel = createElement("label", {
        htmlFor: "checkbox-path",
        textContent: this.translate("gl-pathControl.followDirection"),
      });

      pathControlContainer.append(
        pathControlCheckbox,
        pathControlLabel,
        pathControlSelect
      );
    }

    return pathControlContainer;
  }

  private configureMap = (): void => {
    this.initializeSourceAndLayers();
    this.initializeEvents();

    if (this.referencePoints.length > 0) {
      this.updateSource();
    }
  };

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

  private async drawNewLine(
    fromCoordinates: number[],
    toCoordinates: number[]
  ): Promise<void> {
    const line = this.isFollowingDirections
      ? await this.selectedDirectionsTheme!.getPathByCoordinates([
          fromCoordinates,
          toCoordinates,
        ])
      : [fromCoordinates, toCoordinates];
    if (line) {
      this.createNewPointAndLine(
        toCoordinates,
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
      const newPointCoordinates = getLngLat(event.lngLat);
      const previousReferencePoint: Feature<Point> | null =
        this.referencePoints.length > 0
          ? this.referencePoints[this.referencePoints.length - 1]
          : null;

      if (previousReferencePoint) {
        this.drawNewLine(
          previousReferencePoint.geometry.coordinates,
          newPointCoordinates
        );
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
      const deleteButton = createElement("button", {
        className: "mapbox-gl-path-popup-button mapbox-gl-path-popup-delete",
        onclick: () => this.deletePoint(),
        textContent: this.translate("gl-pathControl.deletePoint"),
      });

      this.selectedReferencePointIndex = referencePointsUnderMouse[0].properties!.index;
      this.actionsPanel
        .setLngLat(event.lngLat)
        .setDOMContent(deleteButton)
        .addTo(this.map!);
    }
  }

  private onContextMenuLine(event: MapMouseEvent): void {
    const createPointOnLineButton = createElement("button", {
      className:
        "mapbox-gl-path-popup-button mapbox-gl-path-popup-createPointOnLine",
      onclick: () => this.createNewPointOnLine(event),
      textContent: this.translate("gl-pathControl.createPoint"),
    });

    const createIntermediatePointOnLineButton = createElement("button", {
      className:
        "mapbox-gl-path-popup-button mapbox-gl-path-popup-createIntermediatePointOnLine",
      onclick: () => this.createIntermediatePointOnLine(event),
      textContent: this.translate("gl-pathControl.createIntermediatePoint"),
    });

    const lineUnderMouse = this.map!.queryRenderedFeatures(event.point, {
      layers: [betweenPointsLineLayerId],
    }) as Feature<LineString>[];
    const actionsPanelContainer = document.createElement("div");
    actionsPanelContainer.append(
      createPointOnLineButton,
      createIntermediatePointOnLineButton
    );

    if (this.directionsThemes && this.directionsThemes.length > 0) {
      const changePathModeOnLineButton = createElement("button", {
        className:
          "mapbox-gl-path-popup-button mapbox-gl-path-popup-changePathModeOnLine",
        onclick: () => this.changeDirectionsModeOnLine(lineUnderMouse[0]),
        textContent: !lineUnderMouse[0].properties!.isFollowingDirections
          ? this.translate("gl-pathControl.enableFollowDirectionMode")
          : this.translate("gl-pathControl.disableFollowDirectionMode"),
      });
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
    const eventCoordinates = getLngLat(event.lngLat);
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
      const currentPoint: Feature<Point> = point(getLngLat(event.lngLat));
      const nearestPoint: Feature<Point> = nearestPointOnLine(
        currentLineString,
        currentPoint
      );
      const previousReferencePoint = this.referencePoints[
        this.referencePoints.length - 1
      ];

      this.drawNewLine(
        previousReferencePoint.geometry.coordinates,
        nearestPoint.geometry.coordinates
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
      const currentPoint: Feature<Point> = point(getLngLat(event.lngLat));
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

  private updateSource(fireEvent: boolean = true): void {
    const data = this.getFeatureCollection();
    const isSourceLoaded = () =>
      this.map!.getSource(sourcePointAndLineId) &&
      this.map!.isSourceLoaded(sourcePointAndLineId);

    const setData = () => {
      if (isSourceLoaded()) {
        (this.map!.getSource(sourcePointAndLineId) as GeoJSONSource).setData(
          data
        );
        fireEvent &&
          this.map!.fire("MapboxPathControl.update", {
            featureCollection: data,
          });
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

  private filterFeaturesByTypeAndSortByIndex<T extends Point | LineString>(
    features: Feature<T>[],
    type: String
  ) {
    return features
      .filter((feature) => feature.geometry.type === type)
      .sort((a, b) => a.properties!.index - b.properties!.index) as Feature<
      T
    >[];
  }

  public setFeatureCollection({
    features,
  }: GeoJSON.FeatureCollection<GeoJSON.Geometry>): void {
    this.referencePoints = this.filterFeaturesByTypeAndSortByIndex<Point>(
      features as [],
      "Point"
    );

    this.linesBetweenReferencePoints = this.filterFeaturesByTypeAndSortByIndex<
      LineString
    >(
      features.filter(({ properties }) => !properties!.isPhantomJunction) as [],
      "LineString"
    );

    this.phantomJunctionLines = this.filterFeaturesByTypeAndSortByIndex<
      LineString
    >(
      features.filter(({ properties }) => properties!.isPhantomJunction) as [],
      "LineString"
    );

    this.syncIndex();
    this.updateSource(false);
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

  public setLineString(feature: Feature<LineString>): void {
    const coordinates = [...feature.geometry.coordinates];

    // If there are no `points` properties to describe the lineString,
    // we create two points on the edges and assume the direction is enabled by its current state
    const defaultReference = [
      coordinates[0],
      this.isFollowingDirections ? "direction" : "free",
      coordinates[coordinates.length - 1],
    ];

    const referenceToBuildFeatureLineString =
      feature.properties!.points?.flatMap((item: Number[][], index: number) =>
        [item, feature.properties!.paths[index]].filter(Boolean)
      ) ?? defaultReference;

    const points = referenceToBuildFeatureLineString
      // Filter removing `points` between route and phantom junction
      .filter(
        (
          nextCoordinates: Number[],
          index: number,
          array: Number[] | String[]
        ) =>
          Array.isArray(nextCoordinates) &&
          !(
            (array[index - 1] === "junction" &&
              array[index + 1] === "direction") ||
            (array[index + 1] === "junction" &&
              array[index - 1] === "direction")
          )
      )
      // Build all points
      .map((nextCoordinates: Number[], index: number) => ({
        type: "Feature",
        geometry: {
          coordinates: nextCoordinates,
          type: "Point",
        },
        properties: {
          index,
        },
      }));

    const lines = referenceToBuildFeatureLineString.reduce(
      (
        memo: [GeoJSON.Feature],
        item: string | [],
        index: number,
        array: [string | []]
      ) => {
        if (typeof item !== "string") {
          return memo;
        }

        // We crawl the coordinates delimited by point to define each part of the lineString
        const [lngTo, latTo] = array[index + 1];

        const toIndex = coordinates.findIndex(
          ([lng, lat]) => lng === Number(lngTo) && lat === Number(latTo)
        );

        // The usage of the destructive splice method is wanted to avoid false positive coordinates
        // if the whole lineString goes through min 2 times in the same path
        const nextCoordinates = coordinates.splice(0, toIndex + 1 || 2, [
          Number(lngTo),
          Number(latTo),
        ]);

        const isPrevItemFollowingDirection = memo[memo.length - 1]?.properties!
          .isFollowingDirections;

        // phantomJunction and point related to a lineString must have the same index
        const prevIndex = memo[memo.length - 1]?.properties!.index || 0;
        const nextIndex =
          prevIndex +
          Number(
            (isPrevItemFollowingDirection !== true && item === "junction") ||
              (isPrevItemFollowingDirection === undefined &&
                memo[memo.length - 1]?.properties!.isDeparture === false)
          );

        memo.push({
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: nextCoordinates,
          },
          properties: {
            index: nextIndex,
            ...(item !== "junction" && {
              isFollowingDirections: item === "direction",
            }),
            ...(item === "junction" && {
              isPhantomJunction: true,
              isDeparture: isPrevItemFollowingDirection !== true,
            }),
          },
        });
        return memo;
      },
      []
    );

    this.setFeatureCollection({
      type: "FeatureCollection",
      features: [...points, ...lines],
    });
  }

  public getLineString(): Feature<LineString> {
    const { features } = this.getFeatureCollection();
    const { coordinates, points, paths } = features
      // Get the order of the path with "lineString" and "point" mixed
      .sort((a, b) => {
        if (
          a.geometry.type === "LineString" &&
          a.properties!.index === b.properties!.index &&
          b.properties!.isDeparture === true
        ) {
          return 1;
        }
        return a.properties!.index - b.properties!.index;
      })
      .reduce(
        (lineStringify: LineStringify, feature) => {
          if (feature.geometry.type === "Point") {
            lineStringify.points.push(feature.geometry.coordinates);
            lineStringify.coordinates.push(feature.geometry.coordinates);
          }
          if (feature.geometry.type === "LineString") {
            lineStringify.coordinates.push(
              // Remove the first and last item because we already got them with the push of points
              ...feature.geometry.coordinates.slice(1, -1)
            );
            if (feature.properties!.isPhantomJunction) {
              // If the phantomJunction is departure, we push the first one if not the second
              const phantomJunctionCoordinateToPush =
                feature.geometry.coordinates[
                  Number(feature.properties!.isDeparture)
                ];

              lineStringify.coordinates.push(phantomJunctionCoordinateToPush);
              lineStringify.points.push(phantomJunctionCoordinateToPush);
              lineStringify.paths.push("junction");
            } else if (feature.properties!.isFollowingDirections) {
              lineStringify.paths.push("direction");
            } else {
              lineStringify.paths.push("free");
            }
          }
          return lineStringify;
        },
        {
          coordinates: [],
          paths: [],
          points: [],
        }
      );
    return {
      type: "Feature",
      geometry: {
        coordinates,
        type: "LineString",
      },
      properties: {
        paths,
        points,
      },
    };
  }

  public clearFeatureCollection(): void {
    this.referencePoints = [];
    this.linesBetweenReferencePoints = [];
    this.phantomJunctionLines = [];
    this.updateSource(false);
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

import { Feature, Point, LineString } from "geojson";
import { Map, IControl, MapMouseEvent, GeoJSONSource, Popup } from "mapbox-gl";
import { point, lineString } from "@turf/helpers";
import nearestPointOnLine from "@turf/nearest-point-on-line";
import pointToLineDistance from "@turf/point-to-line-distance";
import lineSplit from "@turf/line-split";
import debounce from "lodash.debounce";
import {
  sourcePointAndLineId,
  pointsAndLinesSource,
  pointCircleLayerId,
  betweenPointsLineLayerId,
  defaultPointLayerList,
  defaultLineLayerList,
  defaultPhantomJunctionLineLayerList,
  LayersCustomisation,
  phantomJunctionLineLayerId,
} from "./source-and-layers";
import { translateMock, defaultLocales } from "./i18n";
import { createElement, selectThemesElement } from "./utils";
import "./mapbox-gl-path.css";

export interface DirectionsTheme {
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

export type ThemeSelectionType = "select" | "radioList";

interface Parameters {
  layersCustomisation: LayersCustomisation | undefined;
  featureCollection: GeoJSON.FeatureCollection<GeoJSON.Geometry> | undefined;
  lineString: GeoJSON.Feature<LineString> | undefined;
  directionsThemes: DirectionsTheme[] | undefined;
  themeSelectionType: ThemeSelectionType | undefined;
  translate: Function | undefined;
  useRightClickToHandleActionPanel: boolean | undefined;
}

interface LineStringify {
  coordinates: number[][];
  paths: string[];
  points: number[];
}

export default class MapboxPathControl implements IControl {
  private map: Map | undefined;
  private translate: Function = (text: string) => text;
  private pathControl: HTMLElement | undefined;
  private referencePoints: Feature<Point>[] = [];
  private selectedReferencePointIndex: number | undefined;
  private layerIDList: string[] = [];
  private enqueueEvents: Function[] = [];
  private linesBetweenReferencePoints: Feature<LineString>[] = [];
  private phantomJunctionLines: Feature<LineString>[] = [];
  private useRightClickToHandleActionPanel: Boolean | undefined;
  private onMovePointFunction = (event: MapMouseEvent) =>
    this.onMovePoint(event);

  private onClickMapFunction = (event: MapMouseEvent) =>
    this.onClickMapEnqueue(event);

  private onContextMenuMapFunction = (event: MapMouseEvent) =>
    this.handleActionsPanel(event);

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
  private isLoopTrail = false;
  private layersCustomisation: LayersCustomisation | undefined;
  private directionsThemes: DirectionsTheme[] | undefined;
  private selectedDirectionsTheme: DirectionsTheme | undefined;
  private themeSelectionType: ThemeSelectionType = "radioList";

  constructor(parameters: Parameters | undefined) {
    if (parameters) {
      const {
        directionsThemes,
        layersCustomisation,
        featureCollection,
        lineString,
        themeSelectionType,
        translate,
        useRightClickToHandleActionPanel,
      } = parameters;

      this.translate = translate || translateMock(defaultLocales);

      if (directionsThemes && directionsThemes.length > 0) {
        this.directionsThemes = directionsThemes;
        this.selectedDirectionsTheme =
          directionsThemes.find(({ selected }) => selected) ||
          directionsThemes[0];
      }

      this.layersCustomisation = layersCustomisation;

      if (themeSelectionType) {
        this.themeSelectionType = themeSelectionType;
      }

      this.useRightClickToHandleActionPanel = Boolean(
        useRightClickToHandleActionPanel
      );

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
    this.layerIDList.forEach((layerId) => {
      if (this.map!.getLayer(layerId)) {
        this.map!.removeLayer(layerId);
      }
    });
    this.layerIDList = [];
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
        className: "mapbox-gl-path-theme-selection__checkbox",
        id: "checkbox-path",
        onchange: (event: { target: HTMLInputElement }) =>
          (this.isFollowingDirections = event.target.checked),
        type: "checkbox",
      });
      if (hasSelectedDirectionThemes) {
        pathControlCheckbox.setAttribute(
          "checked",
          hasSelectedDirectionThemes.toString()
        );
        this.isFollowingDirections = true;
      }

      const pathControlLabel = createElement("label", {
        className: "mapbox-gl-path-theme-selection__checkbox-label",
        htmlFor: "checkbox-path",
        textContent: this.translate("gl-pathControl.followDirection"),
      });

      const pathControlSelect = selectThemesElement({
        props: {
          onchange: (event: { target: HTMLSelectElement }) => {
            this.selectedDirectionsTheme = this.directionsThemes?.find(
              (directionsTheme) =>
                directionsTheme.id === Number(event.target.value)
            );
          },
        },
        themes: this.directionsThemes,
        themeSelectionType: this.themeSelectionType,
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
    const {
      lineLayerList = defaultLineLayerList,
      phantomJunctionLineLayerList = defaultPhantomJunctionLineLayerList,
      pointLayerList = defaultPointLayerList,
    } = this.layersCustomisation || {};

    const groupLayerList = [
      {
        baseId: betweenPointsLineLayerId,
        layerList: lineLayerList,
        props: {
          filter: [
            "all",
            ["in", "$type", "LineString"],
            ["!has", "isPhantomJunction"],
          ],
          type: "line",
        },
      },
      {
        baseId: phantomJunctionLineLayerId,
        layerList: phantomJunctionLineLayerList,
        props: {
          filter: [
            "all",
            ["in", "$type", "LineString"],
            ["has", "isPhantomJunction"],
          ],
          type: "line",
        },
      },
      {
        baseId: pointCircleLayerId,
        layerList: pointLayerList,
        props: {
          filter: ["in", "$type", "Point"],
          type: "circle",
        },
      },
    ];
    groupLayerList.forEach(({ baseId, layerList, props }) => {
      layerList.forEach((layer: any, index: number) => {
        // The first layer must have the ID without suffix or override to apply its interactions
        const id = index === 0 ? baseId : layer.id || `${baseId}-${index}`;
        this.map!.addLayer({
          source: sourcePointAndLineId,
          ...props,
          ...layer,
          id,
        });
        this.layerIDList.push(id);
      });
    });
  }

  private initializeEvents(): void {
    this.map!.on("click", this.onClickMapFunction);
    if (this.useRightClickToHandleActionPanel) {
      this.map!.on("contextmenu", this.onContextMenuMapFunction);
    }
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

  private async onClickMapEnqueue(event: MapMouseEvent): Promise<void> {
    this.enqueueEvents.push(
      async (): Promise<void> => {
        await this.handleClickMap(event);
        this.enqueueEvents.shift();
        if (this.enqueueEvents.length !== 0) {
          await this.enqueueEvents[0]();
        }
      }
    );
    if (this.enqueueEvents.length === 1) {
      await this.enqueueEvents[0]();
    }
  }

  private async handleClickMap(event: MapMouseEvent): Promise<void> {
    if (this.actionsPanel.isOpen()) {
      this.actionsPanel.remove();
      return;
    }

    if (!this.useRightClickToHandleActionPanel) {
      this.handleActionsPanel(event);
    }

    const referencePointOrLineIsUnderMouse: boolean = Boolean(
      this.map!.queryRenderedFeatures(event.point, {
        layers: [pointCircleLayerId, betweenPointsLineLayerId],
      }).length
    );

    if (referencePointOrLineIsUnderMouse) {
      return;
    }

    const newPointCoordinates = event.lngLat.toArray();

    if (this.isLoopTrail) {
      const newPoint: Feature<Point> = point(newPointCoordinates);

      let nearestLineString = this.linesBetweenReferencePoints[0];
      this.linesBetweenReferencePoints.slice(1).forEach((line) => {
        const currentDistance = pointToLineDistance(
          newPoint,
          nearestLineString
        );
        const newDistance = pointToLineDistance(newPoint, line);
        if (newDistance < currentDistance) {
          nearestLineString = line;
        }
      });

      const nearestPointInLineString: Feature<Point> = nearestPointOnLine(
        nearestLineString,
        newPoint
      );

      const newLines = lineSplit(nearestLineString, nearestPointInLineString);

      const {
        features: [from, to = from],
      } = newLines;

      this.selectedReferencePointIndex =
        nearestLineString.properties!.index + 1;

      this.createNewPointAndLine(
        nearestPointInLineString.geometry.coordinates,
        nearestLineString.properties!.isFollowingDirections,
        from.geometry!.coordinates,
        to.geometry!.coordinates,
        nearestLineString.properties!.index
      );

      this.movePointHandler(newPointCoordinates);

      this.syncIndex();
      this.updateSource();

      return;
    }
    const previousReferencePoint: Feature<Point> | null =
      this.referencePoints.length > 0
        ? this.referencePoints[this.referencePoints.length - 1]
        : null;

    if (previousReferencePoint) {
      await this.drawNewLine(
        previousReferencePoint.geometry.coordinates,
        newPointCoordinates
      );
    } else {
      this.createNewPointAndLine(newPointCoordinates);
    }
  }

  private handleActionsPanel(event: MapMouseEvent): void {
    const featuresUnderMouse = this.map!.queryRenderedFeatures(event.point, {
      layers: [pointCircleLayerId, betweenPointsLineLayerId],
    });

    if (featuresUnderMouse.length > 0) {
      featuresUnderMouse.find(
        (feature) => feature.layer.id === pointCircleLayerId
      )
        ? this.handleActionsPanelMenuPoint(event)
        : this.handleActionsPanelMenuLine(event);

      return;
    }
  }

  private handleActionsPanelMenuPoint(event: MapMouseEvent): void {
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

      const actionsPanelContainer = document.createElement("div");
      actionsPanelContainer.append(deleteButton);

      if (
        referencePointsUnderMouse.find(
          ({ properties }) =>
            properties!.index === 0 ||
            properties!.index === this.referencePoints.length - 1
        ) &&
        this.referencePoints.length > 2
      ) {
        const loopOrOneWayButton = createElement(
          "button",
          this.isLoopTrail
            ? {
                className:
                  "mapbox-gl-path-popup-button mapbox-gl-path-popup-oneWay",
                onclick: () => this.setOneWayTrail(),
                textContent: this.translate("gl-pathControl.oneWayPoint"),
              }
            : {
                className:
                  "mapbox-gl-path-popup-button mapbox-gl-path-popup-loop",
                onclick: () => this.setLoopTrail(),
                textContent: this.translate("gl-pathControl.loopPoint"),
              }
        );
        actionsPanelContainer.append(loopOrOneWayButton);
      }

      this.selectedReferencePointIndex = referencePointsUnderMouse[0].properties!.index;
      this.actionsPanel
        .setLngLat(event.lngLat)
        .setDOMContent(actionsPanelContainer)
        .addTo(this.map!);
    }
  }

  private handleActionsPanelMenuLine(event: MapMouseEvent): void {
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
      const isFollowingDirectionsText = lineUnderMouse[0].properties!
        .isFollowingDirections
        ? "disableFollowDirectionMode"
        : "enableFollowDirectionMode";
      const changePathModeOnLineButton = createElement("button", {
        className: `mapbox-gl-path-popup-button mapbox-gl-path-popup-${isFollowingDirectionsText}`,
        onclick: () => this.changeDirectionsModeOnLine(lineUnderMouse[0]),
        textContent: this.translate(
          `gl-pathControl.${isFollowingDirectionsText}`
        ),
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

  private movePointHandler(coordinates: number[]): void {
    let previousLine = this.linesBetweenReferencePoints[
      this.selectedReferencePointIndex! - 1
    ];

    if (!previousLine && this.isLoopTrail) {
      previousLine = this.linesBetweenReferencePoints[
        this.referencePoints.length - 1
      ];
    }

    let nextLine = this.linesBetweenReferencePoints[
      this.selectedReferencePointIndex!
    ];

    if (!nextLine && this.isLoopTrail) {
      nextLine = this.linesBetweenReferencePoints[0];
    }

    this.handleMapCursor("grabbing");

    if (this.actionsPanel.isOpen()) {
      this.actionsPanel.remove();
    }

    this.referencePoints[
      this.selectedReferencePointIndex!
    ].geometry.coordinates = coordinates;

    if (previousLine) {
      if (previousLine.properties!.isFollowingDirections) {
        this.changeDirectionsModeOnPreviousLineWithDebounce(previousLine, true);
      } else {
        this.linesBetweenReferencePoints[
          previousLine.properties!.index
        ].geometry.coordinates = [
          this.linesBetweenReferencePoints[previousLine.properties!.index]
            .geometry.coordinates[0],
          coordinates,
        ];
      }
    }

    if (nextLine) {
      if (nextLine.properties!.isFollowingDirections) {
        this.changeDirectionsModeOnNextLineWithDebounce(nextLine, true);
      } else {
        this.linesBetweenReferencePoints[
          nextLine.properties!.index
        ].geometry.coordinates = [
          coordinates,
          this.linesBetweenReferencePoints[nextLine.properties!.index].geometry
            .coordinates[1],
        ];
      }
    }
  }

  private onMovePoint(event: MapMouseEvent): void {
    const eventCoordinates = event.lngLat.toArray();
    this.movePointHandler(eventCoordinates);
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
    currentLineIndex: number = this.linesBetweenReferencePoints.length,
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

    this.referencePoints.splice(currentLineIndex + 1, 0, referencePoint);

    if (previousLineCoordinates) {
      const previousLineBetweenReferencePoint: Feature<LineString> = {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: previousLineCoordinates,
        },
        properties: {
          index: currentLineIndex,
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

      this.linesBetweenReferencePoints.splice(
        currentLineIndex,
        1,
        previousLineBetweenReferencePoint
      );
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

      this.linesBetweenReferencePoints.forEach((line) => {
        const { index } = line.properties!;
        if (index > currentLineIndex) {
          line.properties!.index = index + 1;
        }
      });

      this.linesBetweenReferencePoints.splice(
        currentLineIndex + 1,
        0,
        nextLineBetweenReferencePoint
      );

      this.phantomJunctionLines.forEach((phantomJunctionLine) => {
        const { isDeparture, index } = phantomJunctionLine.properties!;
        if (
          (index === currentLineIndex && !isDeparture) ||
          index > currentLineIndex
        ) {
          phantomJunctionLine.properties!.index = index + 1;
        }
      });
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
      const currentPoint: Feature<Point> = point(event.lngLat.toArray());
      const nearestPoint: Feature<Point> = nearestPointOnLine(
        currentLineString,
        currentPoint
      );
      const newLines = lineSplit(currentLineString, nearestPoint);

      const {
        features: [from, to = from],
      } = newLines;

      this.createNewPointAndLine(
        nearestPoint.geometry.coordinates,
        lineUnderMouse[0].properties!.isFollowingDirections,
        from.geometry!.coordinates,
        to.geometry!.coordinates,
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

    let previousLine = this.linesBetweenReferencePoints[
      this.selectedReferencePointIndex! - 1
    ];

    if (!previousLine && this.isLoopTrail) {
      previousLine = this.linesBetweenReferencePoints[
        this.linesBetweenReferencePoints.length - 1
      ];
    }

    let nextLine = this.linesBetweenReferencePoints[
      this.selectedReferencePointIndex!
    ];

    if (!nextLine && this.isLoopTrail) {
      nextLine = this.linesBetweenReferencePoints[0];
    }

    if (!previousLine) {
      this.referencePoints.shift();
      if (this.referencePoints.length > 0) {
        this.linesBetweenReferencePoints.shift();
        this.phantomJunctionLines = this.phantomJunctionLines.filter(
          (phantomJunctionLine) =>
            phantomJunctionLine.properties!.index !== nextLine.properties!.index
        );
      }
    } else if (!nextLine) {
      this.referencePoints.splice(this.selectedReferencePointIndex!, 1);
      this.linesBetweenReferencePoints.splice(
        previousLine.properties!.index,
        1
      );
      this.phantomJunctionLines = this.phantomJunctionLines.filter(
        (phantomJunctionLine) =>
          phantomJunctionLine.properties!.index !==
          previousLine.properties!.index
      );
    } else {
      let previousPoint = this.referencePoints[
        this.selectedReferencePointIndex! - 1
      ];

      if (!previousPoint && this.isLoopTrail) {
        previousPoint = this.referencePoints[this.referencePoints.length - 1];
      }

      let nextPoint = this.referencePoints[
        this.selectedReferencePointIndex! + 1
      ];

      if (!nextPoint && this.isLoopTrail) {
        nextPoint = this.referencePoints[0];
      }

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

      // Below 3 points, a lineString can no longer be looped
      if (this.referencePoints.length < 3 && this.isLoopTrail) {
        this.linesBetweenReferencePoints.splice(
          previousLine.properties!.index -
            Number(
              this.selectedReferencePointIndex !== this.referencePoints.length
            ),
          1
        );
      }
    }

    this.syncIndex();
    this.updateSource();
    this.actionsPanel.remove();
  }

  public async setLoopTrail(): Promise<void> {
    if (this.referencePoints.length < 3) {
      return;
    }
    const firstPoint = this.referencePoints[this.referencePoints.length - 1];
    const lastPoint = this.referencePoints[0];

    this.isLoopTrail = true;

    await this.drawNewLine(
      firstPoint.geometry.coordinates,
      lastPoint.geometry.coordinates
    );

    this.referencePoints = this.referencePoints.slice(0, -1);
    this.updateSource();

    this.actionsPanel.remove();
  }

  public async setOneWayTrail(): Promise<void> {
    this.createNewPointAndLine(this.referencePoints[0].geometry.coordinates);

    this.selectedReferencePointIndex = this.referencePoints.length - 1;
    this.isLoopTrail = false;

    this.deletePoint();

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
    if (this.referencePoints.length < 3) {
      this.isLoopTrail = false;
    }
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
    let nextPoint = this.referencePoints[line.properties!.index + 1];
    if (!nextPoint && this.isLoopTrail) {
      nextPoint = this.referencePoints[0];
    }
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

    const lines = this.filterFeaturesByTypeAndSortByIndex<LineString>(
      features as [],
      "LineString"
    );

    this.linesBetweenReferencePoints = lines.filter(
      ({ properties }) => !properties!.isPhantomJunction
    );

    this.phantomJunctionLines = lines.filter(
      ({ properties }) => properties!.isPhantomJunction
    );

    if (this.referencePoints.length > 2) {
      const lastLineWithoutDeparture = [...lines]
        .reverse()
        .find((line) => line.properties!.isDeparture !== true);
      if (
        lastLineWithoutDeparture?.geometry.coordinates[1]?.join() ===
        this.referencePoints[0].geometry.coordinates.join()
      ) {
        this.isLoopTrail = true;
      }
    }

    // In case of the featureCollection contains only one LineString
    if (!this.referencePoints.length && !this.phantomJunctionLines.length) {
      this.setLineString(this.linesBetweenReferencePoints[0]);
      return;
    }

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

    this.isLoopTrail =
      coordinates.length > 2 &&
      coordinates[0].join() === coordinates[coordinates.length - 1].join();

    // If there are no `points` properties to describe the lineString,
    // we create two points on the edges and assume the direction is enabled by its current state
    const defaultReference = [
      0,
      this.isFollowingDirections ? "direction" : "free",
      coordinates.length - 1,
    ];

    // And if it's a loop trail, 2 intermediates points are required
    if (this.isLoopTrail) {
      defaultReference.splice(
        2,
        1,
        Math.round((coordinates.length * 1) / 3),
        this.isFollowingDirections ? "direction" : "free",
        Math.round((coordinates.length * 2) / 3),
        this.isFollowingDirections ? "direction" : "free"
      );
    }

    const referenceToBuildFeatureLineString =
      feature.properties!.points?.flatMap((item: Number[][], index: number) =>
        [item, feature.properties!.paths[index]].filter(
          (value) => value !== undefined
        )
      ) ?? defaultReference;

    const points = referenceToBuildFeatureLineString
      // Filter removing `points` between route and phantom junction
      .filter(
        (
          indexedCoordinates: number,
          index: number,
          array: number[] | string[]
        ) =>
          Number.isFinite(indexedCoordinates) &&
          !(
            (array[index - 1] === "junctionDeparture" &&
              array[index + 1] === "direction") ||
            (array[index + 1] === "junctionArrival" &&
              array[index - 1] === "direction")
          )
      )
      // Build all points
      .map((indexedCoordinates: number, index: number) => ({
        type: "Feature",
        geometry: {
          coordinates: coordinates[indexedCoordinates],
          type: "Point",
        },
        properties: {
          index,
        },
      }));

    const lines = referenceToBuildFeatureLineString.reduce(
      (
        memo: [GeoJSON.Feature],
        item: string | number,
        index: number,
        array: [string | number]
      ) => {
        if (typeof item !== "string") {
          return memo;
        }
        const fromIndex = Number(array[index - 1] ?? 0);
        const toIndex = Number(array[index + 1] ?? coordinates.length - 1);

        // Second param of slice method is a count
        const nextCoordinates = coordinates.slice(fromIndex, toIndex + 1);
        const lastItem = memo[memo.length - 1];

        // phantomJunction and point related to a lineString must have the same index
        const prevIndex = lastItem?.properties!.index ?? -1;
        const nextIndex =
          prevIndex +
          Number(
            item === "junctionDeparture" ||
              (["free", "direction"].includes(item) &&
                lastItem?.properties!.isDeparture !== true)
          );

        memo.push({
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: nextCoordinates,
          },
          properties: {
            index: nextIndex,
            ...(!item.startsWith("junction") && {
              isFollowingDirections: item === "direction",
            }),
            ...(item.startsWith("junction") && {
              isPhantomJunction: true,
              isDeparture: item === "junctionDeparture",
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
          a.properties!.index === b.properties!.index
        ) {
          if (a.properties!.isDeparture === true) {
            return -1;
          } else if (b.properties!.isDeparture === true) {
            return 1;
          }
          return 0;
        }
        return a.properties!.index - b.properties!.index;
      })
      .reduce(
        (lineStringify: LineStringify, feature) => {
          if (feature.geometry.type === "Point") {
            lineStringify.coordinates.push(feature.geometry.coordinates);
            lineStringify.points.push(lineStringify.coordinates.length - 1);
          }
          if (feature.geometry.type === "LineString") {
            if (feature.properties!.isDeparture === false) {
              lineStringify.points.push(lineStringify.coordinates.length);
            }
            lineStringify.coordinates.push(
              // Remove the first and last item because we already got them with the push of points
              ...feature.geometry.coordinates.slice(1, -1)
            );
            if (feature.properties!.isDeparture === true) {
              lineStringify.points.push(lineStringify.coordinates.length);
            }
            if (feature.properties!.isPhantomJunction) {
              // If the phantomJunction is departure, we push the first one if not the second
              lineStringify.coordinates.push(
                feature.geometry.coordinates[
                  Number(feature.properties!.isDeparture)
                ]
              );
              lineStringify.paths.push(
                `junction${
                  feature.properties!.isDeparture ? "Departure" : "Arrival"
                }`
              );
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
        coordinates: !this.isLoopTrail
          ? coordinates
          : [...coordinates, coordinates[0]],
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
    this.isLoopTrail = false;
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

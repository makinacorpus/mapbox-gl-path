# Mapbox-gl-path

_Mapbox-gl-path_ allows you to create paths on a map with or without the help of various directions APIs.  
It requires [Mapbox-gl-js](https://github.com/mapbox/mapbox-gl-js) (or [Maplibre-gl-js](https://github.com/maplibre/maplibre-gl-js)) as a dependency.

## Quick start

### Installation

Install _Mapbox-gl-path_ with your package manager (_npm_ is used in this example):

```bash
npm install @makina-corpus/mapbox-gl-path
```

### Usage in your application

#### How to import dependencies

```js
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import MapboxPathControl from "@makina-corpus/mapbox-gl-path";
```

#### By using it in the `<head>` of your HTML file

```html
<script src="https://api.mapbox.com/mapbox-gl-js/v2.2.0/mapbox-gl.js"></script>
<link
  href="https://api.mapbox.com/mapbox-gl-js/v2.2.0/mapbox-gl.css"
  rel="stylesheet"
/>
<script src="./dist/index.js"></script>
```

#### Sample configuration

```js
mapboxgl.accessToken = "YOUR_ACCESS_TOKEN";

const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/streets-v11",
  center: [2.21, 46.22],
  zoom: 5,
});
const mapboxPathControl = new MapboxPathControl(parameters);
map.addControl(mapboxPathControl);
```

A working example is available at [rollup.config.dev.js](https://github.com/makinacorpus/mapbox-gl-path/blob/master/rollup.config.dev.js), look at development part.  
To run it, you need to add a `mapboxglToken` environment variable to your `.env` file. See [Run Locally](#user-content-run-locally) section below.

## API Reference

### Parameters

All of the following parameters are optional.

```ts
{
  directionsThemes: DirectionsTheme[] | undefined;
  featureCollection: GeoJSON.FeatureCollection<GeoJSON.Geometry> | undefined;
  layersCustomisation: LayersCustomisation | undefined;
  lineString: GeoJSON.Feature<LineString> | undefined;
  themeSelectionType: ThemeSelectionType | undefined;
  translate: Function | undefined;
  useRightClickToHandleActionPanel: boolean | undefined;
}
```

#### directionsThemes - `DirectionsTheme[] | undefined`

`directionsThemes` is an array listing all the themes for providing directions. Each directionTheme has its own parameters:

```ts
interface DirectionsTheme {
  id: number;
  name: string;
  getPathByCoordinates: (
    coordinates: number[][]
  ) => Promise<DirectionsThemeResponse | undefined>;
  selected: boolean | undefined;
}
```

The `getPathByCoordinates` function should return an object of type `DirectionsThemeResponse` with the coordinates between two points, waypoints and, if necessary, phantom junctions lines between waypoints and points.
If an element of the array has the prop `selected` set to `true`, it will be pre-selected. If there is more than one `selected`, the first one in the list will be selected.

```ts
interface DirectionsThemeResponse {
  coordinates: number[][];
  waypoints: Waypoints | undefined;
}

interface Waypoints {
  departure: number[];
  arrival: number[];
}
```

#### `featureCollection` - GeoJSON.FeatureCollection<GeoJSON.Geometry> | undefined

The `featureCollection` includes features that can be of type `Point` or `Linestring`.  
A `Linestring` can be a line between points or a phantom junction line (the latter must have a `isPhantomJunction` properties equal to `true`).

#### `layersCustomisation` - LayersCustomisation | undefined

`layersCustomisation` parameter allows to define an infinite number of layers for each `Point` or `Linestring` in order to easily style them.

```ts
interface LayersCustomisation {
  lineLayerList: LayerCustomisation[];
  phantomJunctionLineLayerList: LayerCustomisation[];
  pointLayerList: LayerCustomisation[];
}

interface LayerCustomisation {
  id: string | undefined;
  layout: AnyLayout;
  paint: AnyPaint;
  type: string | undefined;
}
```

#### `lineString` - GeoJSON.Feature<LineString> | undefined

Like `featureCollection` parameter, it draws the lineString on the map.  
If the lineString does not contains `path` and `point` properties to describe how to build a feature collection, automatic `Points` will be added:

- If the first and last point have the same coordinate, the lineString is considered to be looped so one point will be placed at that coordinate and two others will be placed at equal distance from each other.
- Otherwise, two points will be added to the edges.

If `featureCollection` parameter is set, this `lineString` parameter is ignored.

#### `themeSelectionType` - ThemeSelectionType | undefined

```ts
type ThemeSelectionType = "select" | "radioList";
```

Determines the HTML element for theme selection. Default set to `radioList`.

#### `translate` - Function | undefined;

A function to provide locales. The default language is English (See [src/i18n.js](https://github.com/makinacorpus/mapbox-gl-path/blob/master/src/i18n.ts)).

#### `useRightClickToHandleActionPanel` - boolean | undefined;

Boolean to use right or left mouse click to open the action panel. Default value is `false` (so left click).

### Methods

#### clearFeatureCollection

Clears the paths from the map.

#### getFeatureCollection

Get the current FeatureCollection drawn.
Returns `GeoJSON.FeatureCollection<GeoJSON.Geometry>`

#### getLineString

Get the current drawn FeatureCollection and concatenates the collection as a LineString. The `properties` contain `path` and `point` elements that helps `Mapbox-gl-path` reconstruct the feature collection.
Returns `Feature<LineString>`

#### setFeatureCollection

Parameter: `GeoJSON.FeatureCollection<GeoJSON.Geometry>`

The `featureCollection` includes features that can be of type `Point` or `Linestring`.  
A `Linestring` can be a line between points or a phantom junction line (the latter must have a `isPhantomJunction` properties equals to `true`).

#### setLineString

Parameter: `GeoJSON.Feature<LineString>`

It draws the lineString on the map.  
If the lineString does not contains `path` and `point` properties to describe how to build a feature collection, automatic Points will be added :

- If the first and last point have the same coordinate, the lineString is considered to be looped so one point will be placed at that coordinate and two others will be placed at equal distance from each other.
- Otherwise, two points will be added to the edges.

#### setLoopTrail

It will draw the path between the last point and the first point only if point count is greater than 3.

#### setOneWayTrail

It will remove the path between the last point and the first point.

### Events

_Mapbox-gl-path_ fires a number of events. All of these events are namespaced with `MapboxPathControl` and are emitted from the Mapbox GL JS map object. All events are all triggered by user interaction.

```js
map.on("MapboxPathControl.create", function (event) {
  console.log(event.createdPoint);
});
```

#### MapboxPathControl.create

Fired when a Point is created.
The event data is an object with the following shape:

```ts
{
  featureCollection: GeoJSON.FeatureCollection<GeoJSON.Geometry>,
  createdPoint: Feature<Point>,
}
```

#### MapboxPathControl.delete

Fired when a Point is deleted.
The event data is an object with the following shape:

```ts
{
  deletedPoint: Feature<Point>,
}
```

#### MapboxPathControl.update

Fired when a Point is updated.
The event data is an object with the following shape:

```ts
{
  featureCollection: GeoJSON.FeatureCollection<GeoJSON.Geometry>,
}
```

## Run Locally

Clone the project

```bash
git clone git@github.com:makinacorpus/mapbox-gl-path.git
```

Go to the project directory

```bash
cd mapbox-gl-path
```

Install dependencies

```bash
npm install
```

Start the server

```bash
mapboxglToken="YOUR_ACCESS_TOKEN" npm run start
```

## Build

```bash
npm run build
```

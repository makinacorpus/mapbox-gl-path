# MAPBOX-GL-PATH

Create path with or without help of various directions API

## GETTING STARTED

```
npm install @makina-corpus/mapbox-gl-path
```

## DOCUMENTATION

Working example is available at rollup.config.dev.js, look at development part

```
const map = new mapboxgl.Map({...});
const mapboxPathControl = new MapboxPathControl(parameters);
map.addControl(mapboxPathControl);
const featureCollection = mapboxPathControl.getFeatureCollection();
```

### PARAMETERS

- parameters

```
{
  languageId: AvailableLanguages | undefined;
  layersCustomisation: LayersCustomisation | undefined;
  featureCollection: GeoJSON.FeatureCollection<GeoJSON.Geometry> | undefined;
  directionsThemes: DirectionsTheme[] | undefined;
}
```

- translate - function | undefined - A function to provide locales. The default language is set to english (findable in src/i18n.js)

- layersCustomisation - LayersCustomisation | undefined

```
LayersCustomisation {
  pointCircleLayerCustomisation: LayerCustomisation;
  pointTextLayerCustomisation: LayerCustomisation;
  lineLayerCustomisation: LayerCustomisation;
  phantomJunctionLineLayerCustomisation: LayerCustomisation;
}

LayerCustomisation {
  layout: AnyLayout;
  paint: AnyPaint;
}
```

- featureCollection - `GeoJSON.FeatureCollection<GeoJSON.Geometry> | undefined`

The featureCollection includes features that could be type of Point or Linestring\
Linestring can be a line between points or a phantom junction line

- lineString - `Feature<LineString> | undefined`

A feature of Linestring type (only applied if `featureCollection` parameter is not set) 
Some properties can describe section of points and phantom junction  
- `path: string[]` : a collection of string describing each junction. Values can be `free`, `direction` or `junction` 
- `points: number[]` : a collection of all coordinates points between each junction
If there are no properties, Mapbox-gl-path create two points at the edge of the lineString and determine if the path is following direction if `directionsTheme` is defined and `isFollowingDirections` is equal at `true`. 

Point

```
properties {
  index: number
}
```

Line between points

```
properties {
  index: number
  isFollowingDirections: boolean
}
```

phantomJunction line

```
properties {
  index: number
  isPhantomJunction: boolean
  isDeparture: boolean
}
```

- directionsThemes - DirectionsTheme[] | undefined

```
DirectionsTheme {
  id: number;
  name: string;
  getPathByCoordinates: (
    coordinates: number[][]
  ) => Promise<DirectionsThemeResponse | undefined>;
}

DirectionsThemeResponse {
  coordinates: number[][];
  waypoints: Waypoints | undefined;
}

Waypoints {
  departure: number[];
  arrival: number[];
}
```

getPathByCoordinates function return a object of type DirectionsThemeResponse with the coordinates between two points and waypoints, if necessary, to create phantomJunction lines between waypoints and points

### METHODS

#### clearFeatureCollection

#### getFeatureCollection

return `GeoJSON.FeatureCollection<GeoJSON.Geometry>`

#### getLineString

return `Feature<LineString>`

#### setFeatureCollection

##### Parameter

featureCollection - `GeoJSON.FeatureCollection<GeoJSON.Geometry>`

#### setLineString
##### Parameter

lineString - `Feature<LineString>`

## DEVELOPMENT

```
git clone git@github.com:makinacorpus/mapbox-gl-path.git

cd mapbox-gl-path

npm install

mapboxglToken='"MAPBOXGLTOKEN"' npm run start
```

### BUILD

```
npm run build
```

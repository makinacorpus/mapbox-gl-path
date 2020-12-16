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

- languageId - string | undefined - default is 'en', availables languages are 'en' | 'fr'

- layersCustomisation - LayersCustomisation | undefined

```
LayersCustomisation {
  pointCircleLayerCustomisation: LayerCustomisation;
  pointTextLayerCustomisation: LayerCustomisation;
  lineLayerCustomisation: LayerCustomisation;
  dashedLineLayerCustomisation: LayerCustomisation;
}

LayerCustomisation {
  layout: AnyLayout;
  paint: AnyPaint;
}
```

- featureCollection - GeoJSON.FeatureCollection<GeoJSON.Geometry> | undefined

A feature can be type of Point or Linestring\
Linestring can be a line between points or a dashed line

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
  directionsIsActive: boolean
}
```

Dashed line

```
properties {
  index: number
  isDashed: boolean
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

getPathByCoordinates function return a object of type DirectionsThemeResponse with the coordinates between two points and waypoints, if necessary, to create dashed lines between waypoints and points

### METHODS

#### clearFeatureCollection

#### getFeatureCollection

return `GeoJSON.FeatureCollection<GeoJSON.Geometry>`

#### setFeatureCollection

##### Parameter

featureCollection - `GeoJSON.FeatureCollection<GeoJSON.Geometry>`

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

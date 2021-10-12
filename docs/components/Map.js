import { useEffect, useRef } from "react";
import Bleed from "nextra-theme-docs/bleed";
import mapLibre from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import mapboxPathControl from "@makina-corpus/mapbox-gl-path";

mapLibre.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

const Map = ({
  className = "",
  map: propsMap,
  pathControl: propsPathControl,
  position = "top-right",
  icons = [],
  onMapLoaded = () => {},
  ...props
}) => {
  const mapContainer = useRef(null);
  const map = useRef(null);

  useEffect(() => {
    if (map.current) return;
    map.current = new mapLibre.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/streets-v11",
      center: [1.4435, 43.6],
      zoom: 14,
      ...propsMap,
    });
    if (propsPathControl) {
      const pathControl = new mapboxPathControl({ ...propsPathControl });
      map.current.addControl(pathControl, position);
      map.current.pathControl = pathControl;
    }
  }, [propsMap, propsPathControl]);

  useEffect(() => {
    icons.forEach(({ name, path }) => {
      if (!map.current.hasImage(name)) {
        map.current.loadImage(path, (error, image) => {
          if (error) throw error;
          if (!map.current.hasImage("arrow"))
            map.current.addImage("arrow", image);
        });
      }
    });
  }, [map.current, icons]);

  useEffect(() => {
    map.current.once("style.load", () => {
      onMapLoaded(map.current);
    });
  }, [map.current, onMapLoaded]);

  return (
    <Bleed>
      <div
        ref={mapContainer}
        className="w-full h-full md:min-h-80 md:max-h-50vh md:h-screen shadow-lg"
        style={{ height: "400px" }}
        {...props}
      />
    </Bleed>
  );
};

export default Map;

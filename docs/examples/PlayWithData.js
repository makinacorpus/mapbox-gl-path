import { useState, useCallback } from "react";
import Bleed from "nextra-theme-docs/bleed";
import Callout from "nextra-theme-docs/callout";
import bbox from "@turf/bbox";
import { Tabs, TabList, Tab, TabPanels, TabPanel } from "@reach/tabs";

import Map from "../components/Map";
import MontBlancTour from "./files/MontBlancTour.json";
import HalfDomeTreck from "./files/HalfDomeTreck.json";

import ImportGeomFile from "../components/ImportGeomFile";
import pathControl from "../examples/introduction";
import themeConfig from "../theme.config";

const PlayWithData = () => {
  const [map, setMap] = useState(null);

  const onMapLoaded = (mapLoaded) => {
    setMap(mapLoaded);
  };

  const onChange = useCallback(
    (geojson) => {
      const firstLineString = geojson.features.find(
        ({ geometry: { type } }) => type === "LineString"
      );
      map.pathControl.setLineString(firstLineString);
      const lineString = map.pathControl.getLineString();
      map.fitBounds(bbox(lineString.geometry), { padding: 10 });
    },
    [map]
  );

  const loadData = useCallback(
    (json) => {
      map.pathControl.setLineString(json);
      const lineString = map.pathControl.getLineString();
      map.fitBounds(bbox(lineString.geometry), { padding: 10 });
    },
    [map]
  );

  return (
    <>
      <Map onMapLoaded={onMapLoaded} pathControl={pathControl} />
      <Bleed>
        <Tabs className="relative  rounded-tl-xl sm:rounded-t-xl lg:rounded-xl shadow-lg divide-y">
          {({ selectedIndex }) => {
            const getTabClassName = (index) =>
              selectedIndex === index
                ? "px-4 py-2 rounded-md bg-blue-100 text-blue-700"
                : "px-4 py-2";
            return (
              <>
                <TabList className="p-4">
                  <Tab className={getTabClassName(0)}>
                    🎉 Test with your own data
                  </Tab>
                  <Tab className={getTabClassName(1)}>
                    👇 Or pick one example below
                  </Tab>
                </TabList>
                <TabPanels>
                  <TabPanel className="p-4">
                    <ImportGeomFile onChange={onChange} />
                    <Callout emoji="✅">
                      No data will be stored in this site.
                    </Callout>
                  </TabPanel>

                  <TabPanel>
                    <ul className="m-0 list-none divide-y">
                      <li className="p-4">
                        <button
                          className="px-4 py-2 rounded-md bg-blue-100 text-blue-700"
                          onClick={() => loadData(MontBlancTour)}
                        >
                          Tour of Mont Blanc trekking
                        </button>
                        <p>
                          <span>A lineString</span>.{" "}
                          <a
                            href={`${themeConfig.docsRepositoryBase}/examples/files/MontBlancTour.json`}
                          >
                            See file.
                          </a>
                        </p>
                      </li>
                      <li className="p-4">
                        <button
                          className="px-4 py-2 rounded-md bg-blue-100 text-blue-700"
                          onClick={() => loadData(HalfDomeTreck)}
                        >
                          Half Dome trek
                        </button>
                        <p>
                          <span>
                            A lineString previously described by Mapbox-gl-path
                          </span>
                          .{" "}
                          <a
                            href={`${themeConfig.docsRepositoryBase}/examples/files/HalfDomeTreck.json`}
                          >
                            See file.
                          </a>
                        </p>
                      </li>
                    </ul>
                  </TabPanel>
                </TabPanels>
              </>
            );
          }}
        </Tabs>
      </Bleed>
    </>
  );
};

export default PlayWithData;

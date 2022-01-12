import { useCallback } from "react";
import * as toGeojson from "@tmcw/togeojson";
import Callout from "nextra-theme-docs/callout";

const ALL_ACCEPTED_EXTENSIONS = Object.keys(toGeojson).filter(
  (method) => !method.endsWith("Gen")
);

const getGeojson = (data, fileExtension) => {
  let geom = null;
  let error = null;
  const xml = new DOMParser().parseFromString(data, "text/xml");
  try {
    const xmlConverter = toGeojson[fileExtension];
    geom = xmlConverter(xml);
  } catch ({ name }) {
    error = name;
  }
  return { geom, error };
};

const ImportGeomFile = ({ onChange }) => {
  const handleChange = useCallback(
    ({
      target: {
        files: [file],
      },
    }) => {
      const { name } = file;
      const [, fileExtension] = name.split(".");
      if (!ALL_ACCEPTED_EXTENSIONS.includes(fileExtension)) {
        return;
      }

      const reader = new FileReader();
      reader.onload = ({ target: { result } }) => {
        const { geom } = getGeojson(result, fileExtension);
        onChange(geom);
      };
      reader.readAsText(file);
    },
    [ALL_ACCEPTED_EXTENSIONS, onChange]
  );

  const accept = ALL_ACCEPTED_EXTENSIONS.map((ext) =>
    `.${ext}`.toUpperCase()
  ).join(",");

  return (
    <div>
      <label>
        <span className="mb-4 cursor-pointer">Upload your file: </span>
        <input type="file" onChange={handleChange} accept={accept} />
        <small className="block">
          (only <em>{accept}</em> files formats are accepted)
        </small>
      </label>
      <Callout emoji="👉" className="bg-gray-50">
        Only the first <em>LineString</em> of the file will be picked to the
        demo example <br />
        (if there are no LineString, the import will be ignored)
      </Callout>
    </div>
  );
};

export default ImportGeomFile;

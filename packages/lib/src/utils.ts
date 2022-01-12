import { DirectionsTheme, ThemeSelectionType } from "./index";

export function createElement(tagName: string, props: object = {}) {
  const element = document.createElement(tagName);
  if (tagName === "button") {
    element.setAttribute("type", "button");
  }
  return Object.assign(element, props);
}

export function selectThemesElement({
  props,
  themes,
  themeSelectionType,
}: {
  props: object;
  themes: DirectionsTheme[];
  themeSelectionType: ThemeSelectionType;
}) {
  const pathControlSelection = createElement("div", {
    className: `mapbox-gl-path-theme-selection mapbox-gl-path-theme-selection--${themeSelectionType}`,
  });

  // Find the selected index or pick the first one
  let selectedIndex = themes.findIndex(({ selected }) => selected);
  if (selectedIndex === -1) {
    selectedIndex = 0;
  }

  // Build a select tag
  if (themeSelectionType === "select") {
    const select = createElement("select", props);
    themes.forEach((theme, index) => {
      const pathControlSelectOption = createElement("option", {
        name: "mapbox-gl-path-theme-selection",
        selected: selectedIndex === index,
        textContent: theme.name,
        value: theme.id.toString(),
      });
      select.append(pathControlSelectOption);
    });
    pathControlSelection.append(select);
  }

  // Build a radio list tag
  if (themeSelectionType === "radioList") {
    themes.forEach((theme, index) => {
      const id = `${theme.name.split(" ").join("-")}-${theme.id.toString()}`;
      const pathControlRadioLabel = createElement("div", {
        className: "mapbox-gl-path-theme-selection__item",
      });
      const pathControlRadio = createElement("input", {
        className: "mapbox-gl-path-theme-selection__radio",
        checked: selectedIndex === index,
        id,
        name: "mapbox-gl-path-theme-selection",
        type: "radio",
        value: theme.id.toString(),
        ...props,
      });
      const pathControlLabel = createElement("label", {
        className: "mapbox-gl-path-theme-selection__radio-label",
        htmlFor: id,
        textContent: theme.name,
      });
      pathControlRadioLabel.append(pathControlRadio, pathControlLabel);
      pathControlSelection.append(pathControlRadioLabel);
    });
  }

  return pathControlSelection;
}

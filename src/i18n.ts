type TranslationsKeys = {
  [key in string]: string;
};

type Params =
  | {
      [key in string]: string;
    }
  | undefined;

/**
 * t function mock to get mocked translations in component.
 * Components will provide a way to get the real `t()` function as prop.
 */
export const translateMock = (translationsKeys: TranslationsKeys = {}) => (
  key: string,
  params: Params = {}
) => {
  let targetedKey = translationsKeys[key] || key;
  const paramsAsArray = Object.entries(params);
  if (paramsAsArray.length > 0) {
    paramsAsArray.forEach(
      ([key, value]) =>
        (targetedKey = targetedKey.replace(
          new RegExp(`{{${key}}}`, "g"),
          value
        ))
    );
    if (params.context) {
      targetedKey = translationsKeys[`${key}_${params.context}`];
    }
  }
  return targetedKey;
};

export const defaultLocales = {
  "gl-pathControl.followDirection": "Follow direction",
  "gl-pathControl.enableFollowDirectionMode":
    "Enable direction with: {{theme}}",
  "gl-pathControl.disableFollowDirectionMode": "Disable direction",
  "gl-pathControl.createPoint": "Create point",
  "gl-pathControl.createIntermediatePoint": "Create intermediate point",
  "gl-pathControl.deletePoint": "Delete point",
  "gl-pathControl.loopPoint": "Round trip",
  "gl-pathControl.oneWayPoint": "One way",
};

type TranslationsKeys = {
  [key in string]: string;
};

type Params =
  | {
      context: string | undefined;
    }
  | undefined;

/**
 * t function mock to get mocked translations in component.
 * Components will provide a way to get the real `t()` function as prop.
 */
export const translateMock = (translationsKeys: TranslationsKeys = {}) => (
  key: string,
  params: Params
) => {
  let targetedKey = translationsKeys[key] || key;
  if (params?.context) {
    targetedKey = translationsKeys[`${key}_${params.context}`];
  }
  return targetedKey;
};

export const defaultLocales = {
  "gl-pathControl.followDirection": "Follow direction",
  "gl-pathControl.enableFollowDirectionMode": "Enable direction",
  "gl-pathControl.disableFollowDirectionMode": "Disable direction",
  "gl-pathControl.createPoint": "Create point",
  "gl-pathControl.createIntermediatePoint": "Create intermediate point",
  "gl-pathControl.deletePoint": "Delete point",
};

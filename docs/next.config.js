const withTM = require("next-transpile-modules")([
  "@makina-corpus/mapbox-gl-path",
]);

const withNextra = require("nextra")({
  theme: "nextra-theme-docs",
  themeConfig: "./theme.config.js",
  // unstable_staticImage: true,
});

module.exports = withTM(
  withNextra({
    target: "serverless",
    webpack: (config) => {
      Object.assign(config.resolve.alias, {
        "mapbox-gl": "maplibre-gl",
      });
      return config;
    },
  })
);

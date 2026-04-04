const path = require("path");

module.exports = {
  webpack: {
    alias: {
      "@bin/shared": path.resolve(__dirname, "../../packages/shared/src"),
    },
    configure: (webpackConfig) => {
      // 1. Remove ModuleScopePlugin to allow imports from outside src/
      const scopePluginIndex = webpackConfig.resolve.plugins.findIndex(
        ({ constructor }) => constructor && constructor.name === "ModuleScopePlugin"
      );
      if (scopePluginIndex !== -1) {
        webpackConfig.resolve.plugins.splice(scopePluginIndex, 1);
      }

      // 2. Add shared package to babel-loader include to ensure it's transpiled
      const sharedPath = path.resolve(__dirname, "../../packages/shared");
      const oneOfRule = webpackConfig.module.rules.find((rule) => rule.oneOf);
      if (oneOfRule) {
        const babelLoaderRule = oneOfRule.oneOf.find(
          (rule) => rule.loader && rule.loader.includes("babel-loader")
        );

        if (babelLoaderRule) {
          if (Array.isArray(babelLoaderRule.include)) {
            babelLoaderRule.include.push(sharedPath);
          } else {
            babelLoaderRule.include = [babelLoaderRule.include, sharedPath];
          }
        }
      }

      return webpackConfig;
    },
  },
};

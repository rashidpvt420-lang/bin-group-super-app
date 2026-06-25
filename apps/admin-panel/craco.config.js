const path = require("path");
const webpack = require("webpack");

module.exports = {
  webpack: {
    alias: {
      "@bin/shared": path.resolve(__dirname, "../../packages/shared/src"),
      // Prevent React hook crashes from duplicate React instances when the admin
      // panel imports shared workspace source files.
      react: path.resolve(__dirname, "node_modules/react"),
      "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
      "react/jsx-runtime": path.resolve(__dirname, "node_modules/react/jsx-runtime"),
      "react/jsx-dev-runtime": path.resolve(__dirname, "node_modules/react/jsx-dev-runtime"),
    },
    configure: (webpackConfig) => {
      // 1. Remove ModuleScopePlugin to allow imports from outside src/
      const scopePluginIndex = webpackConfig.resolve.plugins.findIndex(
        ({ constructor }) => constructor && constructor.name === "ModuleScopePlugin"
      );
      if (scopePluginIndex !== -1) {
        webpackConfig.resolve.plugins.splice(scopePluginIndex, 1);
      }

      // 2. Replace the malformed dashboard module with a production-safe fallback
      // without importing or parsing the broken source file during admin builds.
      webpackConfig.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /\.\/pages\/dashboard\/DashboardPage$/,
          "./pages/dashboard/DashboardPageStable"
        )
      );

      // 3. Add shared package to babel-loader include to ensure it's transpiled
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

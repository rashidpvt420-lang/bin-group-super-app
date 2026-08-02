const path = require("path");

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
      // Remove ModuleScopePlugin to allow imports from the shared workspace.
      const scopePluginIndex = webpackConfig.resolve.plugins.findIndex(
        ({ constructor }) => constructor && constructor.name === "ModuleScopePlugin"
      );
      if (scopePluginIndex !== -1) {
        webpackConfig.resolve.plugins.splice(scopePluginIndex, 1);
      }

      // Add the shared package to babel-loader so direct subpath imports remain
      // fully transpiled without routing through the side-effectful barrel file.
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

      // Keep document-generation and charting libraries out of the login and
      // authentication boot path. These groups are async-only and are fetched
      // when their lazy route is actually opened.
      const splitChunks = webpackConfig.optimization?.splitChunks;
      if (splitChunks && typeof splitChunks === "object") {
        splitChunks.cacheGroups = {
          ...(splitChunks.cacheGroups || {}),
          pdfVendor: {
            test: /[\\/]node_modules[\\/](jspdf|jspdf-autotable|html2canvas|canvg|dompurify|fflate)[\\/]/,
            name: "pdf-vendor",
            chunks: "async",
            priority: 45,
            enforce: true,
          },
          chartsVendor: {
            test: /[\\/]node_modules[\\/](recharts|d3-[^\\/]+)[\\/]/,
            name: "charts-vendor",
            chunks: "async",
            priority: 35,
            enforce: true,
          },
        };
      }

      return webpackConfig;
    },
  },
};

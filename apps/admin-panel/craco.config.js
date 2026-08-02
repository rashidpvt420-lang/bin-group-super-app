const path = require("path");

const BOOT_CHUNK_NAMES = new Set(["admin-app-shell", "admin-error-boundary"]);
const ASYNC_BOUNDARY_GROUPS = {
  jspdfVendor: /(?:^|\/)node_modules\/(?:jspdf|jspdf-autotable)(?:\/|$)/,
  htmlCanvasVendor: /(?:^|\/)node_modules\/(?:html2canvas|canvg|dompurify|fflate)(?:\/|$)/,
  chartsVendor: /(?:^|\/)node_modules\/(?:recharts|d3-[^/]+)(?:\/|$)/,
  reportRoutes: /(?:^|\/)(?:apps\/admin-panel\/)?src\/(?:pages\/reports|components\/reports)\//,
};

function collectModuleIdentities(module, identities, seen = new Set()) {
  if (!module || typeof module !== "object" || seen.has(module)) return;
  seen.add(module);

  for (const field of ["resource", "userRequest", "rawRequest"]) {
    if (typeof module[field] === "string" && module[field]) identities.add(module[field]);
  }

  if (typeof module.identifier === "function") {
    try {
      const identifier = module.identifier();
      if (identifier) identities.add(String(identifier));
    } catch {
      // Some webpack module wrappers do not expose an identifier until later.
    }
  }

  if (module.rootModule) collectModuleIdentities(module.rootModule, identities, seen);
  if (module.modules && Symbol.iterator in Object(module.modules)) {
    for (const child of module.modules) collectModuleIdentities(child, identities, seen);
  }
}

class AdminAsyncBoundaryEvidencePlugin {
  apply(compiler) {
    const pluginName = "AdminAsyncBoundaryEvidencePlugin";

    compiler.hooks.thisCompilation.tap(pluginName, (compilation) => {
      const { Compilation, sources } = compiler.webpack;

      compilation.hooks.processAssets.tap(
        {
          name: pluginName,
          stage: Compilation.PROCESS_ASSETS_STAGE_REPORT,
        },
        () => {
          const workingDirectory = process.cwd().replaceAll("\\", "/");
          const groupEvidence = Object.fromEntries(
            Object.keys(ASYNC_BOUNDARY_GROUPS).map((name) => [name, { present: false, moduleCount: 0, chunks: [], bootCriticalChunks: [] }]),
          );
          const chunkEvidence = [];
          let appShellModuleFound = false;

          for (const chunk of compilation.chunks) {
            const identities = new Set();
            for (const module of compilation.chunkGraph.getChunkModulesIterable(chunk)) {
              collectModuleIdentities(module, identities);
            }

            const normalizedIdentities = [...identities]
              .map((value) => String(value).replaceAll("\\", "/").replaceAll(workingDirectory, "."))
              .sort();
            const chunkName = typeof chunk.name === "string" ? chunk.name : null;
            const initial = typeof chunk.canBeInitial === "function" ? chunk.canBeInitial() : false;
            const containsAppShellModule = normalizedIdentities.some((identity) => /(?:^|\/)src\/App\.(?:tsx?|jsx?)(?:$|\?)/.test(identity));
            const containsErrorBoundaryModule = normalizedIdentities.some((identity) => /(?:^|\/)src\/components\/ErrorBoundary\.(?:tsx?|jsx?)(?:$|\?)/.test(identity));
            const bootCritical = initial || BOOT_CHUNK_NAMES.has(chunkName) || containsAppShellModule || containsErrorBoundaryModule;
            if (containsAppShellModule) appShellModuleFound = true;

            const chunkRecord = {
              id: chunk.id ?? null,
              name: chunkName,
              files: [...chunk.files].sort(),
              initial,
              bootCritical,
              moduleCount: normalizedIdentities.length,
            };
            chunkEvidence.push(chunkRecord);

            for (const [groupName, pattern] of Object.entries(ASYNC_BOUNDARY_GROUPS)) {
              const matchingModules = normalizedIdentities.filter((identity) => pattern.test(identity));
              if (matchingModules.length === 0) continue;

              const record = {
                ...chunkRecord,
                matchingModuleCount: matchingModules.length,
                matchingModules,
              };
              const group = groupEvidence[groupName];
              group.present = true;
              group.moduleCount += matchingModules.length;
              group.chunks.push(record);
              if (bootCritical) group.bootCriticalChunks.push(record);
            }
          }

          const failures = [];
          if (!appShellModuleFound) failures.push("Admin App module was not found in the emitted webpack chunk graph");
          for (const [groupName, group] of Object.entries(groupEvidence)) {
            if (group.bootCriticalChunks.length > 0) {
              const chunks = group.bootCriticalChunks
                .map((chunk) => chunk.name || chunk.id || chunk.files.join(","))
                .join(", ");
              failures.push(`${groupName} leaked into login-critical chunk(s): ${chunks}`);
            }
          }

          const evidence = {
            schemaVersion: 1,
            status: failures.length === 0 ? "pass" : "fail",
            bootChunkNames: [...BOOT_CHUNK_NAMES],
            appShellModuleFound,
            chunkCount: chunkEvidence.length,
            chunks: chunkEvidence.sort((left, right) => String(left.name || left.id).localeCompare(String(right.name || right.id))),
            groups: groupEvidence,
            failures,
            sensitiveValuesExcluded: true,
            hardLaunchClaim: false,
          };

          compilation.emitAsset(
            "admin-async-boundaries.json",
            new sources.RawSource(`${JSON.stringify(evidence, null, 2)}\n`),
          );

          for (const failure of failures) {
            compilation.errors.push(new Error(`[admin-async-boundaries] ${failure}`));
          }
        },
      );
    });
  }
}

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

      // Keep document-generation, charting, and report-route code out of the
      // login/authentication boot path. These groups are async-only and are
      // fetched only when their lazy route is opened.
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
          reportRoutes: {
            test: /[\\/]apps[\\/]admin-panel[\\/]src[\\/](?:pages[\\/]reports|components[\\/]reports)[\\/]/,
            name: "report-routes",
            chunks: "async",
            priority: 30,
            enforce: true,
          },
        };
      }

      webpackConfig.plugins = [
        ...(webpackConfig.plugins || []),
        new AdminAsyncBoundaryEvidencePlugin(),
      ];

      return webpackConfig;
    },
  },
};

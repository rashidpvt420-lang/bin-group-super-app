#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const IOS_MAPS_DEPENDENCY_MODES = Object.freeze({
  WEB_ONLY: 'NOT_INSTALLED_WEB_MAPS_ONLY',
  SWIFT_PACKAGE_MANAGER: 'SWIFT_PACKAGE_MANAGER',
  LEGACY_COCOAPODS: 'LEGACY_COCOAPODS',
  INVALID: 'INVALID_OR_UNPINNED',
});

const GOOGLE_NATIVE_PRODUCTS = Object.freeze([
  'GoogleMaps',
  'GoogleMapsBase',
  'GoogleMapsCore',
  'GoogleMapsM4B',
  'GooglePlaces',
  'GoogleNavigation',
]);

const IOS_NATIVE_EXTENSIONS = new Set(['.swift', '.m', '.mm', '.h']);
const TEXT_CONFIG_EXTENSIONS = new Set(['.xcconfig', '.pbxproj', '.yml', '.yaml']);

function readOptional(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf8') : '';
}

function walkFiles(directory, predicate, output = []) {
  if (!existsSync(directory)) return output;
  for (const entry of readdirSync(directory)) {
    const absolutePath = path.join(directory, entry);
    const stats = statSync(absolutePath);
    if (stats.isDirectory()) {
      walkFiles(absolutePath, predicate, output);
    } else if (predicate(absolutePath)) {
      output.push(absolutePath);
    }
  }
  return output;
}

function readFiles(files) {
  return files.map((file) => ({ file, source: readFileSync(file, 'utf8') }));
}

function parsePackageJson(root, failures) {
  const source = readOptional(root, 'package.json');
  if (!source) {
    failures.push('package.json is required for the iOS Apple Silicon audit');
    return {};
  }
  try {
    return JSON.parse(source);
  } catch {
    failures.push('package.json must contain valid JSON');
    return {};
  }
}

function detectsIntelOnlyArchitecture(source) {
  return [
    /(?:^|\s)ARCHS(?:\[[^\]]+\])?\s*=\s*["']?x86_64(?:["';\s]|$)/im,
    /(?:^|\s)VALID_ARCHS(?:\[[^\]]+\])?\s*=\s*["']?x86_64(?:["';\s]|$)/im,
    /["']?EXCLUDED_ARCHS\[sdk=iphonesimulator\*?\]["']?\s*=\s*["']?arm64(?:["';\s]|$)/im,
  ].some((pattern) => pattern.test(source));
}

function detectsExplicitIntelRunner(source) {
  return /runs-on:\s*[^\n]*(?:macos-(?:10|11|12|13)(?:\b|\.)|\bx86_64\b|\bx64\b|\bintel\b)/i.test(source);
}

function googlePodNames(source) {
  return GOOGLE_NATIVE_PRODUCTS.filter((name) => (
    new RegExp(`(?:pod\\s+['\"]${name}['\"]|^-\\s+${name}(?:\\s|\\(|$))`, 'im').test(source)
  ));
}

function containsGoogleNativeSymbol(source) {
  return /\b(?:GMSMapView|GMSServices|GMSPlacesClient|GMSNavigation|GMSMapID)\b/.test(source);
}

function detectSwiftPackage(projectSource, resolvedSource) {
  const combined = `${projectSource}\n${resolvedSource}`;
  const googleRepository = /github\.com\/googlemaps\/ios-[a-z0-9-]+-sdk(?:\.git)?/i.test(combined);
  const googleProduct = GOOGLE_NATIVE_PRODUCTS.some((name) => new RegExp(`\\b${name}\\b`).test(combined));
  const detected = googleRepository && googleProduct;
  const exactRequirement = /kind\s*=\s*exactVersion\s*;/i.test(projectSource)
    && /version\s*=\s*["']?\d+\.\d+\.\d+["']?\s*;/i.test(projectSource);
  return { detected, exactRequirement };
}

export function analyzeIosAppleSiliconReadiness(root = process.cwd()) {
  const failures = [];
  const warnings = [];
  const pkg = parsePackageJson(root, failures);
  const dependencies = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const capacitorGoogleMapsVersion = String(dependencies['@capacitor/google-maps'] || '').trim();

  const podfile = readOptional(root, 'ios/App/Podfile');
  const podfileLock = readOptional(root, 'ios/App/Podfile.lock');
  const projectSource = readOptional(root, 'ios/App/App.xcodeproj/project.pbxproj');
  const packageResolved = readOptional(root, 'ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved')
    || readOptional(root, 'ios/App/App.xcworkspace/xcshareddata/swiftpm/Package.resolved');

  const iosConfigFiles = walkFiles(path.join(root, 'ios'), (file) => TEXT_CONFIG_EXTENSIONS.has(path.extname(file)));
  const workflowFiles = walkFiles(path.join(root, '.github', 'workflows'), (file) => ['.yml', '.yaml'].includes(path.extname(file)));
  const iosNativeFiles = walkFiles(path.join(root, 'ios', 'App', 'App'), (file) => IOS_NATIVE_EXTENSIONS.has(path.extname(file)));

  for (const { file, source } of readFiles(iosConfigFiles)) {
    if (detectsIntelOnlyArchitecture(source)) {
      failures.push(`Intel-only iOS architecture configuration detected in ${path.relative(root, file)}`);
    }
  }

  for (const { file, source } of readFiles(workflowFiles)) {
    if (detectsExplicitIntelRunner(source)) {
      failures.push(`Explicit Intel macOS runner detected in ${path.relative(root, file)}`);
    }
  }

  const podNames = [...new Set([
    ...googlePodNames(podfile),
    ...googlePodNames(podfileLock),
  ])];
  const hasM4B = /\bGoogleMapsM4B\b/.test(`${podfile}\n${podfileLock}\n${projectSource}\n${packageResolved}`);
  const nativeSymbolsDetected = readFiles(iosNativeFiles).some(({ source }) => containsGoogleNativeSymbol(source));
  const swiftPackage = detectSwiftPackage(projectSource, packageResolved);

  let dependencyMode = IOS_MAPS_DEPENDENCY_MODES.WEB_ONLY;
  if (hasM4B) {
    dependencyMode = IOS_MAPS_DEPENDENCY_MODES.INVALID;
    failures.push('GoogleMapsM4B is prohibited');
  } else if (podNames.length > 0) {
    dependencyMode = IOS_MAPS_DEPENDENCY_MODES.LEGACY_COCOAPODS;
    failures.push(`Native Google Maps CocoaPods dependencies are not permitted for new adoption: ${podNames.join(', ')}`);
  } else if (capacitorGoogleMapsVersion) {
    dependencyMode = IOS_MAPS_DEPENDENCY_MODES.INVALID;
    failures.push('@capacitor/google-maps requires an explicit native iOS dependency review and exact Swift Package Manager pin');
  } else if (swiftPackage.detected) {
    dependencyMode = swiftPackage.exactRequirement
      ? IOS_MAPS_DEPENDENCY_MODES.SWIFT_PACKAGE_MANAGER
      : IOS_MAPS_DEPENDENCY_MODES.INVALID;
    if (!swiftPackage.exactRequirement) {
      failures.push('Native Google Maps Swift Package Manager integration must use exactVersion with an exact semantic version');
    }
  } else if (nativeSymbolsDetected) {
    dependencyMode = IOS_MAPS_DEPENDENCY_MODES.INVALID;
    failures.push('Native Google Maps iOS symbols exist without a recognized exact Swift Package Manager dependency');
  }

  if (!podfile) warnings.push('ios/App/Podfile is missing');
  if (!projectSource) warnings.push('ios/App/App.xcodeproj/project.pbxproj is missing');

  return {
    status: failures.length ? 'failed' : 'passed',
    dependencyMode,
    nativeGoogleMapsSdkDetected: dependencyMode !== IOS_MAPS_DEPENDENCY_MODES.WEB_ONLY,
    appleSiliconDevelopmentRequiredBy: 'Q3 2026',
    checkedIosConfigFiles: iosConfigFiles.length,
    checkedWorkflowFiles: workflowFiles.length,
    checkedNativeSourceFiles: iosNativeFiles.length,
    failures: [...new Set(failures)],
    warnings: [...new Set(warnings)],
  };
}

function runCli() {
  const result = analyzeIosAppleSiliconReadiness(process.cwd());
  console.log(`[ios-apple-silicon] dependency mode: ${result.dependencyMode}`);
  console.log(`[ios-apple-silicon] checked ${result.checkedIosConfigFiles} iOS config file(s), ${result.checkedWorkflowFiles} workflow file(s), and ${result.checkedNativeSourceFiles} native source file(s)`);
  for (const warning of result.warnings) console.warn(`[ios-apple-silicon] warning: ${warning}`);
  if (result.failures.length) {
    console.error('[ios-apple-silicon] FAIL');
    for (const failure of result.failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log('[ios-apple-silicon] PASS');
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  runCli();
}

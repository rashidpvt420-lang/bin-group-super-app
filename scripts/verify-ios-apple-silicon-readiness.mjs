#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const IOS_MAPS_DEPENDENCY_MODES = Object.freeze({
  WEB_ONLY: 'NOT_INSTALLED_WEB_MAPS_ONLY',
  SWIFT_PACKAGE_MANAGER: 'SWIFT_PACKAGE_MANAGER',
  LEGACY_COCOAPODS: 'LEGACY_COCOAPODS',
  INVALID: 'INVALID_OR_UNPINNED',
});

const GOOGLE_POD_PATTERNS = Object.freeze([
  { name: 'GoogleMaps', pattern: /(?:pod\s+['"]GoogleMaps(?:\/[^'"]+)?['"]|^\s*-\s+GoogleMaps(?:\/[^\s(]+)?(?:\s|\(|$))/im },
  { name: 'GoogleMapsBase', pattern: /(?:pod\s+['"]GoogleMapsBase(?:\/[^'"]+)?['"]|^\s*-\s+GoogleMapsBase(?:\/[^\s(]+)?(?:\s|\(|$))/im },
  { name: 'GoogleMapsCore', pattern: /(?:pod\s+['"]GoogleMapsCore(?:\/[^'"]+)?['"]|^\s*-\s+GoogleMapsCore(?:\/[^\s(]+)?(?:\s|\(|$))/im },
  { name: 'GoogleMapsM4B', pattern: /(?:pod\s+['"]GoogleMapsM4B(?:\/[^'"]+)?['"]|^\s*-\s+GoogleMapsM4B(?:\/[^\s(]+)?(?:\s|\(|$))/im },
  { name: 'GooglePlaces', pattern: /(?:pod\s+['"]GooglePlaces(?:\/[^'"]+)?['"]|^\s*-\s+GooglePlaces(?:\/[^\s(]+)?(?:\s|\(|$))/im },
  { name: 'GoogleNavigation', pattern: /(?:pod\s+['"]GoogleNavigation(?:\/[^'"]+)?['"]|^\s*-\s+GoogleNavigation(?:\/[^\s(]+)?(?:\s|\(|$))/im },
]);

const GOOGLE_PRODUCT_PATTERNS = Object.freeze([
  /\bGoogleMaps\b/,
  /\bGoogleMapsBase\b/,
  /\bGoogleMapsCore\b/,
  /\bGoogleMapsM4B\b/,
  /\bGooglePlaces\b/,
  /\bGoogleNavigation\b/,
]);

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
  return GOOGLE_POD_PATTERNS.filter(({ pattern }) => pattern.test(source)).map(({ name }) => name);
}

function containsGoogleNativeSymbol(source) {
  return /\b(?:GMSMapView|GMSServices|GMSPlacesClient|GMSNavigation|GMSMapID)\b/.test(source);
}

function detectSwiftPackage(projectSource, resolvedSource) {
  const combined = `${projectSource}\n${resolvedSource}`;
  const googleRepository = /github\.com\/googlemaps\/ios-[a-z0-9-]+-sdk(?:\.git)?/i.test(combined);
  const googleProduct = GOOGLE_PRODUCT_PATTERNS.some((pattern) => pattern.test(combined));
  const detected = googleRepository && googleProduct;
  const exactRequirement = /kind\s*=\s*exactVersion\s*;/i.test(projectSource)
    && /version\s*=\s*["']?\d+\.\d+\.\d+["']?\s*;/i.test(projectSource);
  return { detected, exactRequirement };
}

function parsePackageJson(packageJsonText, failures) {
  if (!packageJsonText) {
    failures.push('package.json is required for the iOS Apple Silicon audit');
    return {};
  }
  try {
    return JSON.parse(packageJsonText);
  } catch {
    failures.push('package.json must contain valid JSON');
    return {};
  }
}

export function analyzeIosAppleSiliconSources({
  packageJsonText = '',
  podfile = '',
  podfileLock = '',
  projectSource = '',
  packageResolved = '',
  architectureSearchText = '',
  workflowSearchText = '',
  nativeSourceText = '',
} = {}) {
  const failures = [];
  const warnings = [];
  const pkg = parsePackageJson(packageJsonText, failures);
  const dependencies = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const capacitorGoogleMapsVersion = String(dependencies['@capacitor/google-maps'] || '').trim();

  if (detectsIntelOnlyArchitecture(`${projectSource}\n${podfile}\n${architectureSearchText}`)) {
    failures.push('Intel-only iOS architecture configuration detected');
  }
  if (detectsExplicitIntelRunner(workflowSearchText)) {
    failures.push('Explicit Intel macOS runner detected in a canonical workflow');
  }

  const podNames = [...new Set([
    ...googlePodNames(podfile),
    ...googlePodNames(podfileLock),
  ])];
  const hasM4B = /\bGoogleMapsM4B\b/.test(`${podfile}\n${podfileLock}\n${projectSource}\n${packageResolved}`);
  const nativeSymbolsDetected = containsGoogleNativeSymbol(nativeSourceText);
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
    failures: [...new Set(failures)],
    warnings: [...new Set(warnings)],
  };
}

export function analyzeIosAppleSiliconReadiness() {
  const packageJsonText = readFileSync('package.json', 'utf8');
  const podfile = existsSync('ios/App/Podfile') ? readFileSync('ios/App/Podfile', 'utf8') : '';
  const podfileLock = existsSync('ios/App/Podfile.lock') ? readFileSync('ios/App/Podfile.lock', 'utf8') : '';
  const projectSource = existsSync('ios/App/App.xcodeproj/project.pbxproj')
    ? readFileSync('ios/App/App.xcodeproj/project.pbxproj', 'utf8')
    : '';
  const packageResolved = existsSync('ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved')
    ? readFileSync('ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved', 'utf8')
    : existsSync('ios/App/App.xcworkspace/xcshareddata/swiftpm/Package.resolved')
      ? readFileSync('ios/App/App.xcworkspace/xcshareddata/swiftpm/Package.resolved', 'utf8')
      : '';
  const debugConfig = existsSync('ios/App/Debug.xcconfig') ? readFileSync('ios/App/Debug.xcconfig', 'utf8') : '';
  const releaseConfig = existsSync('ios/App/Release.xcconfig') ? readFileSync('ios/App/Release.xcconfig', 'utf8') : '';
  const ciWorkflow = existsSync('.github/workflows/ci.yml') ? readFileSync('.github/workflows/ci.yml', 'utf8') : '';
  const prWorkflow = existsSync('.github/workflows/pr-validation.yml') ? readFileSync('.github/workflows/pr-validation.yml', 'utf8') : '';
  const productionWorkflow = existsSync('.github/workflows/firebase-production-deploy.yml')
    ? readFileSync('.github/workflows/firebase-production-deploy.yml', 'utf8')
    : '';
  const appDelegate = existsSync('ios/App/App/AppDelegate.swift') ? readFileSync('ios/App/App/AppDelegate.swift', 'utf8') : '';

  return analyzeIosAppleSiliconSources({
    packageJsonText,
    podfile,
    podfileLock,
    projectSource,
    packageResolved,
    architectureSearchText: `${debugConfig}\n${releaseConfig}`,
    workflowSearchText: `${ciWorkflow}\n${prWorkflow}\n${productionWorkflow}`,
    nativeSourceText: appDelegate,
  });
}

function runCli() {
  const result = analyzeIosAppleSiliconReadiness();
  console.log(`[ios-apple-silicon] dependency mode: ${result.dependencyMode}`);
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

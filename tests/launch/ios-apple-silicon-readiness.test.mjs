import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  analyzeIosAppleSiliconSources,
  IOS_MAPS_DEPENDENCY_MODES,
} from '../../scripts/verify-ios-apple-silicon-readiness.mjs';

function fixture(overrides = {}) {
  return {
    packageJsonText: JSON.stringify({
      dependencies: {
        '@capacitor/core': '7.6.6',
        '@googlemaps/js-api-loader': '1.16.10',
      },
    }),
    podfile: "platform :ios, '14.0'\npod 'Capacitor', :path => '../../node_modules/@capacitor/ios'\n",
    podfileLock: 'PODS:\n  - Capacitor (7.6.6)\n',
    projectSource: 'PRODUCT_BUNDLE_IDENTIFIER = ae.bingroups.superapp;\n',
    packageResolved: '',
    architectureSearchText: '',
    workflowSearchText: 'jobs:\n  build:\n    runs-on: ubuntu-latest\n',
    nativeSourceText: 'import UIKit\n',
    ...overrides,
  };
}

test('repository mobile readiness executes the Apple Silicon verifier', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.equal(pkg.scripts['verify:ios-apple-silicon'], 'node scripts/verify-ios-apple-silicon-readiness.mjs');
  assert.match(pkg.scripts['test:mobile-store-readiness'], /npm run verify:ios-apple-silicon/);
  assert.match(readFileSync('docs/DEPLOYMENT.md', 'utf8'), /IOS_APPLE_SILICON_READINESS\.md/);
});

test('web Google Maps usage remains valid without a native iOS SDK', () => {
  const result = analyzeIosAppleSiliconSources(fixture());
  assert.equal(result.status, 'passed');
  assert.equal(result.dependencyMode, IOS_MAPS_DEPENDENCY_MODES.WEB_ONLY);
  assert.equal(result.nativeGoogleMapsSdkDetected, false);
  assert.deepEqual(result.failures, []);
});

test('Intel-only Xcode settings and arm64 simulator exclusions fail closed', () => {
  const result = analyzeIosAppleSiliconSources(fixture({
    architectureSearchText: [
      'ARCHS = x86_64;',
      'VALID_ARCHS = x86_64;',
      '"EXCLUDED_ARCHS[sdk=iphonesimulator*]" = arm64;',
    ].join('\n'),
  }));
  assert.equal(result.status, 'failed');
  assert.ok(result.failures.includes('Intel-only iOS architecture configuration detected'));
});

test('legacy Google Maps CocoaPods and GoogleMapsM4B are rejected', () => {
  const result = analyzeIosAppleSiliconSources(fixture({
    podfile: "pod 'GoogleMapsM4B'\n",
    podfileLock: 'PODS:\n  - GoogleMapsM4B (9.0.0)\n',
  }));
  assert.equal(result.status, 'failed');
  assert.equal(result.dependencyMode, IOS_MAPS_DEPENDENCY_MODES.INVALID);
  assert.ok(result.failures.includes('GoogleMapsM4B is prohibited'));
});

test('regular Google Maps CocoaPods dependencies are classified as legacy and rejected', () => {
  const result = analyzeIosAppleSiliconSources(fixture({
    podfile: "pod 'GoogleMaps'\n",
    podfileLock: 'PODS:\n  - GoogleMaps (9.0.0)\n',
  }));
  assert.equal(result.status, 'failed');
  assert.equal(result.dependencyMode, IOS_MAPS_DEPENDENCY_MODES.LEGACY_COCOAPODS);
  assert.ok(result.failures.some((failure) => /CocoaPods dependencies are not permitted/i.test(failure)));
});

test('native Google Maps Swift package requires an exact version', () => {
  const invalid = analyzeIosAppleSiliconSources(fixture({
    projectSource: [
      'repositoryURL = "https://github.com/googlemaps/ios-maps-sdk";',
      'productName = GoogleMaps;',
      'requirement = { kind = upToNextMajorVersion; minimumVersion = 9.0.0; };',
    ].join('\n'),
  }));
  assert.equal(invalid.status, 'failed');
  assert.equal(invalid.dependencyMode, IOS_MAPS_DEPENDENCY_MODES.INVALID);

  const valid = analyzeIosAppleSiliconSources(fixture({
    projectSource: [
      'repositoryURL = "https://github.com/googlemaps/ios-maps-sdk";',
      'productName = GoogleMaps;',
      'requirement = { kind = exactVersion; version = 9.0.0; };',
    ].join('\n'),
  }));
  assert.equal(valid.status, 'passed');
  assert.equal(valid.dependencyMode, IOS_MAPS_DEPENDENCY_MODES.SWIFT_PACKAGE_MANAGER);
});

test('explicit Intel macOS CI runners are rejected', () => {
  const result = analyzeIosAppleSiliconSources(fixture({
    workflowSearchText: 'jobs:\n  ios:\n    runs-on: macos-13\n',
  }));
  assert.equal(result.status, 'failed');
  assert.ok(result.failures.includes('Explicit Intel macOS runner detected in a canonical workflow'));
});

test('@capacitor/google-maps cannot bypass native dependency review', () => {
  const result = analyzeIosAppleSiliconSources(fixture({
    packageJsonText: JSON.stringify({
      dependencies: {
        '@capacitor/core': '7.6.6',
        '@capacitor/google-maps': '^7.0.0',
      },
    }),
  }));
  assert.equal(result.status, 'failed');
  assert.equal(result.dependencyMode, IOS_MAPS_DEPENDENCY_MODES.INVALID);
  assert.ok(result.failures.some((failure) => /explicit native iOS dependency review/i.test(failure)));
});

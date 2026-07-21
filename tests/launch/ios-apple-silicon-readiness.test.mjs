import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  analyzeIosAppleSiliconReadiness,
  IOS_MAPS_DEPENDENCY_MODES,
} from '../../scripts/verify-ios-apple-silicon-readiness.mjs';

function write(root, relativePath, content) {
  const target = path.join(root, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'bin-ios-arm64-'));
  write(root, 'package.json', JSON.stringify({
    dependencies: {
      '@capacitor/core': '7.6.6',
      '@googlemaps/js-api-loader': '1.16.10',
    },
  }, null, 2));
  write(root, 'ios/App/Podfile', "platform :ios, '14.0'\npod 'Capacitor', :path => '../../node_modules/@capacitor/ios'\n");
  write(root, 'ios/App/Podfile.lock', 'PODS:\n  - Capacitor (7.6.6)\n');
  write(root, 'ios/App/App.xcodeproj/project.pbxproj', 'PRODUCT_BUNDLE_IDENTIFIER = ae.bingroups.superapp;\n');
  write(root, 'ios/App/App/AppDelegate.swift', 'import UIKit\n');
  write(root, '.github/workflows/ci.yml', 'jobs:\n  build:\n    runs-on: ubuntu-latest\n');
  write(root, 'src/lib/maps.ts', "const script = 'https://maps.googleapis.com/maps/api/js';\n");
  return root;
}

function withFixture(run) {
  const root = fixture();
  try {
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('web Google Maps usage remains valid without a native iOS SDK', () => {
  withFixture((root) => {
    const result = analyzeIosAppleSiliconReadiness(root);
    assert.equal(result.status, 'passed');
    assert.equal(result.dependencyMode, IOS_MAPS_DEPENDENCY_MODES.WEB_ONLY);
    assert.equal(result.nativeGoogleMapsSdkDetected, false);
    assert.deepEqual(result.failures, []);
  });
});

test('Intel-only Xcode settings and arm64 simulator exclusions fail closed', () => {
  withFixture((root) => {
    write(root, 'ios/App/App.xcodeproj/project.pbxproj', [
      'ARCHS = x86_64;',
      'VALID_ARCHS = x86_64;',
      '"EXCLUDED_ARCHS[sdk=iphonesimulator*]" = arm64;',
    ].join('\n'));
    const result = analyzeIosAppleSiliconReadiness(root);
    assert.equal(result.status, 'failed');
    assert.ok(result.failures.some((failure) => /Intel-only iOS architecture/i.test(failure)));
  });
});

test('legacy Google Maps CocoaPods and GoogleMapsM4B are rejected', () => {
  withFixture((root) => {
    write(root, 'ios/App/Podfile', "pod 'GoogleMapsM4B'\n");
    write(root, 'ios/App/Podfile.lock', 'PODS:\n  - GoogleMapsM4B (9.0.0)\n');
    const result = analyzeIosAppleSiliconReadiness(root);
    assert.equal(result.status, 'failed');
    assert.equal(result.dependencyMode, IOS_MAPS_DEPENDENCY_MODES.INVALID);
    assert.ok(result.failures.includes('GoogleMapsM4B is prohibited'));
  });
});

test('native Google Maps Swift package requires an exact version', () => {
  withFixture((root) => {
    write(root, 'ios/App/App.xcodeproj/project.pbxproj', [
      'repositoryURL = "https://github.com/googlemaps/ios-maps-sdk";',
      'productName = GoogleMaps;',
      'requirement = { kind = upToNextMajorVersion; minimumVersion = 9.0.0; };',
    ].join('\n'));
    const invalid = analyzeIosAppleSiliconReadiness(root);
    assert.equal(invalid.status, 'failed');
    assert.equal(invalid.dependencyMode, IOS_MAPS_DEPENDENCY_MODES.INVALID);

    write(root, 'ios/App/App.xcodeproj/project.pbxproj', [
      'repositoryURL = "https://github.com/googlemaps/ios-maps-sdk";',
      'productName = GoogleMaps;',
      'requirement = { kind = exactVersion; version = 9.0.0; };',
    ].join('\n'));
    const valid = analyzeIosAppleSiliconReadiness(root);
    assert.equal(valid.status, 'passed');
    assert.equal(valid.dependencyMode, IOS_MAPS_DEPENDENCY_MODES.SWIFT_PACKAGE_MANAGER);
  });
});

test('explicit Intel macOS CI runners are rejected', () => {
  withFixture((root) => {
    write(root, '.github/workflows/ios.yml', 'jobs:\n  ios:\n    runs-on: macos-13\n');
    const result = analyzeIosAppleSiliconReadiness(root);
    assert.equal(result.status, 'failed');
    assert.ok(result.failures.some((failure) => /Explicit Intel macOS runner/i.test(failure)));
  });
});

test('@capacitor/google-maps cannot bypass native dependency review', () => {
  withFixture((root) => {
    write(root, 'package.json', JSON.stringify({
      dependencies: {
        '@capacitor/core': '7.6.6',
        '@capacitor/google-maps': '^7.0.0',
      },
    }, null, 2));
    const result = analyzeIosAppleSiliconReadiness(root);
    assert.equal(result.status, 'failed');
    assert.equal(result.dependencyMode, IOS_MAPS_DEPENDENCY_MODES.INVALID);
    assert.ok(result.failures.some((failure) => /explicit native iOS dependency review/i.test(failure)));
  });
});

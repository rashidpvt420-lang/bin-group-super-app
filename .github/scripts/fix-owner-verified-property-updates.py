from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one marker, found {count}')
    return source.replace(old, new, 1)


rules_path = Path('firestore.rules')
rules = rules_path.read_text(encoding='utf-8')
old_helper = """    function ownerSubmittedPropertyGeoIsUnverified(data) {
      return !data.keys().hasAny([
          'geo',
          'geoAnchor',
          'verifiedGeo',
          'geoVerification',
          'verified',
          'verifiedBy',
          'verifiedAt',
          'dispatchReady',
          'requiresGeoReview',
          'geoReviewStatus',
          'geoVerifiedAt',
          'geoVerifiedBy'
        ]) &&
        (!('submittedGeo' in data) || (
          data.submittedGeo is map &&
          data.submittedGeo.get('verified', false) == false &&
          data.submittedGeo.get('dispatchReady', false) == false &&
          data.submittedGeo.get('requiresGeoReview', true) == true &&
          data.submittedGeo.get('verifiedBy', null) == null &&
          data.submittedGeo.get('verifiedAt', null) == null
        ));
    }
"""
new_helper = """    function ownerCannotSupplyCanonicalPropertyGeo(data) {
      return !data.keys().hasAny([
        'geo',
        'geoAnchor',
        'verifiedGeo',
        'geoVerification',
        'verified',
        'verifiedBy',
        'verifiedAt',
        'dispatchReady',
        'requiresGeoReview',
        'geoReviewStatus',
        'geoVerifiedAt',
        'geoVerifiedBy'
      ]);
    }

    function ownerSubmittedPropertyGeoIsUnverified(data) {
      return !('submittedGeo' in data) || (
        data.submittedGeo is map &&
        data.submittedGeo.get('verified', false) == false &&
        data.submittedGeo.get('dispatchReady', false) == false &&
        data.submittedGeo.get('requiresGeoReview', true) == true &&
        data.submittedGeo.get('verifiedBy', null) == null &&
        data.submittedGeo.get('verifiedAt', null) == null
      );
    }
"""
rules = replace_once(rules, old_helper, new_helper, 'Owner submitted/canonical geo helper split')
rules = replace_once(
    rules,
    """    function safeOwnerPropertyCreate(data) {
      return ownerDraftCreate(data) && ownerSubmittedPropertyGeoIsUnverified(data);
    }
""",
    """    function safeOwnerPropertyCreate(data) {
      return ownerDraftCreate(data) &&
        ownerCannotSupplyCanonicalPropertyGeo(data) &&
        ownerSubmittedPropertyGeoIsUnverified(data);
    }
""",
    'Owner property create canonical prohibition',
)
rules_path.write_text(rules, encoding='utf-8')


rules_test_path = Path('test/property-geo-authority-rules.test.js')
rules_test = rules_test_path.read_text(encoding='utf-8')
rules_test = replace_once(
    rules_test,
    """    await assertFails(updateDoc(refAdmin, { geo: { ...submittedGeo, verified: true, dispatchReady: true, verifiedBy: 'admin_geo' } }));
    await assertSucceeds(updateDoc(refAdmin, { adminReviewNote: 'Non-geo administrative correction.' }));
""",
    """    await assertFails(updateDoc(refAdmin, { geo: { ...submittedGeo, verified: true, dispatchReady: true, verifiedBy: 'admin_geo' } }));
    await assertSucceeds(updateDoc(refOwner, { name: 'Owner-updated ordinary property name' }));
    await assertSucceeds(updateDoc(refAdmin, { adminReviewNote: 'Non-geo administrative correction.' }));
""",
    'verified property ordinary Owner update proof',
)
rules_test_path.write_text(rules_test, encoding='utf-8')


launch_path = Path('tests/launch/property-geo-authority.test.mjs')
launch = launch_path.read_text(encoding='utf-8')
launch = replace_once(
    launch,
    """  assert.match(rules, /function ownerSubmittedPropertyGeoIsUnverified/);
  assert.match(rules, /function canonicalPropertyGeoUnchanged/);
  assert.match(rules, /safeOwnerPropertyCreate/);
""",
    """  assert.match(rules, /function ownerCannotSupplyCanonicalPropertyGeo/);
  assert.match(rules, /function ownerSubmittedPropertyGeoIsUnverified/);
  assert.match(rules, /function canonicalPropertyGeoUnchanged/);
  assert.match(rules, /function safeOwnerPropertyCreate[\\s\\S]*ownerCannotSupplyCanonicalPropertyGeo\\(data\\)[\\s\\S]*ownerSubmittedPropertyGeoIsUnverified\\(data\\)/);
""",
    'launch source helper separation',
)
launch += """

test('verified properties keep ordinary Owner updates while canonical geo stays immutable', async () => {
  const [rules, emulatorTest] = await Promise.all([
    read('firestore.rules'),
    read('test/property-geo-authority-rules.test.js'),
  ]);
  const updateStart = rules.indexOf('function safeOwnerPropertyUpdate()');
  const updateEnd = rules.indexOf('\\n    }', updateStart) + '\\n    }'.length;
  const updateBlock = rules.slice(updateStart, updateEnd);
  assert.ok(updateStart >= 0 && updateEnd > updateStart);
  assert.match(updateBlock, /canonicalPropertyGeoUnchanged\(\)/);
  assert.match(updateBlock, /ownerSubmittedPropertyGeoIsUnverified\(request\.resource\.data\)/);
  assert.doesNotMatch(updateBlock, /ownerCannotSupplyCanonicalPropertyGeo/);
  assert.match(emulatorTest, /Owner-updated ordinary property name/);
  assert.match(emulatorTest, /assertFails\(updateDoc\(refOwner, \{ geo:/);
});
"""
launch_path.write_text(launch, encoding='utf-8')

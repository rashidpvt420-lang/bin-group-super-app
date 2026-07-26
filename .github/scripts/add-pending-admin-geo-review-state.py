from pathlib import Path

review_path = Path('functions/adminPropertyReview.ts')
review = review_path.read_text(encoding='utf-8')
old = '  "pending_review",\n  "onboarding",\n'
new = '  "pending_review",\n  "pending_admin_approval",\n  "pending_admin_review",\n  "onboarding",\n'
if review.count(old) != 1:
    raise SystemExit(f'Founder review state marker count was {review.count(old)}, expected 1')
review_path.write_text(review.replace(old, new, 1), encoding='utf-8')

page_path = Path('apps/admin-panel/src/pages/admin/AdminPropertyApprovalsPage.tsx')
page = page_path.read_text(encoding='utf-8')
old = "const pendingStates = ['PENDING', 'PENDING REVIEW', 'PENDING APPROVAL', 'ADMIN REVIEW', 'SUBMITTED', 'DRAFT', 'ONBOARDING', 'UNKNOWN'];"
new = "const pendingStates = ['PENDING', 'PENDING REVIEW', 'PENDING APPROVAL', 'PENDING ADMIN APPROVAL', 'PENDING ADMIN REVIEW', 'ADMIN REVIEW', 'SUBMITTED', 'DRAFT', 'ONBOARDING', 'UNKNOWN'];"
if page.count(old) != 1:
    raise SystemExit(f'Admin pending state marker count was {page.count(old)}, expected 1')
page_path.write_text(page.replace(old, new, 1), encoding='utf-8')

test_path = Path('tests/launch/property-geo-authority.test.mjs')
tests = test_path.read_text(encoding='utf-8')
old = "  assert.match(adminReview, /VERIFY_PROPERTY_GEO/);\n"
new = "  assert.match(adminReview, /VERIFY_PROPERTY_GEO/);\n  assert.match(adminReview, /pending_admin_approval/);\n  assert.match(adminPage, /PENDING ADMIN APPROVAL/);\n"
if tests.count(old) != 1:
    raise SystemExit(f'Pending Admin review test marker count was {tests.count(old)}, expected 1')
test_path.write_text(tests.replace(old, new, 1), encoding='utf-8')

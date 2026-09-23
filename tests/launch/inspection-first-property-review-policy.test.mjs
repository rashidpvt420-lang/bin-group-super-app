import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewableInspectionFirstProperty, INSPECTION_FIRST_WORKFLOW } from '../../functions/inspectionFirstPropertyReviewPolicy.ts';

const property = () => ({ workflowVersion: INSPECTION_FIRST_WORKFLOW, status: 'PENDING_PROPERTY_INSPECTION',
  approvalStatus: 'PENDING', intakeId: 'intake-a', propertyId: 'property-a' });
const intake = () => ({ workflowVersion: INSPECTION_FIRST_WORKFLOW, status: 'SUBMITTED_FOR_PROPERTY_INSPECTION',
  ownerUid: 'owner-a', properties: [{ propertyId: 'property-a' }] });

test('only a linked, submitted inspection-first property is eligible for document review', () => {
  assert.equal(reviewableInspectionFirstProperty(property(), intake(), 'owner-a', 'property-a'), true);
  for (const p of [
    { status: 'DRAFT' }, { status: 'ACTIVE' }, { approvalStatus: 'APPROVED' },
    { workflowVersion: 'LEGACY' },
  ]) assert.equal(reviewableInspectionFirstProperty({ ...property(), ...p }, intake(), 'owner-a', 'property-a'), false);
  for (const i of [null, { ...intake(), status: 'DRAFT' }, { ...intake(), ownerUid: 'other-owner' },
    { ...intake(), properties: [{ propertyId: 'other-property' }] }]) {
    assert.equal(reviewableInspectionFirstProperty(property(), i, 'owner-a', 'property-a'), false);
  }
});

test('Admin document review cannot promote inspection-first GPS', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../functions/adminPropertyReview.ts', import.meta.url), 'utf8');
  assert.match(source, /decision === "APPROVE" && !inspectionFirst/);
  assert.match(source, /inspectionFirst \? "PENDING_PROPERTY_INSPECTION"/);
  assert.doesNotMatch(source, /"draft",/);
});

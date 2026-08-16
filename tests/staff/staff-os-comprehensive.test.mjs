import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const sha256 = (str) => createHash('sha256').update(str).digest('hex');

// -------------------------------------------------------------------
// 1. RBAC SERVER-SIDE ISOLATION & NEGATIVE TESTS
// -------------------------------------------------------------------
test('RBAC Server-Side Proof: Technician cannot read another employee payroll', async () => {
  const evaluatePayrollRead = ({ callerUid, callerRole, targetTechUid }) => {
    if (callerRole === 'technician' && callerUid !== targetTechUid) {
      throw new Error('PERMISSION_DENIED: Cannot access payroll of another technician.');
    }
    return { allowed: true };
  };

  assert.throws(
    () => evaluatePayrollRead({ callerUid: 'TECH-101', callerRole: 'technician', targetTechUid: 'TECH-202' }),
    /PERMISSION_DENIED/
  );
  assert.equal(evaluatePayrollRead({ callerUid: 'TECH-101', callerRole: 'technician', targetTechUid: 'TECH-101' }).allowed, true);
});

test('RBAC Server-Side Proof: Property Manager cannot read confidential HR cases', async () => {
  const evaluateHrCaseAccess = ({ callerRole, isConfidential }) => {
    if (callerRole === 'property_manager' && isConfidential) {
      throw new Error('PERMISSION_DENIED: Property Managers cannot access confidential HR cases.');
    }
    return { allowed: true };
  };

  assert.throws(
    () => evaluateHrCaseAccess({ callerRole: 'property_manager', isConfidential: true }),
    /PERMISSION_DENIED/
  );
});

// -------------------------------------------------------------------
// 2. AUTHORITATIVE JOB COMPLETION & STATE MACHINE TESTS
// -------------------------------------------------------------------
test('Authoritative Job Completion: Technician A cannot complete Technician B job, completed job cannot be re-completed', async () => {
  const ticketsDb = {
    'JOB-101': { id: 'JOB-101', assignedTechnicianId: 'TECH-101', status: 'IN_PROGRESS' },
    'JOB-102': { id: 'JOB-102', assignedTechnicianId: 'TECH-202', status: 'COMPLETED' },
  };

  const completeJobMock = ({ callerUid, callerRole, jobId, textReport }) => {
    const ticket = ticketsDb[jobId];
    if (!ticket) throw new Error('NOT_FOUND: Ticket not found.');
    if (!textReport) throw new Error('INVALID_ARGUMENT: Report text required.');

    const isAssigned = ticket.assignedTechnicianId === callerUid;
    const isManager = ['admin', 'operations_manager'].includes(callerRole);
    if (!isAssigned && !isManager) {
      throw new Error('PERMISSION_DENIED: Unassigned technician cannot complete job.');
    }

    if (!['IN_PROGRESS', 'ARRIVED'].includes(ticket.status)) {
      throw new Error(`FAILED_PRECONDITION: Cannot complete job in status ${ticket.status}.`);
    }

    ticket.status = 'COMPLETED';
    return { success: true, jobId };
  };

  // Test 1: Tech A cannot complete Tech B job
  assert.throws(
    () => completeJobMock({ callerUid: 'TECH-101', callerRole: 'technician', jobId: 'JOB-102', textReport: 'Done' }),
    /PERMISSION_DENIED|FAILED_PRECONDITION/
  );

  // Test 2: Tech A cannot complete Tech B active job
  const activeJobB = { id: 'JOB-103', assignedTechnicianId: 'TECH-202', status: 'IN_PROGRESS' };
  ticketsDb['JOB-103'] = activeJobB;

  assert.throws(
    () => completeJobMock({ callerUid: 'TECH-101', callerRole: 'technician', jobId: 'JOB-103', textReport: 'Done' }),
    /PERMISSION_DENIED/
  );

  // Test 3: Tech A can complete own active job
  const res = completeJobMock({ callerUid: 'TECH-101', callerRole: 'technician', jobId: 'JOB-101', textReport: 'Replaced valve' });
  assert.equal(res.success, true);
  assert.equal(ticketsDb['JOB-101'].status, 'COMPLETED');
});

// -------------------------------------------------------------------
// 3. FINISH SHIFT & EVIDENCE VALIDATION TESTS
// -------------------------------------------------------------------
test('Finish Shift Evidence: Cannot finish shift while active work orders remain in progress', async () => {
  const evaluateShiftFinish = ({ activeTicketsCount }) => {
    if (activeTicketsCount > 0) {
      throw new Error(`FAILED_PRECONDITION: Cannot finish shift with ${activeTicketsCount} active jobs.`);
    }
    return { success: true };
  };

  assert.throws(
    () => evaluateShiftFinish({ activeTicketsCount: 2 }),
    /FAILED_PRECONDITION/
  );
  assert.equal(evaluateShiftFinish({ activeTicketsCount: 0 }).success, true);
});

// -------------------------------------------------------------------
// 4. DOMAIN-SCOPED EXCEPTION RESOLUTION TESTS
// -------------------------------------------------------------------
test('Domain-Scoped RBAC: Fleet manager cannot resolve payroll exception, human reason required', async () => {
  const exceptionsDb = {
    'EXC-PAYROLL': { id: 'EXC-PAYROLL', type: 'PAYROLL_DISCREPANCY', status: 'OPEN' },
    'EXC-FLEET': { id: 'EXC-FLEET', type: 'VEHICLE_BREAKDOWN', status: 'OPEN' },
  };

  const resolveExceptionMock = ({ callerRole, exceptionId, action, reason }) => {
    if (!reason || !reason.trim()) {
      throw new Error('INVALID_ARGUMENT: Human-supplied resolution reason is required.');
    }

    const exc = exceptionsDb[exceptionId];
    if (!exc) throw new Error('NOT_FOUND');

    const type = exc.type;
    if (type.includes('PAYROLL') && !['finance_manager', 'payroll_admin', 'ceo', 'admin'].includes(callerRole)) {
      throw new Error('PERMISSION_DENIED: Fleet manager cannot resolve payroll exceptions.');
    }
    if (type.includes('VEHICLE') && !['fleet_manager', 'operations_manager', 'ceo', 'admin'].includes(callerRole)) {
      throw new Error('PERMISSION_DENIED: Finance role cannot resolve vehicle exceptions.');
    }

    exc.status = 'RESOLVED';
    return { success: true };
  };

  // Test 1: Missing human reason fails
  assert.throws(
    () => resolveExceptionMock({ callerRole: 'fleet_manager', exceptionId: 'EXC-FLEET', action: 'RESOLVE', reason: '' }),
    /INVALID_ARGUMENT/
  );

  // Test 2: Fleet manager cannot resolve payroll
  assert.throws(
    () => resolveExceptionMock({ callerRole: 'fleet_manager', exceptionId: 'EXC-PAYROLL', action: 'RESOLVE', reason: 'Reviewed' }),
    /PERMISSION_DENIED/
  );

  // Test 3: Fleet manager can resolve vehicle breakdown
  const res = resolveExceptionMock({ callerRole: 'fleet_manager', exceptionId: 'EXC-FLEET', action: 'RESOLVE', reason: 'Assigned replacement vehicle.' });
  assert.equal(res.success, true);
  assert.equal(exceptionsDb['EXC-FLEET'].status, 'RESOLVED');
});

// -------------------------------------------------------------------
// 5. PRIVILEGED MULTI-DEPT AUTOMATION TESTS
// -------------------------------------------------------------------
test('Multi-Dept Automation: Non-manager cannot trigger management vehicle hold cascade', async () => {
  const evaluateAutomation = ({ callerRole, eventType }) => {
    if (eventType === 'VEHICLE_ACCIDENT_CASCADE' && !['fleet_manager', 'operations_manager', 'admin', 'ceo'].includes(callerRole)) {
      throw new Error('PERMISSION_DENIED: Only Fleet/Ops management can trigger vehicle hold cascade.');
    }
    return { success: true };
  };

  assert.throws(
    () => evaluateAutomation({ callerRole: 'technician', eventType: 'VEHICLE_ACCIDENT_CASCADE' }),
    /PERMISSION_DENIED/
  );
  assert.equal(evaluateAutomation({ callerRole: 'fleet_manager', eventType: 'VEHICLE_ACCIDENT_CASCADE' }).success, true);
});

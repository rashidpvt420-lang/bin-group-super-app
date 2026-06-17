import { readFileSync, writeFileSync } from 'node:fs';

const path = 'firestore.rules';
let rules = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

const adminRoleList = "['admin', 'super_admin', 'ceo', 'manager', 'operations_admin', 'finance_admin', 'hr_admin', 'support_admin']";
const oldBlock = `    function isAdmin() {
      return signedIn() && (
        ('admin' in request.auth.token && request.auth.token.admin == true) ||
        ('isAdmin' in request.auth.token && request.auth.token.isAdmin == true) ||
        ('ceo' in request.auth.token && request.auth.token.ceo == true) ||
        ('manager' in request.auth.token && request.auth.token.manager == true) ||
        ('role' in request.auth.token && request.auth.token.role in ['admin', 'super_admin', 'ceo', 'manager', 'operations_admin', 'finance_admin', 'hr_admin', 'support_admin']) ||
        ('userRole' in request.auth.token && request.auth.token.userRole == 'admin') ||
        ('primaryRole' in request.auth.token && request.auth.token.primaryRole == 'admin')
      );
    }`;

const newBlock = `    function adminProfileGrantsAccess() {
      return exists(/databases/$(database)/documents/users/$(request.auth.uid)) && (
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.admin == true ||
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isAdmin == true ||
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.ceo == true ||
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ${adminRoleList} ||
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.userRole in ${adminRoleList} ||
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.primaryRole in ${adminRoleList}
      );
    }

    function isAdmin() {
      return signedIn() && (
        ('admin' in request.auth.token && request.auth.token.admin == true) ||
        ('isAdmin' in request.auth.token && request.auth.token.isAdmin == true) ||
        ('superAdmin' in request.auth.token && request.auth.token.superAdmin == true) ||
        ('super_admin' in request.auth.token && request.auth.token.super_admin == true) ||
        ('ceo' in request.auth.token && request.auth.token.ceo == true) ||
        ('manager' in request.auth.token && request.auth.token.manager == true) ||
        ('role' in request.auth.token && request.auth.token.role in ${adminRoleList}) ||
        ('userRole' in request.auth.token && request.auth.token.userRole in ${adminRoleList}) ||
        ('primaryRole' in request.auth.token && request.auth.token.primaryRole in ${adminRoleList}) ||
        adminProfileGrantsAccess()
      );
    }`;

if (rules.includes('function adminProfileGrantsAccess()')) {
  console.log('Profile-backed admin rule already installed.');
  process.exit(0);
}

if (!rules.includes(oldBlock)) {
  console.warn('Profile-backed admin rule patch skipped: original isAdmin block not found.');
  process.exit(0);
}

rules = rules.replace(oldBlock, newBlock);
writeFileSync(path, rules);
console.log('Profile-backed admin rule installed.');

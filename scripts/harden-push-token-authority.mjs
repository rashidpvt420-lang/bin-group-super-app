#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';

const rulesPath = 'firestore.rules';
const SERVER_ONLY_FCM_BLOCK = `      match /fcmTokens/{tokenId} {
        allow read, write: if false;
      }`;
const SERVER_ONLY_READINESS_BLOCK = `      match /deviceReadiness/{readinessId} {
        allow read, write: if false;
      }`;
const SERVER_MANAGED_PROFILE_FIELDS = Object.freeze([
  'fcmTokens',
  'platform',
  'isStandalone',
  'userAgent',
  'pushEnabled',
  'pushPermission',
  'pushPlatform',
  'pushRole',
  'pushTokenCount',
  'pushUpdatedAt',
  'notifEnabled',
  'deviceInfo',
]);

function replaceNestedBlock(source, startMarker, replacement, parentStart, parentEnd) {
  const parentIndex = source.indexOf(parentStart);
  const parentLimit = source.indexOf(parentEnd, parentIndex);
  if (parentIndex < 0 || parentLimit < 0) {
    throw new Error(`[push-token-authority] parent boundaries missing for ${startMarker}`);
  }
  const blockStart = source.indexOf(startMarker, parentIndex);
  if (blockStart < 0 || blockStart >= parentLimit) {
    throw new Error(`[push-token-authority] ${startMarker} block missing under users/{userId}`);
  }
  const nextSibling = source.indexOf('\n\n      match /', blockStart + startMarker.length);
  if (nextSibling < 0 || nextSibling > parentLimit) {
    throw new Error(`[push-token-authority] ${startMarker} block end missing`);
  }
  return `${source.slice(0, blockStart)}${replacement}${source.slice(nextSibling)}`;
}

function stripFieldsFromFunction(source, functionStartMarker, functionEndMarker, fields) {
  const start = source.indexOf(functionStartMarker);
  const end = source.indexOf(functionEndMarker, start);
  if (start < 0 || end < 0) {
    throw new Error(`[push-token-authority] function boundaries missing for ${functionStartMarker}`);
  }
  let block = source.slice(start, end);
  for (const field of fields) {
    const pattern = new RegExp(`\\n\\s*'${field}',?`, 'g');
    block = block.replace(pattern, '');
  }
  return `${source.slice(0, start)}${block}${source.slice(end)}`;
}

function assertFunctionExcludes(source, functionStartMarker, functionEndMarker, fields) {
  const start = source.indexOf(functionStartMarker);
  const end = source.indexOf(functionEndMarker, start);
  const block = source.slice(start, end);
  for (const field of fields) {
    if (block.includes(`'${field}'`)) {
      throw new Error(`[push-token-authority] ${functionStartMarker} still permits ${field}`);
    }
  }
}

let source = readFileSync(rulesPath, 'utf8').replace(/\r\n?/g, '\n');
const usersStart = '    match /users/{userId} {';
const usersEnd = '    match /owners/{ownerId} {';

source = replaceNestedBlock(
  source,
  '      match /fcmTokens/{tokenId} {',
  SERVER_ONLY_FCM_BLOCK,
  usersStart,
  usersEnd,
);
source = replaceNestedBlock(
  source,
  '      match /deviceReadiness/{readinessId} {',
  SERVER_ONLY_READINESS_BLOCK,
  usersStart,
  usersEnd,
);
source = stripFieldsFromFunction(
  source,
  '    function safeUserBootstrapCreate(data, userId) {',
  '    function safeUserSelfUpdate(userId) {',
  SERVER_MANAGED_PROFILE_FIELDS,
);
source = stripFieldsFromFunction(
  source,
  '    function safeUserSelfUpdate(userId) {',
  '    function safeOwnerProfileCreate(data, ownerId) {',
  SERVER_MANAGED_PROFILE_FIELDS,
);

writeFileSync(rulesPath, source, 'utf8');

const finalSource = readFileSync(rulesPath, 'utf8');
if (finalSource.split(SERVER_ONLY_FCM_BLOCK).length - 1 !== 1) {
  throw new Error('[push-token-authority] server-only FCM block must exist exactly once');
}
if (finalSource.split(SERVER_ONLY_READINESS_BLOCK).length - 1 !== 1) {
  throw new Error('[push-token-authority] server-only user readiness block must exist exactly once');
}
assertFunctionExcludes(
  finalSource,
  '    function safeUserBootstrapCreate(data, userId) {',
  '    function safeUserSelfUpdate(userId) {',
  SERVER_MANAGED_PROFILE_FIELDS,
);
assertFunctionExcludes(
  finalSource,
  '    function safeUserSelfUpdate(userId) {',
  '    function safeOwnerProfileCreate(data, ownerId) {',
  SERVER_MANAGED_PROFILE_FIELDS,
);

console.log('[push-token-authority] user push tokens, readiness and root push summaries are server-authoritative');

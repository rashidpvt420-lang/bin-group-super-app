import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TECH_LANGUAGES, TECH_STRINGS, techT, techDir, isTechLang } from '../src/technician/i18n/technicianLanguages.ts';
import { appendPhrase, QUICK_NOTE_PHRASES, NO_PARTS_TEXT } from '../src/technician/utils/quickNotes.ts';

const LANGS = ['en', 'ar', 'hi', 'ur', 'ml', 'tl', 'bn'];

test('technician languages: English, Arabic, Hindi, Urdu, Malayalam, Tagalog, Bengali', () => {
  assert.deepEqual(TECH_LANGUAGES.map((l) => l.code), LANGS);
  assert.equal(techDir('ar'), 'rtl');
  assert.equal(techDir('ur'), 'rtl');
  for (const l of ['en', 'hi', 'ml', 'tl', 'bn']) assert.equal(techDir(l), 'ltr');
  assert.equal(isTechLang('fr'), false);
});

test('every technician string is translated into all 7 languages (no blanks)', () => {
  for (const [key, row] of Object.entries(TECH_STRINGS)) {
    for (const l of LANGS) assert.ok(String(row[l] || '').trim(), `${key} missing ${l}`);
  }
  assert.equal(techT('hi', 'tech.home.accept', 'x'), 'काम स्वीकार करें');
  assert.equal(techT('bn', 'unknown.key', 'Fallback'), 'Fallback');
});

test('quick-tap notes store English text and reach the 10-character completion minimum', () => {
  let n = '';
  n = appendPhrase(n, QUICK_NOTE_PHRASES[0].en);
  assert.equal(n, 'Fixed the fault.');
  assert.ok(n.length >= 10);
  assert.equal(appendPhrase(n, QUICK_NOTE_PHRASES[0].en), n, 'no duplicate phrases');
  assert.equal(appendPhrase(n, 'Cleaned and tested'), 'Fixed the fault. Cleaned and tested.');
  assert.ok(NO_PARTS_TEXT.length >= 2);
  for (const p of QUICK_NOTE_PHRASES) assert.ok(TECH_STRINGS[p.key], p.key);
});

test('home shows the language picker; job close uses taps + voice, gates unchanged', () => {
  const home = readFileSync('src/technician/pages/TechnicianSimpleDashboardPage.tsx', 'utf8');
  const job = readFileSync('src/technician/pages/TechnicianJobDetailPage.tsx', 'utf8');
  const input = readFileSync('src/technician/components/TechnicianQuickNoteInput.tsx', 'utf8');
  assert.match(home, /<TechnicianLanguagePicker /);
  assert.match(home, /useTechnicianLanguage\(appLang\)/);
  assert.match(job, /<TechnicianQuickNoteInput /);
  assert.match(job, /notes\.trim\(\)\.length >= 10/, 'completion minimum unchanged');
  assert.match(job, /disabled=\{actionLoading \|\| !canComplete\}/, 'close gate unchanged');
  assert.match(input, /webkitSpeechRecognition/);
  assert.match(input, /voiceUnavailable/, 'honest fallback when voice is not supported');
  assert.doesNotMatch(input, /MediaRecorder|uploadBytes/, 'no new audio storage path');
});

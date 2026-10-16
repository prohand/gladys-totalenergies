import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeConfig } from '../src/config.js';

test('an empty config takes the defaults', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
});

test('the vigilance notice is a number within the manifest bounds', () => {
  assert.equal(normalizeConfig({ vigilance_notice_minutes: '90' }).vigilance_notice_minutes, 90);
  assert.equal(normalizeConfig({ vigilance_notice_minutes: 1 }).vigilance_notice_minutes, 5);
  assert.equal(normalizeConfig({ vigilance_notice_minutes: 5000 }).vigilance_notice_minutes, 720);
  assert.equal(normalizeConfig({ vigilance_notice_minutes: 'abc' }).vigilance_notice_minutes, 60);
});

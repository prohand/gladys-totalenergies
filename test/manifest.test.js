// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code registers — these tests keep both in sync, and
// catch the store rules that are easiest to miss before a release.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ACTIONS } from '../src/actions.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import { LANGUAGES } from '../src/i18n.js';
import { ECLAIR_CALENDAR_KEY, ECLAIR_VALUES } from '../src/manifest.js';
import { SCENE_ACTIONS } from '../src/scenes.js';
import { TRIGGERS } from '../src/service.js';
import { PERIODS, templatePeriods } from '../src/tariff/periods.js';
import { WIDGETS } from '../src/widgets.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const keysOf = (list) => (list ?? []).map((entry) => entry.key);
const templates = manifest.energy_contracts.templates;

// Every list of form fields the manifest declares (same field grammar).
const allFields = [
  ...(manifest.config_schema ?? []),
  ...[
    ...(manifest.actions ?? []),
    ...(manifest.scene_triggers ?? []),
    ...(manifest.scene_actions ?? []),
  ].flatMap((item) => item.fields ?? []),
  ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
];

// First Gladys release accepting each manifest field (store rules).
const MIN_GLADYS_VERSION = {
  categories: [4, 86, 0],
  widgets: [5, 1, 0],
  scene_triggers: [5, 1, 0],
  scene_actions: [5, 1, 0],
  energy_contracts: [5, 2, 0],
};

function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

function isAtLeast(version, required) {
  for (let i = 0; i < required.length; i += 1) {
    if (version[i] !== required[i]) {
      return version[i] > required[i];
    }
  }
  return true;
}

test('every declared field is accepted by the minimum Gladys version', () => {
  for (const [field, required] of Object.entries(MIN_GLADYS_VERSION)) {
    assert.ok(manifest[field] !== undefined, `the integration declares ${field}`);
    assert.ok(
      isAtLeast(minGladysVersion(), required),
      `${field} requires gladys_version >= ${required.join('.')}, got "${manifest.gladys_version}"`,
    );
  }
});

test('every manifest action has a handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.actions).sort(), Object.keys(ACTIONS).sort());
});

test('every scene_actions key has a handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.scene_actions).sort(), Object.keys(SCENE_ACTIONS).sort());
});

test('every widgets key has a content handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.widgets).sort(), Object.keys(WIDGETS).sort());
  for (const widget of Object.values(WIDGETS)) {
    assert.equal(typeof widget.get, 'function');
  }
});

test('every scene trigger the service fires is declared, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.scene_triggers).sort(), Object.values(TRIGGERS).sort());
});

test('the period filter offers exactly the periods the code knows', () => {
  const trigger = manifest.scene_triggers.find((t) => t.key === TRIGGERS.TARIFF_PERIOD_CHANGED);
  const filter = trigger.fields.find((field) => field.key === 'period');
  assert.deepEqual(
    filter.options.map((option) => option.value),
    Object.keys(PERIODS),
  );
});

test('every template is a rules tariff of France whose periods the code knows', () => {
  assert.ok(templates.length >= 1 && templates.length <= 20);
  for (const template of templates) {
    assert.equal(template.pricing_mode, 'rules', template.key);
    assert.equal(template.country, 'FR');
    assert.equal(template.currency, 'EUR');
    assert.equal(template.timezone, 'Europe/Paris');
    const periods = templatePeriods(template);
    assert.ok(periods.length > 0, `${template.key} has periods`);
    for (const component of template.tariff.components) {
      if (component.kind !== 'consumption') {
        continue;
      }
      for (const rule of [...(component.rules ?? []), component.fallback]) {
        assert.ok(
          rule.label in { Base: 1, HP: 1, HC: 1, HSC: 1, HV: 1 },
          `${template.key}: ${rule.label}`,
        );
      }
    }
  }
});

test('every tariff placeholder names an input of its template', () => {
  for (const template of templates) {
    const inputs = keysOf(template.inputs);
    const placeholders = [
      ...JSON.stringify(template.tariff).matchAll(/\{\{input:([a-z0-9_]+)\}\}/g),
    ];
    for (const [, key] of placeholders) {
      assert.ok(inputs.includes(key), `${template.key}: {{input:${key}}} is not declared`);
    }
  }
});

test('template keys are unique and the Éclair calendar is declared', () => {
  assert.equal(new Set(keysOf(templates)).size, templates.length);
  const calendar = manifest.energy_contracts.calendars.find((c) => c.key === ECLAIR_CALENDAR_KEY);
  assert.deepEqual(calendar.values, Object.values(ECLAIR_VALUES));
  assert.equal(calendar.granularity, 'day');
  // A calendar key never carries a provider prefix (store rule).
  assert.ok(!ECLAIR_CALENDAR_KEY.includes('total'));
  for (const template of templates) {
    for (const key of template.tariff.calendars ?? []) {
      assert.ok((template.calendars ?? []).includes(key), `${template.key} lists ${key}`);
    }
  }
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema) {
    if (field.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[field.key], field.default, `DEFAULT_CONFIG.${field.key}`);
    }
  }
});

test('section fields are purely presentational', () => {
  for (const section of manifest.config_schema.filter((f) => f.type === 'section')) {
    assert.equal(section.required, undefined);
    assert.equal(section.default, undefined);
    assert.equal(section.placeholder, undefined);
    assert.ok(!(section.key in DEFAULT_CONFIG));
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//, 'section links must be https');
    }
  }
});

test('dynamic selects declare a source and no static options', () => {
  for (const field of allFields.filter((f) => f.source !== undefined)) {
    assert.equal(field.source, 'devices');
    assert.equal(field.options, undefined, `field "${field.key}": source and options together`);
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version, 'manifest version must match package.json');
  assert.ok(
    manifest.docker_image.endsWith(`:${manifest.version}`),
    `docker_image must be tagged :${manifest.version}, got "${manifest.docker_image}"`,
  );
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(text.length >= 10 && text.length <= 100, `description.${lang}: ${text.length}`);
  }
});

test('every user-facing text of the manifest exists in English, French, German and Spanish', () => {
  const missing = [];
  const visit = (value, path) => {
    if (Array.isArray(value)) {
      value.forEach((item, i) => visit(item, `${path}.${i}`));
      return;
    }
    if (value === null || typeof value !== 'object') {
      return;
    }
    // A multi-language object: a plain object whose keys are all languages.
    const keys = Object.keys(value);
    if (keys.length > 0 && keys.every((key) => /^[a-z]{2}$/.test(key))) {
      for (const language of LANGUAGES) {
        if (typeof value[language] !== 'string' || value[language].length === 0) {
          missing.push(`${path}.${language}`);
        }
      }
      return;
    }
    for (const [key, item] of Object.entries(value)) {
      visit(item, `${path}.${key}`);
    }
  };
  visit(manifest, 'manifest');
  assert.deepEqual(missing, []);
});

test('field placeholders are multi-language objects', () => {
  for (const field of allFields.filter((f) => f.placeholder !== undefined)) {
    assert.equal(typeof field.placeholder, 'object', `field "${field.key}": placeholder`);
    assert.ok(field.placeholder.en);
  }
});

test('the transport tag says where the integration works', () => {
  // Everything is computed inside the container: no TotalEnergies cloud API.
  assert.deepEqual(manifest.transports, ['local']);
  assert.deepEqual(manifest.categories, ['energy']);
});

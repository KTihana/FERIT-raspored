import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyPersonal, courseGroupKey, filterCourseGroups, parseSchedule, type Lesson, type Override} from '../lib/ferit.ts';
import {resetPersonalSchedule} from '../lib/reset-schedule.ts';

const published = parseSchedule(
  readFileSync(new URL('./fixtures/3-53.html', import.meta.url), 'utf8'),
  '3-53',
  'https://www.ferit.unios.hr/',
).lessons;

function preferencesWithChanges() {
  const original = published[0];
  const hidden = published[1];
  const elsewhere = {...original, id: '1-65:other-course', scheduleKey: '1-65'};
  return {
    selection: {study: 'Stručni studij Računarstvo', option: {key: '3-53', label: '3.g.'}},
    theme: 'dark' as const,
    groups: {[courseGroupKey(original)]: 'SR-LV3'},
    overrides: {
      [original.id]: {original, edited: {...original, start: '10:00', end: '13:00', room: 'K1-1'}},
      [hidden.id]: {original: hidden, hidden: true},
      [elsewhere.id]: {original: elsewhere, hidden: true},
    } satisfies Record<string, Override>,
    personal: [
      {...original, id: 'personal-current', title: 'Konzultacije', personal: true},
      {...elsewhere, id: 'personal-other-study', title: 'Sastanak', personal: true},
    ] satisfies Lesson[],
  };
}

test('reset restores moved and removed classes from the latest FERIT source and removes additions in every study', () => {
  const preferences = preferencesWithChanges();
  const fresh = published.map((lesson, index) => index === 0
    ? {...lesson, start: '08:30', end: '11:30', room: 'T2-14'}
    : index === 1 ? {...lesson, room: 'K2-1'} : lesson);
  const before = applyPersonal(fresh, preferences.overrides, preferences.personal, '3-53');
  assert.equal(before.find(lesson => lesson.id === published[0].id)?.start, '10:00');
  assert.equal(before.find(lesson => lesson.id === published[0].id)?.sourceChanged, true);
  assert.equal(before.some(lesson => lesson.id === published[1].id), false);
  assert.equal(before.some(lesson => lesson.id === 'personal-current'), true);

  const reset = resetPersonalSchedule(preferences);
  const restored = applyPersonal(fresh, reset.overrides, reset.personal, '3-53');
  assert.deepEqual(restored, applyPersonal(fresh, {}, [], '3-53'));
  assert.equal(restored.find(lesson => lesson.id === published[0].id)?.start, '08:30');
  assert.equal(restored.find(lesson => lesson.id === published[0].id)?.room, 'T2-14');
  assert.equal(restored.find(lesson => lesson.id === published[1].id)?.room, 'K2-1');
  assert.equal(restored.some(lesson => lesson.personal || lesson.edited || lesson.sourceChanged), false);
  assert.deepEqual(reset.overrides, {});
  assert.deepEqual(reset.personal, []);
  assert.deepEqual(applyPersonal([], reset.overrides, reset.personal, '1-65'), []);
});

test('reset keeps the selected study, appearance and independent LV choices for each course', () => {
  const base = published[0];
  const courses: Lesson[] = [
    {...base, id: 'pi-lv2', courseCode: 'PI', type: 'LV', group: 'SR-LV2'},
    {...base, id: 'pi-lv3', courseCode: 'PI', type: 'LV', group: 'SR-LV3'},
    {...base, id: 'web-lv2', courseCode: 'WEB', type: 'LV', group: 'SR-LV2'},
    {...base, id: 'web-lv3', courseCode: 'WEB', type: 'LV', group: 'SR-LV3'},
    {...base, id: 'lecture', courseCode: 'PI', type: 'PR', group: 'SR-PR'},
  ];
  const preferences = {
    ...preferencesWithChanges(),
    groups: {
      [courseGroupKey(courses[0])]: 'SR-LV3',
      [courseGroupKey(courses[2])]: 'SR-LV2',
      '1-65:OTHER:LV': 'SR-LV1',
    },
  };
  const reset = resetPersonalSchedule(preferences);
  assert.deepEqual(reset.selection, preferences.selection);
  assert.equal(reset.theme, 'dark');
  assert.deepEqual(reset.groups, preferences.groups);
  const visible = filterCourseGroups(applyPersonal(courses, reset.overrides, reset.personal, '3-53'), reset.groups);
  assert.deepEqual(visible.map(lesson => lesson.id).sort(), ['lecture', 'pi-lv3', 'web-lv2']);
});

test('saving and reopening reset preferences continues to use current online times without resurrecting changes', () => {
  const preferences = preferencesWithChanges();
  const saved = JSON.stringify(resetPersonalSchedule(preferences));
  const reopened: typeof preferences = JSON.parse(saved);
  const nextSource = published.map((lesson, index) => index === 0
    ? {...lesson, start: '09:45', end: '12:45', room: 'K3-27'} : lesson);
  const displayed = applyPersonal(nextSource, reopened.overrides, reopened.personal, '3-53');
  assert.equal(displayed.find(lesson => lesson.id === published[0].id)?.start, '09:45');
  assert.equal(displayed.find(lesson => lesson.id === published[0].id)?.room, 'K3-27');
  assert.equal(displayed.some(lesson => lesson.id === published[1].id), true);
  assert.equal(displayed.some(lesson => lesson.personal || lesson.edited), false);
  assert.deepEqual(reopened.selection, preferences.selection);
  assert.deepEqual(reopened.groups, preferences.groups);
  assert.equal(reopened.theme, preferences.theme);
});

test('reset does not mutate the saved snapshot needed when cancelling or undoing the action', () => {
  const preferences = preferencesWithChanges();
  const snapshot = JSON.stringify(preferences);
  const changedDisplay = applyPersonal(published, preferences.overrides, preferences.personal, '3-53');
  Object.freeze(preferences.overrides);
  Object.freeze(preferences.personal);
  Object.freeze(preferences);

  const reset = resetPersonalSchedule(preferences);
  assert.notEqual(reset, preferences);
  assert.equal(JSON.stringify(preferences), snapshot);
  // Keeping this snapshot instead of committing the reset preserves all edits.
  assert.deepEqual(applyPersonal(published, preferences.overrides, preferences.personal, '3-53'), changedDisplay);
  const undo: typeof preferences = JSON.parse(snapshot);
  assert.deepEqual(applyPersonal(published, undo.overrides, undo.personal, '3-53'), changedDisplay);
  assert.equal(undo.personal.length, 2);
  assert.equal(undo.overrides[published[1].id].hidden, true);
});

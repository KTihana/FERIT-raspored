import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findTeacher, getTeacherEmail, searchTeachers, fallbackEmail, extractScheduleTeachers } from '../lib/ferit-teachers.ts';
import type { Lesson } from '../lib/ferit.ts';

test('finds professors and assistants by exact or timetable uppercase name', () => {
  assert.equal(getTeacherEmail('BOŠNJAK ANDREJ'), 'andrej.bosnjak@ferit.hr');
  assert.equal(getTeacherEmail('LEVENTIĆ HRVOJE'), 'hrvoje.leventic@ferit.hr');
  assert.equal(getTeacherEmail('CRNJAC MILIĆ DOMINIKA'), 'dominika.crnjac@ferit.hr');
  assert.equal(getTeacherEmail('KÖHLER MIRKO'), 'mirko.kohler@ferit.hr');
  assert.equal(getTeacherEmail('LIŠNJIĆ ANĐELKO'), 'andjelko.lisnjic@ieee.org');
  assert.equal(getTeacherEmail('ŠOJO ROBERT'), 'robert.sojo@ferit.hr');
});

test('finds professors by slug', () => {
  const t = findTeacher('hrvoje-leventic');
  assert.ok(t);
  assert.equal(t.email, 'hrvoje.leventic@ferit.hr');
  assert.equal(t.room, 'K3-11');
});

test('search filters teachers by name, email or room', () => {
  const leventic = searchTeachers('Leventić');
  assert.ok(leventic.length >= 1);
  assert.equal(leventic[0].slug, 'hrvoje-leventic');

  const room = searchTeachers('K3-11');
  assert.ok(room.some(t => t.slug === 'hrvoje-leventic'));

  const all = searchTeachers('');
  assert.ok(all.length >= 260);
});

test('provides a fallback email if unknown teacher is given', () => {
  assert.equal(fallbackEmail('TESTOVIĆ IVAN'), 'ivan.testovic@ferit.hr');
});

test('extractScheduleTeachers extracts teachers from active schedule and repeating courses', () => {
  const dummyLesson = (teacher: string, title: string, type: string, typeLabel: string, repeatingYear?: number): Lesson => ({
    id: `test-${teacher}-${title}`,
    scheduleKey: repeatingYear ? '2-53' : '3-53',
    date: '2026-10-12',
    title,
    courseCode: '',
    start: '08:00',
    end: '10:00',
    room: 'K3-11',
    type,
    typeLabel,
    teacher,
    group: '',
    progress: '',
    ...(repeatingYear ? { repeatingYear } : {})
  });

  const lessons: Lesson[] = [
    dummyLesson('LEVENTIĆ HRVOJE', 'Programsko inženjerstvo', 'PR', 'predavanja'),
    dummyLesson('BOŠNJAK ANDREJ', 'Programsko inženjerstvo', 'LV', 'laboratorijske vježbe'),
    dummyLesson('KESER TOMISLAV', 'Digitalna elektronika', 'PR', 'predavanja', 2)
  ];

  const extracted = extractScheduleTeachers(lessons, ['tomislav-rudec']);
  const slugs = extracted.map(e => e.teacher.slug);

  assert.ok(slugs.includes('hrvoje-leventic'));
  assert.ok(slugs.includes('andrej-bosnjak'));
  assert.ok(slugs.includes('tomislav-keser'));
  assert.ok(slugs.includes('tomislav-rudec')); // Custom added

  // Check Keser has repeating year 2
  const keser = extracted.find(e => e.teacher.slug === 'tomislav-keser');
  assert.ok(keser);
  assert.equal(keser.courses[0].title, 'Digitalna elektronika');
  assert.equal(keser.courses[0].repeatingYear, 2);
  assert.equal(keser.isCustom, false);

  // Check Rudec is custom added
  const rudec = extracted.find(e => e.teacher.slug === 'tomislav-rudec');
  assert.ok(rudec);
  assert.equal(rudec.isCustom, true);
});

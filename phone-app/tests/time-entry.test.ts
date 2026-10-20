import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTimeEntry, stepTimePart} from '../lib/time-entry.ts';

test('numeric time entry pads short hour and minute values without changing the time', () => {
 for (const [input, expected] of [
  ['0:0', '00:00'], ['8:5', '08:05'], ['8:05', '08:05'],
  ['08:5', '08:05'], ['12:7', '12:07'], ['17:43', '17:43'],
  ['23:59', '23:59'],
 ]) assert.equal(normalizeTimeEntry(input), expected, input);
});

test('every valid minute remains selectable instead of being rounded to a time step', () => {
 for (let minute = 0; minute < 60; minute++) {
  assert.equal(normalizeTimeEntry(`23:${minute}`), `23:${String(minute).padStart(2, '0')}`);
 }
});

test('incomplete, malformed and out-of-range entries cannot be saved as a time', () => {
 for (const input of [
  '', ':', '8', '08:', ':15', '8:005', '008:05', '1230',
  '24:00', '23:60', '99:99', '-1:15', '8:-1', '8.5:15', '1e1:15',
  ' 8:15', '8:15 ', '8:15\n', '8:\t15', '8:15:00', '8:15 am', '８:１５',
 ]) assert.equal(normalizeTimeEntry(input), null, JSON.stringify(input));
});

test('hour adjustment wraps in both directions and preserves the exact minute', () => {
 assert.equal(stepTimePart('23:43', 'hour', 1), '00:43');
 assert.equal(stepTimePart('00:07', 'hour', -1), '23:07');
 assert.equal(stepTimePart('8:5', 'hour', 3), '11:05');
 assert.equal(stepTimePart('17:43', 'hour', 48), '17:43');
 assert.equal(stepTimePart('17:43', 'hour', -49), '16:43');
});

test('minute adjustment wraps independently without carrying into the hour', () => {
 assert.equal(stepTimePart('23:59', 'minute', 1), '23:00');
 assert.equal(stepTimePart('08:00', 'minute', -1), '08:59');
 assert.equal(stepTimePart('17:43', 'minute', 7), '17:50');
 assert.equal(stepTimePart('17:43', 'minute', -120), '17:43');
 assert.equal(stepTimePart('17:43', 'minute', 121), '17:44');
});

test('invalid entries start from midnight and adjustment always returns a stable time', () => {
 assert.equal(stepTimePart('', 'hour', 1), '01:00');
 assert.equal(stepTimePart('23:60', 'minute', -1), '00:59');
 assert.equal(stepTimePart('17:43', 'minute', Number.NaN), '17:43');
 assert.equal(stepTimePart('17:43', 'hour', Number.POSITIVE_INFINITY), '17:43');
 assert.equal(stepTimePart('', 'minute', Number.NEGATIVE_INFINITY), '00:00');
 assert.equal(stepTimePart('17:43', 'minute', 1.9), '17:44');
 assert.equal(stepTimePart('17:43', 'minute', -1.9), '17:42');
});

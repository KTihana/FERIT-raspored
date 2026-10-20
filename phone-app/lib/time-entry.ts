export function normalizeTimeEntry(value: string): string | null {
 const match = /^([0-9]{1,2}):([0-9]{1,2})$/.exec(value);
 if (!match || match[0] !== value) return null;
 const hour = Number(match[1]);
 const minute = Number(match[2]);
 if (hour > 23 || minute > 59) return null;
 return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function stepTimePart(value: string, part: 'hour' | 'minute', delta: number): string {
 const base = normalizeTimeEntry(value) ?? '00:00';
 const values = base.split(':').map(Number);
 const index = part === 'hour' ? 0 : 1;
 const limit = part === 'hour' ? 24 : 60;
 const step = Number.isFinite(delta) ? Math.trunc(delta) % limit : 0;
 values[index] = ((values[index] + step) % limit + limit) % limit;
 return values.map(segment => String(segment).padStart(2, '0')).join(':');
}

import { FERIT_TEACHERS, type FeritTeacher } from './ferit-teachers-data.ts';
import type { Lesson } from './ferit.ts';

export type { FeritTeacher };
export { FERIT_TEACHERS };

export type ScheduleTeacherCourse = {
  title: string;
  types: string[];
  repeatingYear?: number;
};

export type ScheduleTeacherEntry = {
  key: string;
  teacher: FeritTeacher;
  courses: ScheduleTeacherCourse[];
  isCustom: boolean;
};

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/č/g, 'c')
    .replace(/ć/g, 'c')
    .replace(/đ/g, 'dj')
    .replace(/š/g, 's')
    .replace(/ž/g, 'z')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordTokens(s: string): Set<string> {
  const norm = normalizeText(s);
  const ignored = new Set([
    'prof', 'dr', 'sc', 'doc', 'mr', 'mag', 'ing', 'univ', 'comp',
    'el', 'med', 'educ', 'phys', 'inf', 'math', 'dipl', 'iur', 'bacc', 'tech'
  ]);
  return new Set(norm.split(' ').filter(w => w.length > 1 && !ignored.has(w)));
}

const BY_SLUG = new Map<string, FeritTeacher>();
for (const t of FERIT_TEACHERS) {
  if (t.slug) {
    BY_SLUG.set(t.slug.toLowerCase(), t);
  }
}

export function findTeacher(nameOrSlug: string): FeritTeacher | null {
  if (!nameOrSlug || !nameOrSlug.trim()) return null;
  const raw = nameOrSlug.trim();
  const bySlug = BY_SLUG.get(raw.toLowerCase());
  if (bySlug) return bySlug;

  const queryWords = wordTokens(raw);
  if (queryWords.size === 0) return null;

  let bestMatch: FeritTeacher | null = null;
  let bestScore = 0;

  for (const t of FERIT_TEACHERS) {
    const teacherTokens = wordTokens(t.name);
    let matches = 0;
    for (const qw of queryWords) {
      if (teacherTokens.has(qw)) {
        matches++;
      }
    }
    if (matches > 0 && matches === queryWords.size) {
      return t;
    }
    if (matches > bestScore) {
      bestScore = matches;
      bestMatch = t;
    }
  }

  if (bestScore >= 2 && bestMatch) {
    return bestMatch;
  }

  return null;
}

export function fallbackEmail(name: string): string | null {
  const words = Array.from(wordTokens(name));
  if (words.length >= 2) {
    const first = words[words.length - 1];
    const last = words.slice(0, -1).join('.');
    return `${first}.${last}@ferit.hr`;
  }
  return null;
}

export function getTeacherEmail(name: string): string | null {
  if (!name || !name.trim()) return null;
  const found = findTeacher(name);
  if (found && found.email) return found.email;
  return fallbackEmail(name);
}

export function searchTeachers(query: string): FeritTeacher[] {
  const q = normalizeText(query);
  if (!q) return FERIT_TEACHERS;
  const tokens = q.split(' ').filter(Boolean);
  return FERIT_TEACHERS.filter(t => {
    const normName = normalizeText(t.name);
    const normEmail = normalizeText(t.email);
    const normRoom = normalizeText(t.room);
    return tokens.every(tok => normName.includes(tok) || normEmail.includes(tok) || normRoom.includes(tok));
  });
}

export function extractScheduleTeachers(
  lessons: Lesson[],
  customSlugs: string[] = []
): ScheduleTeacherEntry[] {
  const map = new Map<string, { key: string; teacher: FeritTeacher; courses: Map<string, { title: string; types: Set<string>; repeatingYear?: number }>; isCustom: boolean }>();

  for (const l of lessons) {
    if (!l.teacher || !l.teacher.trim()) continue;
    const raw = l.teacher.trim();
    const parts = raw.includes(',') ? raw.split(',').map(s => s.trim()) : [raw];
    for (const p of parts) {
      if (!p) continue;
      const found = findTeacher(p) || {
        name: p,
        slug: p.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        email: getTeacherEmail(p) || '',
        room: l.room || '',
        tel: ''
      };
      const key = found.slug || found.name;
      if (!map.has(key)) {
        map.set(key, { key, teacher: found, courses: new Map(), isCustom: false });
      }
      const entry = map.get(key)!;
      const repYear = (l as { repeatingYear?: number }).repeatingYear;
      const courseKey = (repYear ? `rep:${repYear}:` : '') + l.title;
      if (!entry.courses.has(courseKey)) {
        entry.courses.set(courseKey, {
          title: l.title,
          types: new Set(),
          repeatingYear: repYear
        });
      }
      const type = l.typeLabel || l.type;
      if (type) {
        entry.courses.get(courseKey)!.types.add(type);
      }
    }
  }

  for (const slug of customSlugs) {
    if (!slug) continue;
    const found = findTeacher(slug);
    if (found) {
      const key = found.slug || found.name;
      if (map.has(key)) {
        map.get(key)!.isCustom = true;
      } else {
        map.set(key, { key, teacher: found, courses: new Map(), isCustom: true });
      }
    }
  }

  return Array.from(map.values())
    .map(entry => ({
      key: entry.key,
      teacher: entry.teacher,
      courses: Array.from(entry.courses.values()).map(c => ({
        title: c.title,
        types: Array.from(c.types),
        repeatingYear: c.repeatingYear
      })),
      isCustom: entry.isCustom
    }))
    .sort((a, b) => a.teacher.name.localeCompare(b.teacher.name, 'hr'));
}

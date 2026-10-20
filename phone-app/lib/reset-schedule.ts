import type {Lesson,Override} from './ferit';

// Keep the student's selected timetable and LV groups; discard personal changes
// across every saved timetable so FERIT's current terms become visible again.
export function resetPersonalSchedule<T extends {overrides:Record<string,Override>;personal:Lesson[]}>(preferences:T):T {
 return {...preferences,overrides:{},personal:[]};
}

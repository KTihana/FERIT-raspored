export const PERSONAL_COLORS = [
 {value:'purple',label:'Ljubičasta'},
 {value:'peach',label:'Narančasta'},
 {value:'green',label:'Zelena'},
 {value:'blue',label:'Plava'},
] as const;
export type PersonalColor = typeof PERSONAL_COLORS[number]['value'];
export function personalColor(value:unknown):PersonalColor {
 return PERSONAL_COLORS.some(c=>c.value===value)?value as PersonalColor:'purple';
}

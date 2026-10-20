export type Theme='light'|'dark';
export function storedTheme(value:unknown,deviceDark:boolean):Theme{
 return value==='light'||value==='dark'?value:deviceDark?'dark':'light';
}

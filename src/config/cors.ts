export function parseCorsOrigin(value: string): boolean | string[] {
  if (value === '*') {
    return true;
  }

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

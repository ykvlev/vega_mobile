export type AdminActionState = { message?: string };
export const initialAdminState: AdminActionState = {};

export function millimetersToMeters(value: string): string {
  if (!/^[0-9]+$/.test(value)) return '';
  const padded = value.padStart(4, '0');
  const whole = padded.slice(0, -3).replace(/^0+(?=\d)/, '');
  const fraction = padded.slice(-3).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

export function metersToMillimeters(value: string): string | null {
  const normalized = value.trim().replace(',', '.');
  if (!/^[0-9]{1,10}(?:\.[0-9]{1,3})?$/.test(normalized)) return null;
  const [whole, fraction = ''] = normalized.split('.');
  const millimeters = BigInt(whole!) * 1000n + BigInt(fraction.padEnd(3, '0'));
  return millimeters > 0n && millimeters <= 2147483647n
    ? millimeters.toString()
    : null;
}

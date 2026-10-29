export const colors = [
  { id: 'graphite', name: 'Графит', hex: '#33383d' },
  { id: 'carmine', name: 'Кармин', hex: '#9e203a' },
  { id: 'pearl', name: 'Жемчуг', hex: '#e6e5dd' },
  { id: 'forest', name: 'Лесной', hex: '#324e46' },
  { id: 'cobalt', name: 'Кобальт', hex: '#304f9d' },
  { id: 'sand', name: 'Песочный', hex: '#b6a68f' },
] as const;
export const finishes = [
  { id: 'gloss', name: 'Глянец', roughness: 0.16, clearcoat: 1 },
  { id: 'satin', name: 'Сатин', roughness: 0.42, clearcoat: 0.3 },
  { id: 'matte', name: 'Матовый', roughness: 0.8, clearcoat: 0 },
] as const;
export type ColorId = (typeof colors)[number]['id'];
export type FinishId = (typeof finishes)[number]['id'];
export type ViewId = 'perspective' | 'front' | 'side' | 'rear';
// Runtime callers can select known IDs only, never material code or model URLs.
export function material(colorId: ColorId, finishId: FinishId) {
  const color = colors.find((entry) => entry.id === colorId);
  const finish = finishes.find((entry) => entry.id === finishId);
  if (!color || !finish) throw new Error('Unknown material');
  return { color, finish };
}

export type DemoPublicProduct = {
  id: string;
  article: string;
  name: string;
  category: 'Прозрачная' | 'Color' | 'Ultima';
  color: string;
  colorName: string;
  finish: string;
  rollLengthM: number;
  widthMm: number;
};

// Original visual-study fixtures. No commercial fields or external catalogue data.
export const demoProducts: readonly DemoPublicProduct[] = [
  {
    id: 'graphite',
    article: 'DEMO-C01',
    name: 'VEGA Color · Graphite',
    category: 'Color',
    color: '#70777a',
    colorName: 'Графит',
    finish: 'Глянцевая',
    rollLengthM: 17,
    widthMm: 1520,
  },
  {
    id: 'olive',
    article: 'DEMO-U01',
    name: 'VEGA Ultima · Olive',
    category: 'Ultima',
    color: '#747967',
    colorName: 'Олива',
    finish: 'Матовая',
    rollLengthM: 17,
    widthMm: 1520,
  },
  {
    id: 'silver',
    article: 'DEMO-C02',
    name: 'VEGA Color · Silver',
    category: 'Color',
    color: '#b4b6b9',
    colorName: 'Серебро',
    finish: 'Глянцевая',
    rollLengthM: 17,
    widthMm: 1520,
  },
  {
    id: 'clear',
    article: 'DEMO-P01',
    name: 'VEGA · Clear',
    category: 'Прозрачная',
    color: '#ced4d1',
    colorName: 'Прозрачная',
    finish: 'Глянцевая',
    rollLengthM: 15,
    widthMm: 1520,
  },
  {
    id: 'clay',
    article: 'DEMO-U02',
    name: 'VEGA Ultima · Clay',
    category: 'Ultima',
    color: '#a78d7b',
    colorName: 'Глина',
    finish: 'Матовая',
    rollLengthM: 17,
    widthMm: 1520,
  },
  {
    id: 'blue',
    article: 'DEMO-C03',
    name: 'VEGA Color · Midnight',
    category: 'Color',
    color: '#506577',
    colorName: 'Полночь',
    finish: 'Глянцевая',
    rollLengthM: 17,
    widthMm: 1520,
  },
];

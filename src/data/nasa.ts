export interface NasaReferenceEntry {
  source: 'MOXIE' | 'MEDA' | 'RAD' | 'DONKI';
  title: string;
  fact: string;
  measurementNote: string;
}

export const NASA_REFERENCE_DATA: NasaReferenceEntry[] = [
  {
    source: 'MOXIE',
    title: 'Oxygen From Mars Air',
    fact: 'Perseverance’s MOXIE instrument successfully generated breathable oxygen from Mars’s 95% carbon-dioxide atmosphere right in Jezero Crater.',
    measurementNote: 'NASA Reference: ~6–12 g of O2/hour in tech-demo runs (gameplay rates are simplified).',
  },
  {
    source: 'MEDA',
    title: 'Jezero Crater Weather & Dust',
    fact: 'MEDA sensors recorded daily temperatures swinging from -15°C at midday down to -80°C at night, plus frequent dust-devil gusts.',
    measurementNote: 'NASA Reference: Surface pressure ~610 Pa (<1% of Earth sea-level pressure).',
  },
  {
    source: 'RAD',
    title: 'Surface Radiation Levels',
    fact: 'Curiosity’s RAD detector measures steady cosmic rays and sudden spikes during solar particle storms.',
    measurementNote: 'NASA Reference: ~0.64 mSv/day ambient background on Mars surface.',
  },
  {
    source: 'DONKI',
    title: 'Space Weather Alerts',
    fact: 'Solar flares and coronal mass ejections monitored by NASA DONKI can reach Mars and require crews to enter shielded shelters.',
    measurementNote: 'NASA Reference: Early solar storm alerts give astronauts time to shelter.',
  },
];

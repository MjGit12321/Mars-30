import { CropDefinition } from '../types/game';

export const CROP_DEFINITIONS: CropDefinition[] = [
  {
    id: 'mars_potatoes',
    name: 'Mars Potatoes',
    growthDays: 10,
    seedWaterCost: 6,
    seedEnergyCost: 4,
    dailyWaterNeed: 2,
    dailyEnergyNeed: 2,
    harvestFoodYield: 105,
    description: 'Hardy, calorie-rich tubers taking 10 Martian days to reach full harvest.',
  },
  {
    id: 'dwarf_wheat',
    name: 'Dwarf Wheat & Greens',
    growthDays: 8,
    seedWaterCost: 5,
    seedEnergyCost: 4,
    dailyWaterNeed: 2,
    dailyEnergyNeed: 2,
    harvestFoodYield: 82,
    description: 'Fast-growing hydroponic grain and leafy greens ready in 8 Martian days.',
  },
];

export const CROP_MAP: Record<string, CropDefinition> = Object.fromEntries(
  CROP_DEFINITIONS.map((crop) => [crop.id, crop])
);

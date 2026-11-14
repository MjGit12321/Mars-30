import { EventPhenomenon } from './event';
import { ResourceAmounts, ResourceType } from './resource';

export type BuildingId =
  | 'main_habitat'
  | 'solar_panels'
  | 'energy_storage'
  | 'oxygen_generator'
  | 'oxygen_storage'
  | 'water_recycling'
  | 'water_storage'
  | 'greenhouse'
  | 'food_storage'
  | 'radiation_shelter'
  | 'maintenance_facility';

export type BuildingStatus = 'operational' | 'damaged' | 'inactive' | 'maintenance';

export type BuildingCategory = 'habitat' | 'energy' | 'life_support' | 'food' | 'safety';

export interface BuildingDefinition {
  id: BuildingId;
  name: string;
  shortName: string;
  category: BuildingCategory;
  description: string;
  scienceNote: string;
  gridX: number;
  gridY: number;
  widthTiles: number;
  heightTiles: number;
  initialStatus: BuildingStatus;
  initialCondition: number;
  dailyProduction: Partial<ResourceAmounts>;
  dailyConsumption: Partial<ResourceAmounts>;
  storageBonus?: Partial<Record<ResourceType, number>>;
  waterRecoveryRate?: number;
  requiresPower: boolean;
  isCritical: boolean;
}

export interface BuildingState {
  id: BuildingId;
  status: BuildingStatus;
  condition: number; // 0 to 100
  dustLevel: number; // 0 to 100 (especially affects solar panels)
  restoredOnce: boolean;
  timesMaintained: number;
  hasVisibleDamage?: boolean;
  damageCause?: EventPhenomenon | 'wear';
}

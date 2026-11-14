import { BuildingId } from './building';
import { ResourceAmounts } from './resource';

export type EventSeverity = 'minor' | 'major' | 'super_major';

export type EventPhenomenon =
  | 'marsquake'
  | 'secondary_neutron_cascades'
  | 'water_ice_clouds'
  | 'dust_devils'
  | 'solar_flare_xray_uv'
  | 'solar_storm_response'
  | 'solar_energetic_particles'
  | 'global_dust_storm';

export interface EventDefinition {
  id: string;
  phenomenon: EventPhenomenon;
  title: string;
  severity: EventSeverity;
  summary: string;
  scienceContext: string;
  recommendedAction: string;
  solarPenaltyFactor?: number; // e.g., 0.5 means 50% solar reduction on event day
  radiationLevel?: number; // 0 to 50 raw exposure before shelter mitigation
  crewEnergyImpact?: number;
  resourceLoss?: Partial<ResourceAmounts>;
  targetBuildings?: BuildingId[];
  conditionDamage?: number;
  dustAdded?: number;
  cropGrowthPenalty?: number;
}

export interface ActiveEvent {
  definition: EventDefinition;
  dayTriggered: number;
  resolved: boolean;
  shelterUsed: boolean;
  mitigationSummary: string;
}

export interface EventLogEntry {
  day: number;
  eventId: string;
  title: string;
  severity: EventSeverity;
  outcomeSummary: string;
}

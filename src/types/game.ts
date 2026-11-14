import { BuildingId, BuildingState } from './building';
import { ActiveEvent, EventLogEntry } from './event';
import { ResourceAmounts } from './resource';

export type ScreenMode = 'TITLE_MENU' | 'PLAYING' | 'PAUSED' | 'MISSION_REPORT' | 'GAME_OVER';

export type MissionPhaseNumber = 1 | 2 | 3 | 4;

export interface MissionPhaseInfo {
  phase: MissionPhaseNumber;
  title: string;
  dayRangeLabel: string;
  objectives: string[];
}

export interface CropDefinition {
  id: string;
  name: string;
  growthDays: number;
  seedWaterCost: number;
  seedEnergyCost: number;
  dailyWaterNeed: number;
  dailyEnergyNeed: number;
  harvestFoodYield: number;
  description: string;
}

export interface PlantedCrop {
  cropId: string;
  plantedDay: number;
  growthProgress: number; // 0 to growthDays
  growthDaysRequired: number;
  isMature: boolean;
  health: number; // 0 to 100
}

export interface CrewState {
  energy: number; // 0 to 100
  condition: number; // 0 to 100
  radiationExposure: number; // 0 to 100
  inShelter: boolean;
  restedToday: boolean;
}

export interface DaySummary {
  day: number;
  production: ResourceAmounts;
  consumption: ResourceAmounts;
  waterRecycled: number;
  cropGrowthDelta: number;
  cropReadyToHarvest: boolean;
  crewEnergyRecovered: number;
  overtimeHours?: number;
  fatiguePenalty?: number;
  buildingImpacts?: Array<{
    buildingId: BuildingId;
    conditionDelta: number;
    dustAdded?: number;
  }>;
  shortages: string[];
  notes: string[];
}

export type SustainabilityOutcome =
  | 'Sustainable'
  | 'Sustainable with Improvements'
  | 'Unsustainable';

export interface SustainabilityCriterion {
  id: string;
  label: string;
  status: 'pass' | 'warning' | 'fail';
  score: number; // 0 to 100
  detail: string;
}

export interface SustainabilityAssessment {
  outcome: SustainabilityOutcome;
  overallScore: number;
  summary: string;
  criteria: SustainabilityCriterion[];
  daysSurvived: number;
  facilitiesOperational: number;
  totalFacilities: number;
  keyDecisions: string[];
}

export type GilEmotion =
  | 'happy'
  | 'excited'
  | 'surprised'
  | 'worried'
  | 'concerned'
  | 'relieved';

export interface GilMessage {
  id: string;
  speaker: 'GIL';
  headline: string;
  body: string;
  scienceTip?: string;
  urgency: 'info' | 'warning' | 'alert';
  emotion: GilEmotion;
}

export interface MissionModifiers {
  solarOutputBonusPct: number;
  stormDamageFactor: number;
  extraDustNextStorm: number;
  cropBoostDaysLeft: number;
  lastDecisionNote: {
    id: string;
    headline: string;
    outcome: string;
    futureWarning: string;
    urgency: 'info' | 'warning' | 'alert';
  } | null;
  decisionHistory: Array<{
    day: number;
    eventId: string;
    choiceId: string;
    choiceTitle: string;
    summary: string;
  }>;
}

export interface TerrainScar {
  id: string;
  kind: 'solar_scorch' | 'sep_crater' | 'dust_drift' | 'quake_fissure';
  x: number;
  y: number;
  size: number;
  eventId: string;
  day: number;
}

export type SleepPhase = 'idle' | 'returning' | 'sleeping';

export interface PendingCrewAction {
  id: string;
  kind: 'task' | 'plant' | 'harvest';
  buildingId: BuildingId;
  taskId?: string;
  cropId?: string;
  taskKind: 'restore' | 'repair' | 'clean' | 'plant' | 'harvest';
  assignedCrew: 'NAS' | 'EVA' | 'KAI' | 'MIA';
  label: string;
  phase: 'walking' | 'working';
  workDurationSec: number;
  workRemainingSec: number;
  timeHoursTotal: number;
  timeHoursApplied: number;
}

export interface GameState {
  screen: ScreenMode;
  day: number;
  maxDays: number;
  hoursRemaining: number;
  maxDailyHours: number;
  hoursElapsed: number;
  overtimeHours: number;
  sleepPhase: SleepPhase;
  sleepingRemaining: number;
  ongoingTask: { taskId: string; buildingId: BuildingId } | null;
  pendingAction: PendingCrewAction | null;
  phase: MissionPhaseNumber;
  resources: ResourceAmounts;
  capacities: ResourceAmounts;
  buildings: Record<BuildingId, BuildingState>;
  selectedBuildingId: BuildingId | null;
  crew: CrewState;
  greenhouseCrop: PlantedCrop | null;
  harvestCount: number;
  activeEvent: ActiveEvent | null;
  scheduledEventDays: Record<number, string>;
  eventHistory: EventLogEntry[];
  environmentalScars: TerrainScar[];
  modifiers: MissionModifiers;
  lastDaySummary: DaySummary | null;
  gilDayHint: GilMessage | null;
  failureReason: string | null;
  assessment: SustainabilityAssessment | null;
  totalTasksCompleted: number;
  majorTasksCompleted: number;
  minorTasksCompleted: number;
  keyDecisions: string[];
  seed: number;
  audioMuted: boolean;
}

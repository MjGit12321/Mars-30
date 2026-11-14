import { BUILDING_LIST } from '../data/buildings';
import {
  GameState,
  SustainabilityAssessment,
  SustainabilityCriterion,
  SustainabilityOutcome,
} from '../types/game';
import { calculateDailyRates } from './resources';
import { getOperationalBuildingCount } from './buildings';

function scoreToStatus(score: number): 'pass' | 'warning' | 'fail' {
  if (score >= 75) return 'pass';
  if (score >= 45) return 'warning';
  return 'fail';
}

export function evaluateSustainability(state: GameState): SustainabilityAssessment {
  const rates = calculateDailyRates({
    buildings: state.buildings,
    currentResources: state.resources,
    greenhouseCrop: state.greenhouseCrop,
    activeEvent: null,
  });

  // 1. Oxygen: production >= crew consumption + healthy reserves
  const o2Operational = state.buildings.oxygen_generator.status === 'operational';
  const o2Score = Math.min(
    100,
    (rates.net.oxygen.net >= 2 ? 65 : rates.net.oxygen.net >= 0 ? 45 : 15) +
      (o2Operational ? 20 : 0) +
      Math.min(15, Math.round((state.resources.oxygen / 100) * 15))
  );

  // 2. Water: recycling active + steady reserves
  const waterOperational = state.buildings.water_recycling.status === 'operational';
  const waterScore = Math.min(
    100,
    (waterOperational ? 50 : state.buildings.water_recycling.status === 'damaged' ? 28 : 0) +
      (rates.net.water.net >= -1 ? 30 : rates.net.water.net >= -4 ? 18 : 5) +
      Math.min(20, Math.round((state.resources.water / 100) * 20))
  );

  // 3. Food: greenhouse operational + harvests/planted crop + reserves
  const greenhouseOperational = state.buildings.greenhouse.status === 'operational';
  const hasCropOrHarvest = Boolean(state.greenhouseCrop) || state.harvestCount > 0;
  const foodScore = Math.min(
    100,
    (greenhouseOperational ? 45 : state.buildings.greenhouse.status === 'damaged' ? 25 : 0) +
      (state.harvestCount > 0 ? 25 : state.greenhouseCrop ? 18 : 0) +
      Math.min(30, Math.round((state.resources.food / 120) * 30))
  );

  // 4. Energy: solar generation covers facility load + energy storage
  const solarOperational = state.buildings.solar_panels.status === 'operational';
  const batteryOperational = state.buildings.energy_storage.status !== 'inactive';
  const energyScore = Math.min(
    100,
    (rates.net.energy.net >= 2 ? 55 : rates.net.energy.net >= -2 ? 35 : 10) +
      (solarOperational ? 20 : 5) +
      (batteryOperational ? 15 : 0) +
      Math.min(10, Math.round((state.resources.energy / 80) * 10))
  );

  // 5. Infrastructure reliability
  const avgCondition = Math.round(
    BUILDING_LIST.reduce((sum, def) => sum + state.buildings[def.id].condition, 0) /
      BUILDING_LIST.length
  );
  const operationalCount = getOperationalBuildingCount(state.buildings);
  const infraScore = Math.min(
    100,
    Math.round(avgCondition * 0.65 + (operationalCount / BUILDING_LIST.length) * 35)
  );

  // 6. Crew condition
  const crewScore = Math.min(
    100,
    Math.round(state.crew.condition * 0.7 + state.crew.energy * 0.3 - state.crew.radiationExposure * 0.25)
  );

  // 7. Radiation protection
  const shelter = state.buildings.radiation_shelter;
  const radScore = Math.min(
    100,
    Math.max(
      0,
      (shelter.status === 'operational' ? 60 : shelter.status === 'damaged' ? 35 : 0) +
        Math.round(shelter.condition * 0.35) -
        Math.round(state.crew.radiationExposure * 0.3)
    )
  );

  const criteria: SustainabilityCriterion[] = [
    {
      id: 'oxygen',
      label: 'Oxygen Loop',
      status: scoreToStatus(o2Score),
      score: o2Score,
      detail: `Net ${rates.net.oxygen.net >= 0 ? '+' : ''}${rates.net.oxygen.net}/day · Reserve ${state.resources.oxygen} O2`,
    },
    {
      id: 'water',
      label: 'Water Recycling',
      status: scoreToStatus(waterScore),
      score: waterScore,
      detail: `Net ${rates.net.water.net >= 0 ? '+' : ''}${rates.net.water.net}/day · Reserve ${state.resources.water} H2O`,
    },
    {
      id: 'food',
      label: 'Food Production',
      status: scoreToStatus(foodScore),
      score: foodScore,
      detail: `${state.harvestCount} harvest(s) · ${state.greenhouseCrop ? 'Crop active' : 'No crop planted'} · ${state.resources.food} kcal`,
    },
    {
      id: 'energy',
      label: 'Solar & Storage',
      status: scoreToStatus(energyScore),
      score: energyScore,
      detail: `Net ${rates.net.energy.net >= 0 ? '+' : ''}${rates.net.energy.net}/day · Reserve ${state.resources.energy} kWh`,
    },
    {
      id: 'infrastructure',
      label: 'Infrastructure',
      status: scoreToStatus(infraScore),
      score: infraScore,
      detail: `${operationalCount}/${BUILDING_LIST.length} operational · Avg condition ${avgCondition}%`,
    },
    {
      id: 'crew',
      label: 'Crew Health',
      status: scoreToStatus(crewScore),
      score: crewScore,
      detail: `Health ${state.crew.condition}% · Radiation ${state.crew.radiationExposure}%`,
    },
    {
      id: 'radiation',
      label: 'Radiation Shielding',
      status: scoreToStatus(radScore),
      score: radScore,
      detail: `Shelter ${shelter.status} (${shelter.condition}%)`,
    },
  ];

  const overallScore = Math.round(
    criteria.reduce((sum, c) => sum + c.score, 0) / criteria.length
  );

  const failedCritical = criteria.filter((c) => c.status === 'fail').length;

  let outcome: SustainabilityOutcome;
  let summary: string;

  if (overallScore >= 75 && failedCritical === 0 && hasCropOrHarvest) {
    outcome = 'Sustainable';
    summary =
      'Outstanding leadership! Your restored life-support loops, greenhouse crops, and strong shielding can safely sustain the crew for another 150 Martian days.';
  } else if (overallScore >= 48 && failedCritical <= 2) {
    outcome = 'Sustainable with Improvements';
    summary =
      'Your outpost survived the 30-day mission, but key life-support reserves, crop cycles, or facility repairs still need strengthening for a full 150-day stay.';
  } else {
    outcome = 'Unsustainable';
    summary =
      'Although the crew reached Day 30, critical life-support systems or reserves are too weak to support another 150 days without emergency resupply.';
  }

  return {
    outcome,
    overallScore,
    summary,
    criteria,
    daysSurvived: state.day,
    facilitiesOperational: operationalCount,
    totalFacilities: BUILDING_LIST.length,
    keyDecisions: state.keyDecisions.slice(-6),
  };
}

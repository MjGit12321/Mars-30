import { NASA_REFERENCE_DATA } from '../data/nasa';
import { GameState, GilMessage } from '../types/game';
import { detectResourceShortages } from './resources';

export function getNextObjectiveLine(state: GameState): string {
  if (state.activeEvent?.definition.radiationLevel && !state.crew.inShelter) {
    return 'Move crew into the Radiation Shelter';
  }
  if (state.greenhouseCrop?.isMature) {
    return 'Harvest ripe food in the Greenhouse';
  }
  if (state.buildings.solar_panels.status === 'inactive') {
    return 'Restore the broken Solar Panels';
  }
  if (state.buildings.oxygen_generator.status === 'inactive') {
    return 'Restore the Oxygen Generator';
  }
  if (state.buildings.water_recycling.status === 'inactive') {
    return 'Restore the Water Recycler';
  }
  if (state.buildings.greenhouse.status === 'inactive') {
    return 'Restore the Greenhouse for food';
  }
  if (!state.greenhouseCrop && state.day <= 22) {
    return 'Plant seeds in the Greenhouse';
  }
  if (state.buildings.radiation_shelter.status === 'inactive') {
    return 'Restore the Radiation Shelter';
  }
  if (state.buildings.solar_panels.dustLevel >= 35) {
    return 'Brush dust off the Solar Panels';
  }
  if (state.day >= 27 && state.day < 29) {
    return 'Repair damaged facilities before Day 29';
  }
  if (state.day === 30) {
    return 'Repair damage and finish Day 30';
  }
  return 'Keep facilities repaired and reserves full';
}

export function getContextualGilMessage(state: GameState): GilMessage {
  const shortages = detectResourceShortages(state.resources);

  // 1. Urgent active environmental warning
  if (state.activeEvent && !state.activeEvent.resolved) {
    const evt = state.activeEvent.definition;
    if (evt.radiationLevel && !state.crew.inShelter) {
      return {
        id: `evt_rad_${state.day}`,
        speaker: 'GIL',
        headline: evt.severity === 'minor' ? `${evt.title}!` : 'Radiation Alert!',
        body:
          state.buildings.radiation_shelter.status === 'inactive'
            ? 'Fix the Rad Shelter or hide inside before ending the day!'
            : 'Tap the Rad Shelter and move your crew inside to stay safe!',
        scienceTip: evt.scienceContext,
        urgency: evt.severity === 'minor' ? 'warning' : 'alert',
      };
    }

    return {
      id: `evt_${evt.id}_${state.day}`,
      speaker: 'GIL',
      headline: evt.title,
      body: evt.recommendedAction,
      scienceTip: evt.scienceContext,
      urgency: evt.severity === 'minor' ? 'warning' : 'alert',
    };
  }

  // 2. Plain-language resource shortage explanations
  if (shortages.length > 0) {
    const first = shortages[0];
    const hintMap = {
      oxygen: 'Air is low! Tap Oxygen Generator to fix it.',
      water: 'Water is low! Tap Water Recycler to save water.',
      food: 'Food is low! Harvest or plant crops in the Greenhouse.',
      energy: 'Power is low! Fix or dust the Solar Panels.',
    };
    return {
      id: `shortage_${first}_${state.day}`,
      speaker: 'GIL',
      headline: `${first.charAt(0).toUpperCase() + first.slice(1)} Is Low!`,
      body: hintMap[first],
      urgency: 'alert',
    };
  }

  // 3. Day 1 arrival guidance
  if (state.day === 1) {
    if (state.buildings.solar_panels.status === 'inactive') {
      return {
        id: 'day1_solar',
        speaker: 'GIL',
        headline: 'Hey NAS! Ready to fix camp?',
        body: 'Tap the broken Solar Panels on the left to bring power back!',
        scienceTip: NASA_REFERENCE_DATA[1].fact,
        urgency: 'info',
      };
    }
    return {
      id: 'day1_done',
      speaker: 'GIL',
      headline: 'Power Is Back On!',
      body: 'Awesome! Fix another system or press END DAY below.',
      urgency: 'info',
    };
  }

  // 4. Greenhouse ready to harvest
  if (state.greenhouseCrop?.isMature) {
    return {
      id: `harvest_${state.day}`,
      speaker: 'GIL',
      headline: 'Food Is Ready!',
      body: 'Tap the Greenhouse to pick your crops and plant more!',
      urgency: 'info',
    };
  }

  // 5. Critical life-support restoration priorities
  if (state.buildings.oxygen_generator.status === 'inactive') {
    return {
      id: `o2_priority_${state.day}`,
      speaker: 'GIL',
      headline: 'Fix Oxygen Maker!',
      body: 'Restore the Oxygen Generator so your crew has fresh air.',
      scienceTip: NASA_REFERENCE_DATA[0].fact,
      urgency: 'warning',
    };
  }

  if (state.buildings.water_recycling.status === 'inactive') {
    return {
      id: `water_priority_${state.day}`,
      speaker: 'GIL',
      headline: 'Fix Water Recycler!',
      body: 'Restore it to clean and reuse 75% of your water!',
      urgency: 'warning',
    };
  }

  if (state.buildings.greenhouse.status === 'inactive') {
    return {
      id: `greenhouse_priority_${state.day}`,
      speaker: 'GIL',
      headline: 'Fix the Greenhouse!',
      body: 'Restore the Greenhouse so you can start growing food!',
      urgency: 'warning',
    };
  }

  if (!state.greenhouseCrop && state.day <= 22) {
    return {
      id: `plant_prompt_${state.day}`,
      speaker: 'GIL',
      headline: 'Time to Plant!',
      body: 'Tap the Greenhouse to plant Mars Potatoes or Wheat.',
      urgency: 'info',
    };
  }

  if (state.buildings.radiation_shelter.status === 'inactive') {
    return {
      id: `shelter_prompt_${state.day}`,
      speaker: 'GIL',
      headline: 'Fix Rad Shelter!',
      body: 'Restore the shelter so your crew can hide from solar storms.',
      scienceTip: NASA_REFERENCE_DATA[2].fact,
      urgency: 'warning',
    };
  }

  if (state.buildings.solar_panels.dustLevel >= 35) {
    return {
      id: `dust_prompt_${state.day}`,
      speaker: 'GIL',
      headline: 'Dusty Solar Panels!',
      body: `Red dust (${state.buildings.solar_panels.dustLevel}%) is blocking sunlight. Clean them!`,
      urgency: 'warning',
    };
  }

  if (state.day >= 26 && state.day < 29) {
    return {
      id: `prep_29_${state.day}`,
      speaker: 'GIL',
      headline: 'Big Storm Coming!',
      body: 'Repair weak buildings before the Day 29 Global Dust Storm!',
      urgency: 'warning',
    };
  }

  if (state.day === 30) {
    return {
      id: 'day30_final',
      speaker: 'GIL',
      headline: 'Final Day Check!',
      body: 'Fix any damage, then tap FINISH DAY 30 below!',
      urgency: 'info',
    };
  }

  return {
    id: `steady_${state.day}`,
    speaker: 'GIL',
    headline: 'Great Teamwork!',
    body: 'Keep systems healthy and watch your crew energy.',
    scienceTip: NASA_REFERENCE_DATA[state.day % NASA_REFERENCE_DATA.length].fact,
    urgency: 'info',
  };
}

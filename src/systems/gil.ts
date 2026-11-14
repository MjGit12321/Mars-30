import { BUILDING_DEFINITIONS } from '../data/buildings';
import { NASA_REFERENCE_DATA } from '../data/nasa';
import { DaySummary, GameState, GilMessage } from '../types/game';
import { detectResourceShortages } from './resources';

export function getNextObjectiveLine(state: GameState): string {
  if (state.activeEvent?.definition.radiationLevel && !state.crew.inShelter) {
    return 'Move crew into the Radiation Storm Shelter';
  }
  if (state.greenhouseCrop?.isMature) {
    return 'Harvest ripe food in the Greenhouse';
  }
  if (state.buildings.solar_panels.status === 'inactive') {
    return 'Restore the broken Solar Panels';
  }
  if (state.buildings.oxygen_generator.status === 'inactive') {
    return 'Restore the Oxygen Generation System';
  }
  if (state.buildings.water_recycling.status === 'inactive') {
    return 'Restore the Water Recovery System';
  }
  if (state.buildings.greenhouse.status === 'inactive') {
    return 'Restore the Greenhouse for food';
  }
  if (!state.greenhouseCrop && state.day <= 22) {
    return 'Plant seeds in the Greenhouse';
  }
  if (state.buildings.radiation_shelter.status === 'inactive') {
    return 'Restore the Radiation Storm Shelter';
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

  // 0a. Crew returning inside Habitat or sleeping for the night
  if (state.sleepPhase === 'returning') {
    return {
      id: `sleep_walk_${state.day}`,
      speaker: 'GIL',
      headline: 'Heading Home to Rest!',
      body: 'NAS, EVA, KAI, and MIA are walking back inside the Habitat before lights out!',
      urgency: 'info',
      emotion: 'relieved',
    };
  }
  if (state.sleepPhase === 'sleeping' || state.sleepingRemaining > 0) {
    return {
      id: `sleeping_${state.day}`,
      speaker: 'GIL',
      headline: 'Sweet Dreams, Team!',
      body: 'Zzz... Everyone is safe and cozy inside the Habitat recharging for tomorrow!',
      urgency: 'info',
      emotion: 'happy',
    };
  }

  // 0b. Live environmental animation playing on the outpost (event-specific reactions!)
  if (state.activeEvent && state.activeEvent.animationRemaining > 0) {
    const evt = state.activeEvent.definition;
    const hitAlready = state.activeEvent.initialDamageApplied;

    switch (evt.phenomenon) {
      case 'marsquake':
        return {
          id: `evt_anim_${evt.id}_${state.day}`,
          speaker: 'GIL',
          headline: hitAlready ? 'Whoa—Check Those Cracks!' : 'Whoa! The Ground Is Shaking!',
          body: hitAlready
            ? 'The Marsquake rattled our buildings! Let’s inspect the cracks once it settles!'
            : 'Hold onto your space boots! A Marsquake is shaking Jezero Crater!',
          scienceTip: evt.scienceContext,
          urgency: 'warning',
          emotion: 'surprised',
        };
      case 'dust_devils':
        return {
          id: `evt_anim_${evt.id}_${state.day}`,
          speaker: 'GIL',
          headline: 'Spinning Dust Tornadoes!',
          body: 'Look at those red swirls zooming past! They’re tossing dust on our Solar Panels!',
          scienceTip: evt.scienceContext,
          urgency: 'warning',
          emotion: 'surprised',
        };
      case 'water_ice_clouds':
        return {
          id: `evt_anim_${evt.id}_${state.day}`,
          speaker: 'GIL',
          headline: 'Brrr... Icy Sky Clouds!',
          body: 'Chilly ice clouds are blocking sunlight and frosting our Water Tanks & Greenhouse.',
          scienceTip: evt.scienceContext,
          urgency: 'warning',
          emotion: 'concerned',
        };
      case 'secondary_neutron_cascades':
        return {
          id: `evt_anim_${evt.id}_${state.day}`,
          speaker: 'GIL',
          headline: 'Yikes—Bouncing Space Sparks!',
          body: 'Space rays are hitting the dirt and bouncing up! We should check the Radiation Storm Shelter!',
          scienceTip: evt.scienceContext,
          urgency: 'warning',
          emotion: 'worried',
        };
      case 'solar_flare_xray_uv':
        return {
          id: `evt_anim_${evt.id}_${state.day}`,
          speaker: 'GIL',
          headline: 'Whoa—Bright Sun Flare!',
          body: 'Hot beams from the Sun are flashing down on the base! Keep an eye on crew safety!',
          scienceTip: evt.scienceContext,
          urgency: 'warning',
          emotion: 'worried',
        };
      case 'solar_storm_response':
        return {
          id: `evt_anim_${evt.id}_${state.day}`,
          speaker: 'GIL',
          headline: 'Big Solar Storm Incoming!',
          body: 'Crimson solar waves are sweeping across Mars! Get ready to pick our team plan!',
          scienceTip: evt.scienceContext,
          urgency: 'alert',
          emotion: 'worried',
        };
      case 'solar_energetic_particles':
        return {
          id: `evt_anim_${evt.id}_${state.day}`,
          speaker: 'GIL',
          headline: 'Fast Sun Sparks Warning!',
          body: 'Zippy sparks are zapping our machines and wires! Stay sharp and check our base!',
          scienceTip: evt.scienceContext,
          urgency: 'alert',
          emotion: 'worried',
        };
      case 'global_dust_storm':
      default:
        return {
          id: `evt_anim_${evt.id}_${state.day}`,
          speaker: 'GIL',
          headline: 'Giant Dust Storm Alert!',
          body: 'Huge red dust clouds are covering Mars! Every building needs our smartest plan!',
          scienceTip: evt.scienceContext,
          urgency: 'alert',
          emotion: 'worried',
        };
    }
  }

  // 0c. Crew currently walking to or actively performing a task at a building
  if (state.pendingAction) {
    const bName = BUILDING_DEFINITIONS[state.pendingAction.buildingId].shortName;
    if (state.pendingAction.phase === 'walking') {
      return {
        id: `walk_${state.pendingAction.id}`,
        speaker: 'GIL',
        headline: `Heading to ${bName}!`,
        body: `Follow me, NAS! Running over to ${bName} to get started!`,
        urgency: 'info',
        emotion: 'excited',
      };
    }
    if (state.pendingAction.taskKind === 'plant') {
      return {
        id: `work_${state.pendingAction.id}`,
        speaker: 'GIL',
        headline: 'Planting Fresh Seeds!',
        body: 'Dropping seeds into clean water trays—soon we’ll have fresh Mars food!',
        urgency: 'info',
        emotion: 'excited',
      };
    }
    if (state.pendingAction.taskKind === 'harvest') {
      return {
        id: `work_${state.pendingAction.id}`,
        speaker: 'GIL',
        headline: 'Woohoo! Harvest Time!',
        body: 'Picking delicious home-grown food right out of the Greenhouse!',
        urgency: 'info',
        emotion: 'excited',
      };
    }
    if (state.pendingAction.taskKind === 'clean') {
      return {
        id: `work_${state.pendingAction.id}`,
        speaker: 'GIL',
        headline: 'Brushing Red Dust!',
        body: `Sweeping Mars dust off ${bName} so sunlight shines right through!`,
        urgency: 'info',
        emotion: 'happy',
      };
    }
    if (state.pendingAction.taskKind === 'restore') {
      return {
        id: `work_${state.pendingAction.id}`,
        speaker: 'GIL',
        headline: `Rebuilding ${bName}!`,
        body: `Wrenches spinning! Bringing ${bName} back online for the whole crew!`,
        urgency: 'info',
        emotion: 'excited',
      };
    }
    return {
      id: `work_${state.pendingAction.id}`,
      speaker: 'GIL',
      headline: `Fixing ${bName}!`,
      body: `Patching cracks and tightening bolts on ${bName} so it stays strong!`,
      urgency: 'info',
      emotion: 'concerned',
    };
  }

  // 0d. Crew inside Radiation Storm Shelter — clearly explain why tasks are paused
  if (state.crew.inShelter) {
    const radDanger = Boolean(state.activeEvent?.definition.radiationLevel);
    return {
      id: `sheltering_${state.day}_${radDanger ? 'rad' : 'safe'}`,
      speaker: 'GIL',
      headline: radDanger ? 'Phew! Everyone Is Safe!' : 'Cozy Inside Radiation Storm Shelter',
      body: radDanger
        ? 'All 4 crew & I are shielded inside! Tap END DAY below to let the storm pass safely.'
        : 'Work tasks are paused inside. Tap the Radiation Storm Shelter anytime to step back outside!',
      scienceTip: state.activeEvent?.definition.scienceContext,
      urgency: 'info',
      emotion: 'relieved',
    };
  }

  // 1. Urgent active environmental warning (after animation settled)
  if (state.activeEvent && !state.activeEvent.resolved) {
    const evt = state.activeEvent.definition;
    if (evt.radiationLevel && !state.crew.inShelter) {
      return {
        id: `evt_rad_${state.day}`,
        speaker: 'GIL',
        headline: evt.severity === 'minor' ? `${evt.title} Outside!` : 'Radiation Alert!',
        body:
          state.buildings.radiation_shelter.status === 'inactive'
            ? 'Our Radiation Storm Shelter is still broken! Restore it quick before ending the day!'
            : 'Let’s move NAS and the crew into the Radiation Storm Shelter until the rays pass!',
        scienceTip: evt.scienceContext,
        urgency: evt.severity === 'minor' ? 'warning' : 'alert',
        emotion: 'worried',
      };
    }

    return {
      id: `evt_${evt.id}_${state.day}`,
      speaker: 'GIL',
      headline: evt.phenomenon === 'marsquake' ? 'That Was Shaky!' : evt.title,
      body: evt.recommendedAction,
      scienceTip: evt.scienceContext,
      urgency: evt.severity === 'minor' ? 'warning' : 'alert',
      emotion: evt.phenomenon === 'marsquake' ? 'concerned' : 'worried',
    };
  }

  // 1b. Major decision outcome + future consequence warning
  if (state.modifiers.lastDecisionNote) {
    const note = state.modifiers.lastDecisionNote;
    return {
      id: note.id,
      speaker: 'GIL',
      headline: note.headline,
      body: `${note.outcome} ${note.futureWarning}`,
      urgency: note.urgency,
      emotion:
        note.urgency === 'alert'
          ? 'concerned'
          : note.urgency === 'warning'
          ? 'worried'
          : 'relieved',
    };
  }

  // 2. Plain-language resource shortage explanations
  if (shortages.length > 0) {
    const first = shortages[0];
    const hintMap = {
      oxygen: 'Air is getting low! Let’s run to the Oxygen Generation System and fix it!',
      water: 'Water is running low! Tap the Water Recovery System to save more water.',
      food: 'Food supplies are dipping! Check the Greenhouse to plant or harvest.',
      energy: 'Power is running low! Fix or dust the Solar Panels right away.',
    };
    return {
      id: `shortage_${first}_${state.day}`,
      speaker: 'GIL',
      headline: `Uh-Oh—${first.charAt(0).toUpperCase() + first.slice(1)} Is Low!`,
      body: hintMap[first],
      urgency: 'alert',
      emotion: 'concerned',
    };
  }

  // 3. Day 1 arrival guidance
  if (state.day === 1) {
    if (state.buildings.solar_panels.status === 'inactive') {
      return {
        id: 'day1_solar',
        speaker: 'GIL',
        headline: 'Hi NAS! Ready for Mars?',
        body: 'Tap the broken Solar Panels on the left so we can bring power back!',
        scienceTip: NASA_REFERENCE_DATA[1].fact,
        urgency: 'info',
        emotion: 'excited',
      };
    }
    return {
      id: 'day1_done',
      speaker: 'GIL',
      headline: 'Yay! Power Is Back On!',
      body: 'Awesome job! Fix another system or press END DAY below when ready.',
      urgency: 'info',
      emotion: 'relieved',
    };
  }

  // 4. Greenhouse ready to harvest
  if (state.greenhouseCrop?.isMature) {
    return {
      id: `harvest_${state.day}`,
      speaker: 'GIL',
      headline: 'Woohoo! Crops Are Ready!',
      body: 'Tap the Greenhouse so we can harvest fresh food and plant more!',
      urgency: 'info',
      emotion: 'excited',
    };
  }

  // 5. Critical life-support restoration priorities
  if (state.buildings.oxygen_generator.status === 'inactive') {
    return {
      id: `o2_priority_${state.day}`,
      speaker: 'GIL',
      headline: 'Fix Oxygen Generation System!',
      body: 'Restore the Oxygen Generation System so our whole crew keeps breathing easy!',
      scienceTip: NASA_REFERENCE_DATA[0].fact,
      urgency: 'warning',
      emotion: 'concerned',
    };
  }

  if (state.buildings.water_recycling.status === 'inactive') {
    return {
      id: `water_priority_${state.day}`,
      speaker: 'GIL',
      headline: 'Water Recovery System Needs Us!',
      body: 'Restore the Water Recovery System to reuse 75% of every drop of water!',
      urgency: 'warning',
      emotion: 'concerned',
    };
  }

  if (state.buildings.greenhouse.status === 'inactive') {
    return {
      id: `greenhouse_priority_${state.day}`,
      speaker: 'GIL',
      headline: 'Let’s Rebuild the Greenhouse!',
      body: 'Once the glass dome is fixed, we can grow our own Martian snacks!',
      urgency: 'warning',
      emotion: 'excited',
    };
  }

  if (!state.greenhouseCrop && state.day <= 22) {
    return {
      id: `plant_prompt_${state.day}`,
      speaker: 'GIL',
      headline: 'Time to Plant Seeds!',
      body: 'Tap the Greenhouse to plant Mars Potatoes or Wheat!',
      urgency: 'info',
      emotion: 'happy',
    };
  }

  if (state.buildings.radiation_shelter.status === 'inactive') {
    return {
      id: `shelter_prompt_${state.day}`,
      speaker: 'GIL',
      headline: 'Fix the Radiation Storm Shelter!',
      body: 'Restore the Radiation Storm Shelter so our crew stays safe during solar storms!',
      scienceTip: NASA_REFERENCE_DATA[2].fact,
      urgency: 'warning',
      emotion: 'concerned',
    };
  }

  if (state.buildings.solar_panels.dustLevel >= 35) {
    return {
      id: `dust_prompt_${state.day}`,
      speaker: 'GIL',
      headline: 'Dusty Solar Panels!',
      body: `Thick red dust (${state.buildings.solar_panels.dustLevel}%) is blocking sunlight. Let’s brush them clean!`,
      urgency: 'warning',
      emotion: 'concerned',
    };
  }

  if (state.day >= 26 && state.day < 29) {
    return {
      id: `prep_29_${state.day}`,
      speaker: 'GIL',
      headline: 'Giant Storm Coming Soon!',
      body: 'Day 29 brings a planet-wide dust storm. Let’s repair weak buildings now!',
      urgency: 'warning',
      emotion: 'worried',
    };
  }

  if (state.day === 30) {
    return {
      id: 'day30_final',
      speaker: 'GIL',
      headline: 'Day 30—Final Stretch!',
      body: 'We almost made it all 30 days! Fix any damage, then tap FINISH DAY 30!',
      urgency: 'info',
      emotion: 'excited',
    };
  }

  return {
    id: `steady_${state.day}`,
    speaker: 'GIL',
    headline: 'Everything Looks Great!',
    body: 'Nice teamwork! Keep systems healthy and watch crew energy.',
    scienceTip: NASA_REFERENCE_DATA[state.day % NASA_REFERENCE_DATA.length].fact,
    urgency: 'info',
    emotion: 'happy',
  };
}

export function getPostDaySummaryGilHint(
  state: GameState,
  prevSummary?: DaySummary | null
): GilMessage {
  const shortages = detectResourceShortages(state.resources);

  if (prevSummary?.fatiguePenalty && prevSummary.fatiguePenalty > 0) {
    return {
      id: `hint_fatigue_${state.day}`,
      speaker: 'GIL',
      headline: `Good Morning, Day ${state.day}!`,
      body: 'The crew stayed up late yesterday! Try finishing tasks before 9:00 PM or tap Rest today.',
      urgency: 'warning',
      emotion: 'concerned',
    };
  }

  if (prevSummary?.buildingImpacts && prevSummary.buildingImpacts.length > 0) {
    const firstHit = BUILDING_DEFINITIONS[prevSummary.buildingImpacts[0].buildingId].name;
    return {
      id: `hint_repair_${state.day}`,
      speaker: 'GIL',
      headline: `Day ${state.day} Checkup!`,
      body: `Yesterday’s weather scratched ${firstHit}. Tap damaged buildings to patch them up!`,
      urgency: 'warning',
      emotion: 'concerned',
    };
  }

  if (state.greenhouseCrop?.isMature) {
    return {
      id: `hint_harvest_${state.day}`,
      speaker: 'GIL',
      headline: `Harvest Time on Day ${state.day}!`,
      body: 'Your Greenhouse crops are ripe and ready! Harvest them soon and plant new seeds.',
      urgency: 'info',
      emotion: 'excited',
    };
  }

  if (shortages.length > 0) {
    const res = shortages[0];
    const targetHint =
      res === 'oxygen'
        ? 'Check the Oxygen Generation System right away!'
        : res === 'water'
        ? 'Check the Water Recovery System to save more water!'
        : res === 'food'
        ? 'Visit the Greenhouse to plant or harvest food!'
        : 'Brush dust off or repair the Solar Panels!';
    return {
      id: `hint_shortage_${state.day}`,
      speaker: 'GIL',
      headline: `Heads Up on Day ${state.day}!`,
      body: `Our ${res} reserve is running low. ${targetHint}`,
      urgency: 'alert',
      emotion: 'worried',
    };
  }

  if (state.buildings.oxygen_generator.status === 'inactive') {
    return {
      id: `hint_o2_${state.day}`,
      speaker: 'GIL',
      headline: `Day ${state.day} Priority!`,
      body: 'Let’s restore the Oxygen Generation System today so our crew never runs short of air.',
      urgency: 'warning',
      emotion: 'concerned',
    };
  }

  if (state.buildings.water_recycling.status === 'inactive') {
    return {
      id: `hint_h2o_${state.day}`,
      speaker: 'GIL',
      headline: `Day ${state.day} Priority!`,
      body: 'Restore the Water Recovery System next so we reuse 75% of every drop of water!',
      urgency: 'warning',
      emotion: 'concerned',
    };
  }

  if (state.buildings.greenhouse.status === 'inactive') {
    return {
      id: `hint_greenhouse_${state.day}`,
      speaker: 'GIL',
      headline: `Day ${state.day} Priority!`,
      body: 'Restore the Greenhouse and plant crops early—fresh Mars food takes several days to grow!',
      urgency: 'info',
      emotion: 'excited',
    };
  }

  if (state.buildings.radiation_shelter.status === 'inactive') {
    return {
      id: `hint_shelter_${state.day}`,
      speaker: 'GIL',
      headline: `Safety Tip for Day ${state.day}!`,
      body: 'Restore the Radiation Storm Shelter soon so everyone has a safe bunker for solar storms.',
      urgency: 'warning',
      emotion: 'concerned',
    };
  }

  if (state.day >= 26 && state.day < 29) {
    return {
      id: `hint_storm_prep_${state.day}`,
      speaker: 'GIL',
      headline: 'Big Storm Ahead!',
      body: 'A giant dust storm hits on Day 29. Repair weak systems and fill reserves while skies are clear!',
      urgency: 'warning',
      emotion: 'worried',
    };
  }

  if (state.day === 30) {
    return {
      id: 'hint_day30',
      speaker: 'GIL',
      headline: 'Final Day on Mars!',
      body: 'We made it to Day 30! Repair any leftover damage before our 150-day readiness check.',
      urgency: 'info',
      emotion: 'excited',
    };
  }

  return {
    id: `hint_morning_${state.day}`,
    speaker: 'GIL',
    headline: `Rise & Shine, Day ${state.day}!`,
    body: `Today’s tip: ${getNextObjectiveLine(state)}. Remember, time keeps ticking!`,
    urgency: 'info',
    emotion: 'happy',
  };
}

import { EventDefinition } from '../types/event';

export const EVENT_DEFINITIONS: Record<string, EventDefinition> = {
  // MINOR EVENT POOL (5 distinct Martian phenomena)
  marsquake: {
    id: 'marsquake',
    phenomenon: 'marsquake',
    title: 'Marsquake!',
    severity: 'minor',
    summary: 'The rocky Mars ground rumbles and shakes outpost pipes and tanks!',
    scienceContext:
      'NASA’s InSight lander detected hundreds of real marsquakes caused by Mars cooling and cracking underground.',
    recommendedAction: 'Check shaken life-support buildings and repair any cracks.',
    targetBuildings: ['oxygen_generator', 'water_recycling', 'main_habitat', 'oxygen_storage'],
    conditionDamage: 12,
    resourceLoss: { oxygen: 5, water: 5 },
  },
  secondary_neutron_cascades: {
    id: 'secondary_neutron_cascades',
    phenomenon: 'secondary_neutron_cascades',
    title: 'Secondary Neutron Cascades',
    severity: 'minor',
    summary: 'Space rays hit the Martian soil and bounce back up as glowing neutron bursts!',
    scienceContext:
      'Because Mars has thin air, cosmic rays strike the rocky ground and splash secondary neutrons upward around habitats.',
    recommendedAction: 'Hide crew in the Radiation Shelter and check electronics.',
    radiationLevel: 16,
    targetBuildings: ['radiation_shelter', 'energy_storage', 'oxygen_generator'],
    conditionDamage: 10,
    resourceLoss: { energy: 5 },
  },
  water_ice_cloud_formation: {
    id: 'water_ice_cloud_formation',
    phenomenon: 'water_ice_clouds',
    title: 'Water Ice Cloud Formation',
    severity: 'minor',
    summary: 'Icy blue-white clouds drift high across the sky, dimming sunlight and chilling tanks!',
    scienceContext:
      'High above Mars, tiny water-ice crystals form wispy clouds that scatter sunlight and cool the surface below.',
    recommendedAction: 'Watch Solar power and check the Water Tanks and Greenhouse.',
    solarPenaltyFactor: 0.25,
    cropGrowthPenalty: 0.3,
    targetBuildings: ['water_storage', 'greenhouse'],
    conditionDamage: 9,
    resourceLoss: { energy: 6 },
  },
  dust_devils: {
    id: 'dust_devils',
    phenomenon: 'dust_devils',
    title: 'Dust Devils',
    severity: 'minor',
    summary: 'Spinning red dust tornadoes swirl across Jezero Crater and coat the Solar Panels!',
    scienceContext:
      'Warm Mars ground heats thin air, creating tall spinning dust devils that NASA rovers capture on camera.',
    recommendedAction: 'Brush the red dust off your Solar Panels for full power.',
    solarPenaltyFactor: 0.3,
    dustAdded: 40,
    targetBuildings: ['solar_panels', 'maintenance_facility'],
    conditionDamage: 8,
  },
  solar_flare_xray_uv: {
    id: 'solar_flare_xray_uv',
    phenomenon: 'solar_flare_xray_uv',
    title: 'Solar Flare X-rays & UV Waves',
    severity: 'minor',
    summary: 'Bright flashes of X-rays and ultraviolet waves sweep down from a Sun flare!',
    scienceContext:
      'Mars lacks Earth’s thick ozone layer and magnetic shield, so solar flare X-rays and UV waves reach the outpost.',
    recommendedAction: 'Shield the crew if possible and check Solar Panels & Habitat.',
    solarPenaltyFactor: 0.2,
    radiationLevel: 14,
    targetBuildings: ['solar_panels', 'main_habitat'],
    conditionDamage: 9,
    resourceLoss: { energy: 5 },
  },

  // FIXED MAJOR EVENTS
  solar_storm_response: {
    id: 'solar_storm_response',
    phenomenon: 'solar_storm_response',
    title: 'Solar Storm Response',
    severity: 'major',
    summary: 'A powerful solar storm sends glowing radiation ribbons straight toward Mars!',
    scienceContext:
      'NASA space-weather satellites alert astronauts when giant solar storms launch bursts of radiation across space.',
    recommendedAction: 'Move the crew into the Radiation Shelter right away!',
    radiationLevel: 38,
    crewEnergyImpact: 12,
    solarPenaltyFactor: 0.35,
    targetBuildings: ['radiation_shelter', 'solar_panels', 'main_habitat'],
    conditionDamage: 14,
  },
  solar_energetic_particles: {
    id: 'solar_energetic_particles',
    phenomenon: 'solar_energetic_particles',
    title: 'Solar Energetic Particles',
    severity: 'major',
    summary: 'Super-fast charged particles from the Sun crackle against outpost shields and wiring!',
    scienceContext:
      'Solar energetic particles travel at near light speed and can zap electronics and expose astronauts outside bunkers.',
    recommendedAction: 'Hide crew inside the Radiation Shelter and repair zapped systems!',
    radiationLevel: 44,
    crewEnergyImpact: 14,
    targetBuildings: ['radiation_shelter', 'oxygen_generator', 'energy_storage'],
    conditionDamage: 16,
    resourceLoss: { energy: 8 },
  },
  global_dust_storm: {
    id: 'global_dust_storm',
    phenomenon: 'global_dust_storm',
    title: 'Global Dust Storm',
    severity: 'super_major',
    summary:
      'A planet-wide Martian dust storm blankets the sky and slams every outpost system on Day 29!',
    scienceContext:
      'Global dust storms on Mars can wrap the entire planet in dark dust clouds for weeks, testing every backup system.',
    recommendedAction:
      'Shelter the crew, lean on backup tanks, then repair and clean systems on Day 30.',
    solarPenaltyFactor: 0.8,
    radiationLevel: 36,
    dustAdded: 80,
    crewEnergyImpact: 18,
    targetBuildings: [
      'solar_panels',
      'oxygen_generator',
      'water_recycling',
      'greenhouse',
      'main_habitat',
    ],
    conditionDamage: 22,
    resourceLoss: { energy: 12, oxygen: 8, water: 8 },
  },
};

export const MINOR_EVENT_IDS = [
  'marsquake',
  'secondary_neutron_cascades',
  'water_ice_cloud_formation',
  'dust_devils',
  'solar_flare_xray_uv',
] as const;

export const MAJOR_EVENT_IDS = [
  'solar_storm_response',
  'solar_energetic_particles',
  'global_dust_storm',
] as const;

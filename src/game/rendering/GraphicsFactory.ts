import Phaser from 'phaser';
import { BuildingId, BuildingState } from '../../types/building';
import { EventPhenomenon } from '../../types/event';
import { PlantedCrop } from '../../types/game';

export const PALETTE = {
  marsRed: 0xb94f32,
  marsDark: 0x993e25,
  terracotta: 0xd77b4a,
  sand: 0xe9b77b,
  cream: 0xf1d8a8,
  creamLight: 0xfaf0dc,
  charcoal: 0x292c2b,
  lifeGreen: 0x718b78,
  lifeGreenBright: 0x89aa91,
  techBlue: 0x477c9b,
  techBlueLight: 0x6ca4c4,
  alertRed: 0xc94b43,
  shadow: 0x292c2b,
  wreckMetal: 0x5c534e,
  wreckDark: 0x423b37,
};

function lerpRgb(c1: number, c2: number, t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  const r1 = (c1 >> 16) & 0xff;
  const g1 = (c1 >> 8) & 0xff;
  const b1 = c1 & 0xff;
  const r2 = (c2 >> 16) & 0xff;
  const g2 = (c2 >> 8) & 0xff;
  const b2 = c2 & 0xff;
  const r = Math.round(r1 + (r2 - r1) * clamped);
  const g = Math.round(g1 + (g2 - g1) * clamped);
  const b = Math.round(b1 + (b2 - b1) * clamped);
  return (r << 16) | (g << 8) | b;
}

function drawDebrisChunks(
  g: Phaser.GameObjects.Graphics,
  innerX: number,
  innerY: number,
  innerW: number,
  innerH: number,
  cause?: EventPhenomenon | 'wear'
) {
  g.fillStyle(PALETTE.wreckDark, 1);
  g.lineStyle(2, PALETTE.charcoal, 1);
  g.fillRect(innerX + 8, innerY + innerH - 18, 12, 8);
  g.strokeRect(innerX + 8, innerY + innerH - 18, 12, 8);
  g.fillRect(innerX + innerW - 22, innerY + 10, 10, 9);
  g.strokeRect(innerX + innerW - 22, innerY + 10, 10, 9);

  if (cause === 'solar_energetic_particles' || cause === 'secondary_neutron_cascades') {
    g.fillStyle(PALETTE.techBlueLight, 0.95);
    g.fillTriangle(innerX + innerW * 0.62, innerY + innerH - 12, innerX + innerW * 0.72, innerY + innerH - 20, innerX + innerW * 0.76, innerY + innerH - 10);
    g.fillStyle(0xf4c552, 0.95);
    g.fillCircle(innerX + innerW * 0.25, innerY + 14, 4);
  } else {
    g.fillStyle(PALETTE.terracotta, 0.9);
    g.fillCircle(innerX + innerW * 0.65, innerY + innerH - 14, 5);
    g.fillCircle(innerX + innerW * 0.25, innerY + 14, 4);
  }
}

function drawEventSpecificDamage(
  g: Phaser.GameObjects.Graphics,
  innerX: number,
  innerY: number,
  innerW: number,
  innerH: number,
  cause: EventPhenomenon | 'wear' | undefined,
  heavy: boolean
) {
  if (cause === 'marsquake') {
    // Deep jagged tectonic cracks + displaced brick/concrete rubble fragments
    g.fillStyle(PALETTE.wreckDark, 0.85);
    g.fillRect(innerX + 10, innerY + innerH - 15, 11, 7);
    g.fillRect(innerX + innerW - 24, innerY + 12, 9, 6);
    g.fillStyle(PALETTE.terracotta, 0.9);
    g.fillCircle(innerX + 24, innerY + innerH - 10, 4);
    g.fillCircle(innerX + innerW - 16, innerY + innerH - 16, 4.5);

    g.lineStyle(heavy ? 3.5 : 3, PALETTE.charcoal, 0.96);
    g.lineBetween(innerX + 8, innerY + 10, innerX + innerW * 0.36, innerY + innerH * 0.42);
    g.lineBetween(innerX + innerW * 0.36, innerY + innerH * 0.42, innerX + innerW * 0.24, innerY + innerH * 0.72);
    g.lineBetween(innerX + innerW * 0.36, innerY + innerH * 0.42, innerX + innerW * 0.56, innerY + innerH * 0.52);
    g.lineBetween(innerX + innerW - 10, innerY + innerH - 12, innerX + innerW * 0.62, innerY + innerH * 0.6);
    g.lineStyle(1.6, PALETTE.alertRed, 0.78);
    g.lineBetween(innerX + 10, innerY + 12, innerX + innerW * 0.35, innerY + innerH * 0.43);
    return;
  }

  if (cause === 'solar_storm_response' || cause === 'solar_flare_xray_uv') {
    // Charred scorch blotches, singed corners & burnt amber heat cracks
    g.fillStyle(PALETTE.charcoal, heavy ? 0.52 : 0.34);
    g.fillEllipse(innerX + innerW * 0.32, innerY + innerH * 0.35, 34, 20);
    g.fillEllipse(innerX + innerW * 0.74, innerY + innerH * 0.7, 26, 16);
    g.fillStyle(0xf59e0b, heavy ? 0.36 : 0.24);
    g.fillEllipse(innerX + innerW * 0.32, innerY + innerH * 0.35, 18, 10);

    g.lineStyle(2.6, 0xea580c, 0.92);
    g.lineBetween(innerX + 12, innerY + 14, innerX + 30, innerY + 28);
    g.lineBetween(innerX + 30, innerY + 28, innerX + 20, innerY + 44);
    if (heavy) {
      g.lineBetween(innerX + innerW - 14, innerY + innerH - 14, innerX + innerW - 32, innerY + innerH - 28);
    }
    return;
  }

  if (cause === 'solar_energetic_particles' || cause === 'secondary_neutron_cascades') {
    // Zap burn ring + shattered casing shards + snapped sparking wires
    g.fillStyle(0x1f2438, heavy ? 0.44 : 0.3);
    g.fillCircle(innerX + innerW * 0.68, innerY + innerH * 0.36, 14);
    g.lineStyle(2.2, 0x8be2ff, 0.9);
    g.lineBetween(innerX + innerW * 0.58, innerY + innerH * 0.34, innerX + innerW * 0.7, innerY + innerH * 0.24);
    g.lineBetween(innerX + innerW * 0.7, innerY + innerH * 0.24, innerX + innerW * 0.78, innerY + innerH * 0.42);
    g.lineStyle(2.2, 0xf4c552, 0.92);
    g.lineBetween(innerX + 14, innerY + innerH - 18, innerX + 25, innerY + innerH - 26);
    g.lineBetween(innerX + 25, innerY + innerH - 26, innerX + 32, innerY + innerH - 15);
    g.fillStyle(PALETTE.techBlueLight, 0.9);
    g.fillTriangle(innerX + 14, innerY + 14, innerX + 24, innerY + 18, innerX + 16, innerY + 26);
    return;
  }

  if (cause === 'global_dust_storm' || cause === 'dust_devils') {
    // Piled terracotta sandbanks along lower rim/corners + wind-scratched grit
    g.fillStyle(PALETTE.terracotta, heavy ? 0.76 : 0.58);
    g.fillEllipse(innerX + innerW * 0.28, innerY + innerH - 8, 36, 14);
    g.fillEllipse(innerX + innerW * 0.74, innerY + innerH - 6, 30, 12);
    g.fillStyle(PALETTE.sand, heavy ? 0.72 : 0.54);
    g.fillEllipse(innerX + innerW * 0.26, innerY + innerH - 10, 22, 8);
    g.fillCircle(innerX + innerW * 0.64, innerY + 18, 4.5);
    g.fillCircle(innerX + 18, innerY + 22, 4);
    // Scratched storm hull marks
    g.lineStyle(2, PALETTE.marsDark, 0.85);
    g.lineBetween(innerX + 12, innerY + 18, innerX + 34, innerY + 26);
    g.lineBetween(innerX + innerW - 34, innerY + innerH - 28, innerX + innerW - 14, innerY + innerH - 20);
    return;
  }

  if (cause === 'water_ice_clouds') {
    // Frost-chilled blue-white ice patches & cold stress cracks
    g.fillStyle(0xdcf4ff, heavy ? 0.62 : 0.45);
    g.fillEllipse(innerX + 22, innerY + 18, 22, 12);
    g.fillEllipse(innerX + innerW - 22, innerY + innerH - 16, 24, 12);
    g.lineStyle(2.2, 0x8be2ff, 0.9);
    g.lineBetween(innerX + 14, innerY + 14, innerX + 28, innerY + 28);
    g.lineBetween(innerX + 28, innerY + 28, innerX + 20, innerY + 42);
    return;
  }

  // Default wear cracks & grime patch
  g.fillStyle(PALETTE.charcoal, heavy ? 0.28 : 0.16);
  g.fillEllipse(innerX + innerW * 0.28, innerY + innerH * 0.36, 28, 16);

  g.lineStyle(heavy ? 3 : 2.5, heavy ? PALETTE.alertRed : PALETTE.charcoal, 0.95);
  g.lineBetween(innerX + 10, innerY + 12, innerX + 26, innerY + 28);
  g.lineBetween(innerX + 26, innerY + 28, innerX + 18, innerY + 46);
  g.lineBetween(innerX + 26, innerY + 28, innerX + 36, innerY + 24);
  if (heavy) {
    g.lineBetween(innerX + innerW - 14, innerY + innerH - 14, innerX + innerW - 34, innerY + innerH - 30);
    g.lineBetween(innerX + innerW - 34, innerY + innerH - 30, innerX + innerW - 26, innerY + innerH - 46);
  }
}

export function drawBuildingGraphics(
  g: Phaser.GameObjects.Graphics,
  id: BuildingId,
  width: number,
  height: number,
  state: BuildingState,
  crop: PlantedCrop | null,
  animPhase = 0,
  extra?: {
    inShelter?: boolean;
    isSleeping?: boolean;
    shadowDx?: number;
    shadowDy?: number;
    shadowAlpha?: number;
    shadowColor?: number;
    nightFactor?: number;
    sunBias?: number;
    rimColor?: number;
    rimAlpha?: number;
  }
) {
  g.clear();

  const pad = 6;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const x = -width / 2 + pad;
  const y = -height / 2 + pad;

  const isInactive = state.status === 'inactive';
  const isDamaged = state.status === 'damaged';
  const isOperational = state.status === 'operational';
  const nightFactor = extra?.nightFactor ?? 0;
  const sunBias = extra?.sunBias ?? 0;

  // Soft two-pass color-graded directional shadow (cool violet/indigo shadows for warm/cool depth)
  const shadowDx = extra?.shadowDx ?? 4;
  const shadowDy = extra?.shadowDy ?? 6;
  const baseShadowAlpha = extra?.shadowAlpha ?? 0.32;
  const shadowColor = extra?.shadowColor ?? PALETTE.shadow;
  const effectiveShadowAlpha = isInactive ? baseShadowAlpha * 0.62 : baseShadowAlpha;
  g.fillStyle(shadowColor, effectiveShadowAlpha * 0.42);
  g.fillRoundedRect(x + shadowDx * 1.25 - 2, y + shadowDy * 1.25 - 1, w + 4, h + 3, 12);
  g.fillStyle(shadowColor, effectiveShadowAlpha);
  g.fillRoundedRect(x + shadowDx, y + shadowDy, w, h, 10);

  // Foundation pad (cracked dark stone when inactive, warm concrete pad when operational)
  g.fillStyle(isInactive ? PALETTE.wreckDark : isDamaged ? 0x776b64 : 0x9d9187, 1);
  g.lineStyle(3, isInactive ? PALETTE.alertRed : isDamaged ? PALETTE.terracotta : PALETTE.charcoal, 1);
  g.fillRoundedRect(x, y, w, h, 8);
  g.strokeRoundedRect(x, y, w, h, 8);

  // Directional sunlight rim during day/sunset, blending smoothly to cool ambient moonlight rim at night
  const rimAlpha = extra?.rimAlpha ?? 0.32;
  const rimColor = extra?.rimColor ?? 0xffe4b5;
  if (rimAlpha > 0.02) {
    g.lineStyle(3, rimColor, rimAlpha);
    if (nightFactor >= 0.55) {
      // Cool ambient moonlight rim on top & upper-left edge so structures pop crisply at night
      g.lineBetween(x + 6, y + 2, x + w - 6, y + 2);
      g.lineBetween(x + 2, y + 6, x + 2, y + h * 0.72);
    } else if (sunBias <= -0.15) {
      // Morning/Sunrise sun from East (right + top-right edge)
      g.lineBetween(x + w - 2, y + 6, x + w - 2, y + h - 6);
      g.lineBetween(x + w * 0.35, y + 2, x + w - 6, y + 2);
    } else if (sunBias >= 0.15) {
      // Afternoon/Sunset sun from West (left + top-left edge)
      g.lineBetween(x + 2, y + 6, x + 2, y + h - 6);
      g.lineBetween(x + 6, y + 2, x + w * 0.65, y + 2);
    } else {
      // Midday sun from overhead (top edge)
      g.lineBetween(x + 6, y + 2, x + w - 6, y + 2);
    }
  }

  const innerX = x + 6;
  const innerY = y + 6;
  const innerW = w - 12;
  const innerH = h - 12;

  switch (id) {
    case 'main_habitat': {
      // Pressurized cozy Mars dome habitat
      g.fillStyle(isInactive ? PALETTE.wreckMetal : PALETTE.cream, 1);
      g.lineStyle(2.5, PALETTE.charcoal, 1);
      g.fillRoundedRect(innerX, innerY, innerW, innerH, 20);
      g.strokeRoundedRect(innerX, innerY, innerW, innerH, 20);

      // Inner dome highlight ring
      g.fillStyle(isInactive ? PALETTE.wreckDark : PALETTE.creamLight, 1);
      g.lineStyle(2, PALETTE.charcoal, 0.7);
      g.fillRoundedRect(innerX + 10, innerY + 10, innerW - 20, innerH - 28, 14);
      g.strokeRoundedRect(innerX + 10, innerY + 10, innerW - 20, innerH - 28, 14);

      // Rooftop thermal ribs
      g.fillStyle(isDamaged ? PALETTE.terracotta : PALETTE.sand, 1);
      g.lineStyle(2, PALETTE.charcoal, 1);
      g.fillRoundedRect(innerX + 16, innerY + 14, innerW - 44, 12, 4);
      g.strokeRoundedRect(innerX + 16, innerY + 14, innerW - 44, 12, 4);

      // Central skylight atrium on spacious 3x3 main habitat
      if (innerW >= 150 && innerH >= 150) {
        const skyR = 26;
        const skyX = innerX + innerW / 2;
        const skyY = innerY + innerH * 0.48;
        g.fillStyle(isInactive ? PALETTE.wreckDark : PALETTE.sand, 1);
        g.lineStyle(2.2, PALETTE.charcoal, 1);
        g.fillCircle(skyX, skyY, skyR + 5);
        g.strokeCircle(skyX, skyY, skyR + 5);
        g.fillStyle(
          isInactive
            ? 0x3b4042
            : Math.max(nightFactor, extra?.isSleeping ? 0.92 : 0) > 0.25
            ? 0xffd97d
            : PALETTE.techBlueLight,
          1
        );
        g.fillCircle(skyX, skyY, skyR);
        g.strokeCircle(skyX, skyY, skyR);
        g.lineStyle(1.8, PALETTE.charcoal, 0.55);
        g.lineBetween(skyX - skyR + 4, skyY, skyX + skyR - 4, skyY);
        g.lineBetween(skyX, skyY - skyR + 4, skyX, skyY + skyR - 4);
      }

      // Illuminated circular porthole windows (warmer golden glow at night or while sleeping!)
      const windowGlowStrength = Math.max(nightFactor, extra?.isSleeping ? 0.92 : 0);
      const winColor = isOperational
        ? windowGlowStrength > 0.25
          ? 0xffd97d
          : PALETTE.techBlueLight
        : isDamaged && windowGlowStrength > 0.3
        ? 0xd99b52
        : 0x3b4042;
      if (!isInactive && windowGlowStrength > 0.1) {
        g.fillStyle(0xffd97d, windowGlowStrength * 0.42);
        g.fillCircle(innerX + 28, innerY + innerH - 36, 17);
        g.fillCircle(innerX + innerW - 28, innerY + innerH - 36, 17);
      }
      g.fillStyle(winColor, 1);
      g.lineStyle(2.2, PALETTE.charcoal, 1);
      g.fillCircle(innerX + 28, innerY + innerH - 36, 11);
      g.strokeCircle(innerX + 28, innerY + innerH - 36, 11);
      g.fillCircle(innerX + innerW - 28, innerY + innerH - 36, 11);
      g.strokeCircle(innerX + innerW - 28, innerY + innerH - 36, 11);

      if (isOperational) {
        g.fillStyle(0xffffff, 0.75);
        g.fillCircle(innerX + 25, innerY + innerH - 39, 3);
        g.fillCircle(innerX + innerW - 31, innerY + innerH - 39, 3);
      }

      // Front pressurized airlock door + caution trim + warm night porch glow
      if (!isInactive && nightFactor > 0.15) {
        g.fillStyle(0xffd269, nightFactor * 0.32);
        g.fillRoundedRect(innerX + innerW / 2 - 20, innerY + innerH - 28, 40, 28, 8);
      }
      g.fillStyle(isInactive ? PALETTE.wreckDark : PALETTE.marsRed, 1);
      g.lineStyle(2.2, PALETTE.charcoal, 1);
      g.fillRoundedRect(innerX + innerW / 2 - 14, innerY + innerH - 24, 28, 22, 5);
      g.strokeRoundedRect(innerX + innerW / 2 - 14, innerY + innerH - 24, 28, 22, 5);
      g.fillStyle(0xf4c552, 1);
      g.fillRect(innerX + innerW / 2 - 10, innerY + innerH - 8, 20, 4);

      // Comms radar dish + animated green beacon light
      g.fillStyle(PALETTE.creamLight, 1);
      g.lineStyle(2, PALETTE.charcoal, 1);
      g.fillCircle(innerX + innerW - 22, innerY + 24, 11);
      g.strokeCircle(innerX + innerW - 22, innerY + 24, 11);
      if (isOperational) {
        const pulse = 0.5 + 0.5 * Math.sin(animPhase * 3.2);
        g.fillStyle(PALETTE.lifeGreenBright, 0.45 + pulse * 0.55);
        g.fillCircle(innerX + innerW - 22, innerY + 24, 4.5);
      } else {
        g.fillStyle(PALETTE.alertRed, 0.8);
        g.fillCircle(innerX + innerW - 22, innerY + 24, 3.5);
      }
      break;
    }

    case 'solar_panels': {
      // Support rail frame + orange junction box
      g.fillStyle(PALETTE.wreckDark, 1);
      g.fillRoundedRect(innerX, innerY, innerW, innerH, 6);

      // Junction box on right edge
      const jBoxH = Math.min(24, Math.max(14, innerH - 12));
      g.fillStyle(isInactive ? PALETTE.wreckMetal : PALETTE.terracotta, 1);
      g.lineStyle(2, PALETTE.charcoal, 1);
      g.fillRoundedRect(innerX + innerW - 14, innerY + (innerH - jBoxH) * 0.5, 14, jBoxH, 3);
      g.strokeRoundedRect(innerX + innerW - 14, innerY + (innerH - jBoxH) * 0.5, 14, jBoxH, 3);

      const cols = innerH < 72 ? 4 : 3;
      const rows = innerH < 72 ? 1 : 2;
      const cellW = (innerW - 20) / cols;
      const cellH = (innerH - 8 - (rows - 1) * 2) / rows;

      const dayGlow = Math.max(0, 1 - nightFactor * 1.45);
      const panelNightTone = lerpRgb(PALETTE.techBlue, 0x242f4f, Math.min(1, nightFactor * 1.15));
      const gridLineColor = lerpRgb(PALETTE.techBlueLight, 0x455a85, Math.min(1, nightFactor * 1.1));
      const gridLineAlpha = 0.36 + 0.44 * dayGlow;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const px = innerX + 4 + c * (cellW + 2);
          const py = innerY + 4 + r * (cellH + 2);

          if (isInactive && (r + c) % 2 === 0) {
            // Broken missing cell showing exposed frame & sparking wire
            g.lineStyle(2, PALETTE.wreckMetal, 1);
            g.strokeRect(px + 2, py + 2, cellW - 6, cellH - 6);
            g.lineBetween(px + 2, py + 2, px + cellW - 4, py + cellH - 4);
            g.lineStyle(1.8, 0xf4c552, 0.85);
            g.lineBetween(px + 6, py + cellH / 2, px + 14, py + cellH / 2 - 4);
            continue;
          }

          if (isInactive) {
            g.fillStyle(0x4a5154, 1);
          } else if (isDamaged && ((rows === 1 && c === 2) || (rows > 1 && r === 1 && c === 1))) {
            g.fillStyle(0x524944, 1);
          } else {
            g.fillStyle(panelNightTone, 1);
          }

          g.fillRect(px, py, cellW - 2, cellH - 2);
          g.lineStyle(2, PALETTE.charcoal, 1);
          g.strokeRect(px, py, cellW - 2, cellH - 2);

          if (!isInactive) {
            // Photovoltaic grid lines dim consistently as darkness falls
            g.lineStyle(1.3, gridLineColor, gridLineAlpha);
            g.lineBetween(px + 3, py + cellH * 0.33, px + cellW - 5, py + cellH * 0.33);
            g.lineBetween(px + 3, py + cellH * 0.66, px + cellW - 5, py + cellH * 0.66);
            g.lineBetween(px + cellW * 0.5, py + 3, px + cellW * 0.5, py + cellH - 5);

            // Animated sunlight glint wave fades smoothly during sunset and stops completely at night
            if (isOperational && state.dustLevel < 35 && dayGlow > 0.02) {
              const glint = 0.3 + 0.5 * Math.sin(animPhase * 2.4 + c * 0.8 + r);
              const glintColor = sunBias > 0.25 ? 0xffd69e : 0xffffff;
              g.lineStyle(2, glintColor, glint * 0.55 * dayGlow);
              g.lineBetween(px + 4, py + 4, px + cellW - 8, py + cellH - 8);
            }
          }
        }
      }

      // Red dust film + speckles proportional to dustLevel
      if (state.dustLevel > 10) {
        const dustAlpha = Math.min(0.74, (state.dustLevel / 100) * 0.74);
        g.fillStyle(PALETTE.terracotta, dustAlpha);
        g.fillRoundedRect(innerX, innerY, innerW - 10, innerH, 6);
        g.fillStyle(PALETTE.marsDark, Math.min(0.65, dustAlpha));
        g.fillCircle(innerX + 24, innerY + innerH * 0.42, 5.5);
        g.fillCircle(innerX + innerW - 36, innerY + innerH * 0.58, 7);
        g.fillCircle(innerX + innerW * 0.48, innerY + innerH * 0.48, 5);
      }
      break;
    }

    case 'energy_storage': {
      // Copper battery terminal caps on top
      g.fillStyle(isInactive ? PALETTE.wreckDark : 0xf4c552, 1);
      g.lineStyle(2, PALETTE.charcoal, 1);
      g.fillRoundedRect(innerX + 8, innerY - 2, 12, 7, 2);
      g.strokeRoundedRect(innerX + 8, innerY - 2, 12, 7, 2);
      g.fillRoundedRect(innerX + innerW - 20, innerY - 2, 12, 7, 2);
      g.strokeRoundedRect(innerX + innerW - 20, innerY - 2, 12, 7, 2);

      g.fillStyle(isInactive ? PALETTE.wreckMetal : PALETTE.cream, 1);
      g.lineStyle(2.5, PALETTE.charcoal, 1);
      g.fillRoundedRect(innerX, innerY + 3, innerW, innerH - 3, 6);
      g.strokeRoundedRect(innerX, innerY + 3, innerW, innerH - 3, 6);

      const barH = (innerH - 26) / 3;
      for (let i = 0; i < 3; i++) {
        const by = innerY + 10 + i * (barH + 4);
        if ((isInactive && i < 2) || (isDamaged && i === 0)) {
          g.fillStyle(PALETTE.wreckDark, 1);
          g.fillRoundedRect(innerX + 6, by, innerW - 12, barH, 4);
          g.strokeRoundedRect(innerX + 6, by, innerW - 12, barH, 4);
        } else {
          g.fillStyle(isInactive ? 0x555c60 : PALETTE.techBlue, 1);
          g.fillRoundedRect(innerX + 6, by, innerW - 12, barH, 4);
          g.strokeRoundedRect(innerX + 6, by, innerW - 12, barH, 4);
          if (isOperational) {
            const glow = 0.65 + 0.35 * Math.sin(animPhase * 3 + i * 0.9);
            g.fillStyle(0xf4c552, glow);
            g.fillRoundedRect(innerX + 10, by + 5, innerW - 20, 6, 2);
          }
        }
      }
      break;
    }

    case 'oxygen_generator': {
      // MOXIE oxygen maker with twin spinning turbines and O2 cyan core
      g.fillStyle(isInactive ? PALETTE.wreckMetal : PALETTE.cream, 1);
      g.lineStyle(2.5, PALETTE.charcoal, 1);
      g.fillRoundedRect(innerX, innerY, innerW, innerH, 10);
      g.strokeRoundedRect(innerX, innerY, innerW, innerH, 10);

      // Intake grille bar across top
      const grilleY = innerY + 4;
      const grilleH = innerH < 72 ? 7 : 10;
      g.fillStyle(isInactive ? PALETTE.wreckDark : PALETTE.sand, 1);
      g.fillRoundedRect(innerX + 10, grilleY, innerW - 20, grilleH, 3);
      g.strokeRoundedRect(innerX + 10, grilleY, innerW - 20, grilleH, 3);

      const cx1 = innerX + innerW * 0.34;
      const cy1 = grilleY + grilleH + (innerH - (grilleY - innerY + grilleH)) * 0.5;
      const cx2 = innerX + innerW * 0.74;
      const r1 = Math.max(10, Math.min(22, (innerH - grilleH - 10) * 0.44));
      const r2 = Math.max(8, Math.round(r1 * 0.72));

      if (isInactive) {
        g.fillStyle(PALETTE.wreckDark, 1);
        g.fillCircle(cx1, cy1, r1);
        g.strokeCircle(cx1, cy1, r1);
        g.lineBetween(cx1 - r1 * 0.55, cy1 - r1 * 0.55, cx1 + r1 * 0.55, cy1 + r1 * 0.55);
        g.lineBetween(cx1 + r1 * 0.55, cy1 - r1 * 0.55, cx1 - r1 * 0.55, cy1 + r1 * 0.55);

        g.fillStyle(0x525759, 1);
        g.fillCircle(cx2, cy1, r2);
        g.strokeCircle(cx2, cy1, r2);
      } else {
        g.fillStyle(isDamaged ? 0x5d7a8c : PALETTE.techBlueLight, 1);
        g.fillCircle(cx1, cy1, r1);
        g.strokeCircle(cx1, cy1, r1);
        g.fillCircle(cx2, cy1, r2);
        g.strokeCircle(cx2, cy1, r2);

        // Twin spinning turbine fans
        const angle1 = isOperational ? animPhase * 3.8 : 0.4;
        const angle2 = isOperational ? -animPhase * 5.2 : 0.8;
        g.lineStyle(2.6, PALETTE.charcoal, 1);
        for (let b = 0; b < 4; b++) {
          const a1 = angle1 + (b * Math.PI) / 2;
          g.lineBetween(cx1, cy1, cx1 + Math.cos(a1) * (r1 * 0.72), cy1 + Math.sin(a1) * (r1 * 0.72));
        }
        g.lineStyle(2.2, PALETTE.charcoal, 1);
        for (let b = 0; b < 3; b++) {
          const a2 = angle2 + (b * Math.PI * 2) / 3;
          g.lineBetween(cx2, cy1, cx2 + Math.cos(a2) * (r2 * 0.68), cy1 + Math.sin(a2) * (r2 * 0.68));
        }

        // Glowing mint O2 hub rings
        g.fillStyle(PALETTE.creamLight, 1);
        g.fillCircle(cx1, cy1, Math.max(4.5, r1 * 0.28));
        g.strokeCircle(cx1, cy1, Math.max(4.5, r1 * 0.28));
        g.fillStyle(isOperational ? 0x7be0d6 : PALETTE.terracotta, 1);
        g.fillCircle(cx1, cy1, Math.max(2.4, r1 * 0.14));
        g.fillCircle(cx2, cy1, Math.max(3.4, r2 * 0.28));
        g.strokeCircle(cx2, cy1, Math.max(3.4, r2 * 0.28));
      }
      break;
    }

    case 'oxygen_storage': {
      // Crossover pipe connecting twin O2 tanks
      g.fillStyle(isInactive ? PALETTE.wreckDark : PALETTE.sand, 1);
      g.lineStyle(2, PALETTE.charcoal, 1);
      g.fillRect(innerX + innerW / 2 - 5, innerY + innerH * 0.25, 10, innerH * 0.5);
      g.strokeRect(innerX + innerW / 2 - 5, innerY + innerH * 0.25, 10, innerH * 0.5);

      g.fillStyle(isInactive ? PALETTE.wreckMetal : PALETTE.creamLight, 1);
      g.lineStyle(2.5, PALETTE.charcoal, 1);
      g.fillCircle(innerX + innerW / 2, innerY + innerH * 0.28, innerW * 0.39);
      g.strokeCircle(innerX + innerW / 2, innerY + innerH * 0.28, innerW * 0.39);
      if (!isInactive) {
        g.fillCircle(innerX + innerW / 2, innerY + innerH * 0.72, innerW * 0.39);
        g.strokeCircle(innerX + innerW / 2, innerY + innerH * 0.72, innerW * 0.39);
      } else {
        g.fillStyle(PALETTE.wreckDark, 1);
        g.fillCircle(innerX + innerW / 2, innerY + innerH * 0.72, innerW * 0.36);
        g.strokeCircle(innerX + innerW / 2, innerY + innerH * 0.72, innerW * 0.36);
      }

      g.fillStyle(isInactive ? PALETTE.alertRed : isDamaged ? PALETTE.terracotta : PALETTE.techBlue, 1);
      g.fillRect(innerX + 10, innerY + innerH * 0.25, innerW - 20, 7);
      if (!isInactive) {
        g.fillRect(innerX + 10, innerY + innerH * 0.69, innerW - 20, 7);
      }
      // Central pressure dial
      g.fillStyle(PALETTE.creamLight, 1);
      g.lineStyle(2, PALETTE.charcoal, 1);
      g.fillCircle(innerX + innerW / 2, innerY + innerH * 0.5, 8);
      g.strokeCircle(innerX + innerW / 2, innerY + innerH * 0.5, 8);
      g.lineStyle(2, isOperational ? PALETTE.lifeGreen : PALETTE.alertRed, 1);
      g.lineBetween(innerX + innerW / 2, innerY + innerH * 0.5, innerX + innerW / 2 + (isOperational ? 4 : -4), innerY + innerH * 0.5 - 3);
      break;
    }

    case 'water_recycling': {
      // Filtration deck + brass filter cylinder + animated cyan basin + pipe loop
      g.fillStyle(isInactive ? PALETTE.wreckMetal : PALETTE.cream, 1);
      g.lineStyle(2.5, PALETTE.charcoal, 1);
      g.fillRoundedRect(innerX, innerY, innerW, innerH, 8);
      g.strokeRoundedRect(innerX, innerY, innerW, innerH, 8);

      // Filtration basin
      g.fillStyle(isInactive ? PALETTE.wreckDark : isDamaged ? 0x4b6a7a : PALETTE.techBlue, 1);
      g.fillRoundedRect(innerX + 10, innerY + 12, innerW - 20, innerH * 0.56, 8);
      g.strokeRoundedRect(innerX + 10, innerY + 12, innerW - 20, innerH * 0.56, 8);

      if (isOperational) {
        // Multi-wave animated ripples & purification bubbles
        const wave1 = Math.sin(animPhase * 2.8) * 3.5;
        const wave2 = Math.cos(animPhase * 3.2) * 3;
        g.lineStyle(2.2, 0xdcf4ff, 0.85);
        g.lineBetween(innerX + 20, innerY + 28 + wave1, innerX + innerW - 20, innerY + 28 - wave1);
        g.lineStyle(1.8, PALETTE.creamLight, 0.65);
        g.lineBetween(innerX + 26, innerY + 42 + wave2, innerX + innerW - 26, innerY + 42 - wave2);

        const bubbleY = innerY + 46 - ((animPhase * 18) % 24);
        g.fillStyle(0xffffff, 0.8);
        g.fillCircle(innerX + innerW * 0.35, bubbleY, 3);
        g.fillCircle(innerX + innerW * 0.68, innerY + 46 - (((animPhase * 14) + 10) % 24), 2.5);
      } else if (isDamaged) {
        // Leak puddle indicator on damaged water plant
        g.fillStyle(PALETTE.techBlueLight, 0.65);
        g.fillEllipse(innerX + innerW * 0.25, innerY + innerH - 6, 22, 8);
      }

      // Filter drum on top-left corner
      g.fillStyle(isInactive ? PALETTE.wreckDark : PALETTE.sand, 1);
      g.lineStyle(2, PALETTE.charcoal, 1);
      g.fillCircle(innerX + 22, innerY + 18, 9);
      g.strokeCircle(innerX + 22, innerY + 18, 9);

      // Pipe conduits
      g.fillStyle(isInactive ? PALETTE.wreckDark : PALETTE.sand, 1);
      if (isInactive) {
        g.fillRect(innerX + 14, innerY + innerH - 20, 26, 10);
        g.strokeRect(innerX + 14, innerY + innerH - 20, 26, 10);
        g.fillRect(innerX + innerW - 40, innerY + innerH - 20, 26, 10);
        g.strokeRect(innerX + innerW - 40, innerY + innerH - 20, 26, 10);
      } else {
        g.fillRect(innerX + 14, innerY + innerH - 20, innerW - 28, 10);
        g.strokeRect(innerX + 14, innerY + innerH - 20, innerW - 28, 10);
      }
      break;
    }

    case 'water_storage': {
      // Ribbed insulated water reservoir + vertical sight-glass level
      g.fillStyle(isInactive ? PALETTE.wreckMetal : PALETTE.techBlueLight, 1);
      g.lineStyle(2.5, PALETTE.charcoal, 1);
      g.fillRoundedRect(innerX + 4, innerY + 4, innerW - 8, innerH - 8, 12);
      g.strokeRoundedRect(innerX + 4, innerY + 4, innerW - 8, innerH - 8, 12);

      // Insulated tank bands
      g.fillStyle(PALETTE.cream, 1);
      g.fillRect(innerX + 4, innerY + innerH * 0.28, innerW - 8, 7);
      g.fillRect(innerX + 4, innerY + innerH * 0.66, innerW - 8, 7);

      // Clear vertical sight-glass tube on right side
      g.fillStyle(PALETTE.charcoal, 1);
      g.fillRoundedRect(innerX + innerW - 16, innerY + 14, 8, innerH - 28, 3);
      g.fillStyle(isInactive ? PALETTE.wreckDark : 0x8be2ff, 1);
      const fillH = isInactive ? 10 : isDamaged ? (innerH - 32) * 0.5 : innerH - 32;
      g.fillRoundedRect(innerX + innerW - 14, innerY + innerH - 16 - fillH, 4, fillH, 2);

      // Base heater fin
      g.fillStyle(isInactive ? PALETTE.wreckDark : PALETTE.terracotta, 1);
      g.fillRoundedRect(innerX + 10, innerY + innerH - 12, innerW - 28, 6, 2);
      break;
    }

    case 'greenhouse': {
      // Curved glass biodome shell + LED grow light bars + 3 lush planter beds
      g.fillStyle(isInactive ? PALETTE.wreckDark : 0xd4ebdc, isInactive ? 1 : 0.94);
      g.lineStyle(2.5, PALETTE.charcoal, 1);
      g.fillRoundedRect(innerX, innerY, innerW, innerH, 14);
      g.strokeRoundedRect(innerX, innerY, innerW, innerH, 14);

      // Top LED grow-light bar (warmer & brighter inside biodome at night)
      if (!isInactive) {
        const ledPulse = isOperational ? 0.65 + 0.35 * Math.sin(animPhase * 2.5) : 0.3;
        if (nightFactor > 0.1) {
          g.fillStyle(0xffb7df, nightFactor * (isOperational ? 0.28 : 0.14));
          g.fillRoundedRect(innerX + 4, innerY + 4, innerW - 8, innerH - 8, 12);
        }
        g.fillStyle(0xffc9e3, Math.min(1, ledPulse + nightFactor * 0.25));
        g.fillRoundedRect(innerX + 12, innerY + 5, innerW - 24, 5 + nightFactor * 2, 2);
      }

      // 3 planter beds
      const bedW = (innerW - 32) / 3;
      for (let i = 0; i < 3; i++) {
        const bx = innerX + 10 + i * (bedW + 6);
        const by = innerY + 14;
        const bh = innerH - 24;
        g.fillStyle(isInactive ? 0x3b3029 : 0x5c412e, 1);
        g.lineStyle(2, PALETTE.charcoal, 1);
        g.fillRoundedRect(bx, by, bedW, bh, 5);
        g.strokeRoundedRect(bx, by, bedW, bh, 5);

        if (!isInactive && crop) {
          const ratio = Math.min(1, crop.growthProgress / crop.growthDaysRequired);
          const leafRadius = 5 + ratio * 9.5;
          const leafColor = crop.isMature ? 0x9bbf5a : PALETTE.lifeGreenBright;
          for (const rowY of [0.27, 0.54, 0.8]) {
            g.fillStyle(leafColor, 1);
            g.fillCircle(bx + bedW / 2, by + bh * rowY, leafRadius);
            g.fillStyle(0x52725b, 0.5);
            g.fillCircle(bx + bedW / 2 - 3, by + bh * rowY + 2, leafRadius * 0.45);
            if (crop.isMature) {
              // Ripe golden/red produce spots!
              g.fillStyle(crop.cropId === 'mars_potato' ? 0xf4c552 : 0xd77b4a, 1);
              g.fillCircle(bx + bedW / 2 + 4, by + bh * rowY - 3, 3.2);
            }
          }
        } else if (!isInactive) {
          g.fillStyle(PALETTE.lifeGreen, 0.55);
          g.fillCircle(bx + bedW / 2, by + bh * 0.35, 5);
          g.fillCircle(bx + bedW / 2, by + bh * 0.65, 5);
        }
      }

      if (isInactive) {
        // Broken jagged glass roof corner triangles
        g.fillStyle(0x9fb8a8, 0.5);
        g.fillTriangle(innerX, innerY, innerX + 46, innerY, innerX, innerY + 42);
        g.fillTriangle(
          innerX + innerW,
          innerY + innerH,
          innerX + innerW - 50,
          innerY + innerH,
          innerX + innerW,
          innerY + innerH - 42
        );
      }

      // Arch glass mullions
      g.lineStyle(2.5, PALETTE.charcoal, 0.7);
      g.lineBetween(innerX + innerW / 3, innerY, innerX + innerW / 3, innerY + innerH);
      g.lineBetween(innerX + (innerW * 2) / 3, innerY, innerX + (innerW * 2) / 3, innerY + innerH);
      break;
    }

    case 'food_storage': {
      // Chilled vault door(s) + frost strip
      g.fillStyle(isInactive ? PALETTE.wreckMetal : PALETTE.cream, 1);
      g.lineStyle(2.5, PALETTE.charcoal, 1);
      g.fillRoundedRect(innerX, innerY, innerW, innerH, 6);
      g.strokeRoundedRect(innerX, innerY, innerW, innerH, 6);

      // Frost cooling indicator strip
      g.fillStyle(isInactive ? PALETTE.wreckDark : 0x8be2ff, 1);
      g.fillRect(innerX + 6, innerY + 5, innerW - 12, 5);

      if (innerH < 64) {
        // Compact 1x1 chilled circular-wheel vault door
        const doorH = innerH - 19;
        g.fillStyle(isInactive ? PALETTE.wreckDark : PALETTE.lifeGreen, 1);
        g.fillRoundedRect(innerX + 6, innerY + 13, innerW - 12, doorH, 4);
        g.strokeRoundedRect(innerX + 6, innerY + 13, innerW - 12, doorH, 4);
        g.fillStyle(PALETTE.creamLight, 1);
        g.lineStyle(2, PALETTE.charcoal, 1);
        g.fillCircle(innerX + innerW / 2, innerY + 13 + doorH / 2, 7);
        g.strokeCircle(innerX + innerW / 2, innerY + 13 + doorH / 2, 7);
        g.fillStyle(PALETTE.sand, 1);
        g.fillCircle(innerX + innerW / 2, innerY + 13 + doorH / 2, 2.5);
      } else {
        g.fillStyle(isInactive ? PALETTE.wreckDark : PALETTE.lifeGreen, 1);
        g.fillRoundedRect(innerX + 6, innerY + 14, innerW - 12, 24, 3);
        g.strokeRoundedRect(innerX + 6, innerY + 14, innerW - 12, 24, 3);
        g.fillStyle(isInactive ? PALETTE.wreckDark : PALETTE.sand, 1);
        g.fillRoundedRect(innerX + 6, innerY + 44, innerW - 12, 24, 3);
        g.strokeRoundedRect(innerX + 6, innerY + 44, innerW - 12, 24, 3);

        // Vault door latches
        g.fillStyle(PALETTE.creamLight, 1);
        g.fillCircle(innerX + innerW / 2, innerY + 26, 4);
        g.fillCircle(innerX + innerW / 2, innerY + 56, 4);
      }
      break;
    }

    case 'radiation_shelter': {
      // Reinforced regolith bunker frame with transparent armored glass bay so 2x2 crew inside are clearly visible
      g.lineStyle(3, PALETTE.charcoal, 1);
      g.fillStyle(isInactive ? PALETTE.wreckMetal : PALETTE.terracotta, 0.92);
      g.fillRoundedRect(innerX, innerY, innerW, innerH, 10);
      g.strokeRoundedRect(innerX, innerY, innerW, innerH, 10);

      // Reinforced regolith corner armor pads
      g.fillStyle(isInactive ? PALETTE.wreckDark : PALETTE.sand, 1);
      g.fillRect(innerX + 3, innerY + 3, 14, 10);
      g.fillRect(innerX + innerW - 17, innerY + 3, 14, 10);
      g.fillRect(innerX + 3, innerY + innerH - 13, 14, 10);
      g.fillRect(innerX + innerW - 17, innerY + innerH - 13, 14, 10);

      // Transparent interior observation chamber (warm cozy interior light at night so 2x2 crew remain bright & legible)
      const bayX = innerX + 9;
      const bayY = innerY + 10;
      const bayW = innerW - 18;
      const bayH = innerH - 20;
      g.fillStyle(isInactive ? 0x2c3032 : 0xdcf4ff, isInactive ? 0.55 : 0.34);
      g.lineStyle(2.5, PALETTE.charcoal, 1);
      g.fillRoundedRect(bayX, bayY, bayW, bayH, 8);
      if (!isInactive && nightFactor > 0.12) {
        g.fillStyle(0xffdf99, nightFactor * (extra?.inShelter ? 0.24 : 0.14));
        g.fillRoundedRect(bayX + 3, bayY + 3, bayW - 6, bayH - 6, 6);
      }
      g.strokeRoundedRect(bayX, bayY, bayW, bayH, 8);

      // Subtle 2x2 crew floor pads inside transparent bay
      if (!isInactive) {
        g.lineStyle(1.2, 0xfaf0dc, 0.45);
        g.lineBetween(bayX + bayW / 2, bayY + 6, bayX + bayW / 2, bayY + bayH - 6);
        g.lineBetween(bayX + 6, bayY + bayH / 2, bayX + bayW - 6, bayY + bayH / 2);
      }

      // Shield emblem on top rim + active safety beacon
      g.fillStyle(isInactive ? PALETTE.wreckDark : isDamaged ? PALETTE.terracotta : 0xf4c552, 1);
      g.lineStyle(2, PALETTE.charcoal, 1);
      g.fillTriangle(0, innerY - 5, 11, innerY + 9, -11, innerY + 9);
      g.strokeTriangle(0, innerY - 5, 11, innerY + 9, -11, innerY + 9);

      if (!isInactive && extra?.inShelter) {
        const glow = 0.6 + 0.4 * Math.sin(animPhase * 4.5);
        g.fillStyle(PALETTE.lifeGreenBright, glow);
        g.fillCircle(0, innerY + 4, 5);
        g.lineStyle(2, PALETTE.charcoal, 1);
        g.strokeCircle(0, innerY + 4, 5);
      }
      break;
    }

    case 'maintenance_facility': {
      // Open-bay workshop + striped safety apron + gantry crane bar
      g.fillStyle(isInactive ? PALETTE.wreckMetal : PALETTE.sand, 1);
      g.lineStyle(2.5, PALETTE.charcoal, 1);
      g.fillRoundedRect(innerX, innerY, innerW, innerH, 6);
      g.strokeRoundedRect(innerX, innerY, innerW, innerH, 6);

      const bayPadY = innerH < 64 ? 7 : 12;
      const bayH = innerH < 64 ? innerH - 18 : innerH - 28;
      g.fillStyle(isInactive ? PALETTE.wreckDark : PALETTE.creamLight, 1);
      g.fillRect(innerX + 12, innerY + bayPadY, innerW - 24, bayH);
      g.strokeRect(innerX + 12, innerY + bayPadY, innerW - 24, bayH);

      // Overhead gantry beam
      const beamH = innerH < 64 ? 7 : 11;
      g.fillStyle(isInactive ? 0x5c6468 : PALETTE.terracotta, 1);
      const barY = isDamaged ? innerY + innerH * 0.26 : innerY + innerH * 0.34;
      g.fillRect(innerX + 8, barY, innerW - 16, beamH);
      g.strokeRect(innerX + 8, barY, innerW - 16, beamH);

      // Safety apron stripes along front floor
      g.fillStyle(isInactive ? PALETTE.wreckDark : 0xf4c552, 1);
      g.fillRect(innerX + 14, innerY + innerH - 10, innerW - 28, 5);
      if (isOperational) {
        const lamp = 0.6 + 0.4 * Math.sin(animPhase * 3);
        const lampY = innerY + Math.min(20, innerH * 0.28);
        if (nightFactor > 0.1) {
          g.fillStyle(0xffe19c, nightFactor * 0.32);
          g.fillCircle(innerX + innerW - 20, lampY, 13);
        }
        g.fillStyle(0xf4c552, Math.min(1, lamp + nightFactor * 0.2));
        g.fillCircle(innerX + innerW - 20, lampY, 4 + nightFactor * 1.4);
      }
      break;
    }
  }

  // Visible broken state overlays reflecting the specific event/cause (retained until repaired)
  const showDamageOverlay = isInactive || isDamaged || Boolean(state.hasVisibleDamage);
  if (isInactive) {
    drawDebrisChunks(g, innerX, innerY, innerW, innerH, state.damageCause);
    drawEventSpecificDamage(g, innerX, innerY, innerW, innerH, state.damageCause, true);
  } else if (showDamageOverlay) {
    drawEventSpecificDamage(g, innerX, innerY, innerW, innerH, state.damageCause, false);
  }

  // On-building condition bar whenever damaged, inactive, or visibly cracked
  if (showDamageOverlay) {
    const barW = Math.min(82, width - 20);
    const barX = -barW / 2;
    const barY = -height / 2 - 12;
    g.fillStyle(PALETTE.charcoal, 1);
    g.fillRoundedRect(barX - 2, barY - 2, barW + 4, 10, 4);
    g.fillStyle(0x4b4846, 1);
    g.fillRoundedRect(barX, barY, barW, 6, 2);
    g.fillStyle(isInactive ? PALETTE.alertRed : PALETTE.terracotta, 1);
    g.fillRoundedRect(barX, barY, Math.max(4, (barW * state.condition) / 100), 6, 2);
  }
}

export interface AstronautBuildOptions {
  name: string;
  suitAccent: number;
  skinTone: number;
  hairColor: number;
  isPlayer?: boolean;
}

function buildHumanAstronautContainer(
  scene: Phaser.Scene,
  x: number,
  y: number,
  opts: AstronautBuildOptions
): Phaser.GameObjects.Container {
  const container = scene.add.container(x, y);

  // Ground shadow stays planted while bodyGroup hops/bobs
  const shadow = scene.add.graphics();
  shadow.fillStyle(PALETTE.charcoal, 0.32);
  shadow.fillEllipse(0, 18, opts.isPlayer ? 28 : 24, 11);

  const bodyGroup = scene.add.container(0, 0);
  bodyGroup.setName('bodyGroup');

  // Oxygen backpack
  const backpack = scene.add.graphics();
  backpack.fillStyle(PALETTE.sand, 1);
  backpack.lineStyle(2.2, PALETTE.charcoal, 1);
  backpack.fillRoundedRect(-12, -13, 24, 17, 5);
  backpack.strokeRoundedRect(-12, -13, 24, 17, 5);

  // Articulated legs / boots
  const leftLeg = scene.add.graphics();
  leftLeg.setName('leftLeg');
  leftLeg.fillStyle(PALETTE.creamLight, 1);
  leftLeg.lineStyle(2.2, PALETTE.charcoal, 1);
  leftLeg.fillRoundedRect(-8, 6, 7, 11, 3);
  leftLeg.strokeRoundedRect(-8, 6, 7, 11, 3);
  leftLeg.fillStyle(opts.suitAccent, 1);
  leftLeg.fillRect(-8, 12, 7, 4);

  const rightLeg = scene.add.graphics();
  rightLeg.setName('rightLeg');
  rightLeg.fillStyle(PALETTE.creamLight, 1);
  rightLeg.lineStyle(2.2, PALETTE.charcoal, 1);
  rightLeg.fillRoundedRect(1, 6, 7, 11, 3);
  rightLeg.strokeRoundedRect(1, 6, 7, 11, 3);
  rightLeg.fillStyle(opts.suitAccent, 1);
  rightLeg.fillRect(1, 12, 7, 4);

  // Left arm
  const leftArm = scene.add.graphics();
  leftArm.setName('leftArm');
  leftArm.setPosition(-9, -3);
  leftArm.fillStyle(PALETTE.creamLight, 1);
  leftArm.lineStyle(2.2, PALETTE.charcoal, 1);
  leftArm.fillRoundedRect(-5, -2, 6, 12, 3);
  leftArm.strokeRoundedRect(-5, -2, 6, 12, 3);
  leftArm.fillStyle(opts.suitAccent, 1);
  leftArm.fillCircle(-2, 10, 3);
  leftArm.strokeCircle(-2, 10, 3);

  // Right arm + attachable contextual tool props
  const rightArm = scene.add.container(9, -3);
  rightArm.setName('rightArm');
  const rightArmG = scene.add.graphics();
  rightArmG.fillStyle(PALETTE.creamLight, 1);
  rightArmG.lineStyle(2.2, PALETTE.charcoal, 1);
  rightArmG.fillRoundedRect(-1, -2, 6, 12, 3);
  rightArmG.strokeRoundedRect(-1, -2, 6, 12, 3);
  rightArmG.fillStyle(opts.suitAccent, 1);
  rightArmG.fillCircle(2, 10, 3);
  rightArmG.strokeCircle(2, 10, 3);
  rightArm.add(rightArmG);

  // Contextual tool props held in right hand (wrench, brush, seed pouch)
  const wrenchProp = scene.add.graphics();
  wrenchProp.setName('wrenchProp');
  wrenchProp.lineStyle(3, PALETTE.charcoal, 1);
  wrenchProp.lineBetween(2, 9, 13, -3);
  wrenchProp.fillStyle(0xd8e0e6, 1);
  wrenchProp.lineStyle(2, PALETTE.charcoal, 1);
  wrenchProp.fillCircle(14, -4, 4.5);
  wrenchProp.strokeCircle(14, -4, 4.5);
  wrenchProp.fillStyle(PALETTE.marsRed, 1);
  wrenchProp.fillCircle(15, -5, 1.8);
  wrenchProp.setVisible(false);

  const brushProp = scene.add.graphics();
  brushProp.setName('brushProp');
  brushProp.lineStyle(3, PALETTE.sand, 1);
  brushProp.lineBetween(2, 9, 14, -2);
  brushProp.fillStyle(PALETTE.techBlueLight, 1);
  brushProp.lineStyle(2, PALETTE.charcoal, 1);
  brushProp.fillRoundedRect(10, -7, 10, 6, 2);
  brushProp.strokeRoundedRect(10, -7, 10, 6, 2);
  brushProp.setVisible(false);

  const seedProp = scene.add.graphics();
  seedProp.setName('seedProp');
  seedProp.fillStyle(PALETTE.lifeGreenBright, 1);
  seedProp.lineStyle(2, PALETTE.charcoal, 1);
  seedProp.fillCircle(5, 8, 4.5);
  seedProp.strokeCircle(5, 8, 4.5);
  seedProp.fillStyle(0xf4c552, 1);
  seedProp.fillCircle(7, 5, 2);
  seedProp.setVisible(false);

  rightArm.add([wrenchProp, brushProp, seedProp]);

  // Torso spacesuit with mission color stripe
  const torso = scene.add.graphics();
  torso.fillStyle(PALETTE.creamLight, 1);
  torso.lineStyle(2.4, PALETTE.charcoal, 1);
  torso.fillRoundedRect(-9.5, -8, 19, 17, 6);
  torso.strokeRoundedRect(-9.5, -8, 19, 17, 6);
  // Colored chest stripe & belt
  torso.fillStyle(opts.suitAccent, 1);
  torso.fillRect(-8, -2, 16, 4.5);
  torso.fillStyle(PALETTE.charcoal, 0.85);
  torso.fillRect(-8.5, 4, 17, 2.5);
  torso.fillStyle(0xf4c552, 1);
  torso.fillCircle(0, 0, 2.2);

  // Clear-glass helmet with clearly visible human face inside
  const head = scene.add.graphics();
  // Outer glass dome
  head.fillStyle(0xdcf0fa, 0.96);
  head.lineStyle(2.5, PALETTE.charcoal, 1);
  head.fillCircle(0, -17, 13.5);
  head.strokeCircle(0, -17, 13.5);
  // Human head & skin
  head.fillStyle(opts.skinTone, 1);
  head.fillCircle(0, -16.5, 9.2);
  // Friendly hair tuft
  head.fillStyle(opts.hairColor, 1);
  head.fillEllipse(0, -23.5, 14, 6);
  // Expressive human eyes + smile
  head.fillStyle(PALETTE.charcoal, 1);
  head.fillCircle(-3.4, -17, 1.5);
  head.fillCircle(3.4, -17, 1.5);
  head.fillStyle(0xffffff, 1);
  head.fillCircle(-3.0, -17.5, 0.55);
  head.fillCircle(3.8, -17.5, 0.55);
  // Rosy cheeks & smile
  head.fillStyle(0xe88a78, 0.75);
  head.fillCircle(-5.5, -14.5, 1.5);
  head.fillCircle(5.5, -14.5, 1.5);
  head.lineStyle(1.7, PALETTE.charcoal, 1);
  head.beginPath();
  head.arc(0, -14.5, 3.2, 0.25, Math.PI - 0.25, false);
  head.strokePath();
  // Glass helmet rim & curved reflection glint
  head.lineStyle(2, 0xffffff, 0.75);
  head.beginPath();
  head.arc(-2, -19, 9, Math.PI * 1.05, Math.PI * 1.45, false);
  head.strokePath();
  // Neck collar ring
  head.fillStyle(opts.suitAccent, 1);
  head.lineStyle(2, PALETTE.charcoal, 1);
  head.fillRoundedRect(-7, -8.5, 14, 3.5, 1.5);
  head.strokeRoundedRect(-7, -8.5, 14, 3.5, 1.5);

  bodyGroup.add([backpack, leftLeg, rightLeg, leftArm, torso, rightArm, head]);

  const label = scene.add
    .text(0, 24, opts.name, {
      fontFamily: '"Plus Jakarta Sans", sans-serif',
      fontSize: opts.isPlayer ? '10px' : '9px',
      fontStyle: 'bold',
      color: opts.isPlayer ? '#FAF0DC' : '#292C2B',
      backgroundColor: opts.isPlayer ? '#292C2B' : '#F1D8A8',
      padding: { x: 4, y: 1 },
    })
    .setOrigin(0.5);

  container.add([shadow, bodyGroup, label]);

  if (opts.isPlayer) {
    // Floating upside-down gold triangle indicator pointing down toward NAS
    const indicator = scene.add.graphics();
    indicator.setName('nasIndicator');
    indicator.fillStyle(0xf4c552, 1);
    indicator.lineStyle(2.5, PALETTE.charcoal, 1);
    indicator.fillTriangle(-8, -48, 8, -48, 0, -36);
    indicator.strokeTriangle(-8, -48, 8, -48, 0, -36);
    container.add(indicator);
    container.setScale(1.08);
    container.setDepth(42);
  } else {
    container.setScale(0.92);
    container.setDepth(39);
  }

  return container;
}

export function createNasContainer(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Container {
  return buildHumanAstronautContainer(scene, x, y, {
    name: 'NAS',
    suitAccent: PALETTE.marsRed,
    skinTone: 0xf4c7a1,
    hairColor: 0x4b3224,
    isPlayer: true,
  });
}

export function createCrewMemberContainer(
  scene: Phaser.Scene,
  x: number,
  y: number,
  opts: Omit<AstronautBuildOptions, 'isPlayer'>
): Phaser.GameObjects.Container {
  return buildHumanAstronautContainer(scene, x, y, {
    ...opts,
    isPlayer: false,
  });
}

export function createGilContainer(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Container {
  const container = scene.add.container(x, y);

  // Hover shadow
  const shadow = scene.add.graphics();
  shadow.fillStyle(PALETTE.charcoal, 0.25);
  shadow.fillEllipse(0, 17, 20, 8);

  const gilBody = scene.add.container(0, 0);
  gilBody.setName('gilBody');

  const g = scene.add.graphics();
  // Thruster glow
  g.fillStyle(PALETTE.techBlueLight, 0.55);
  g.fillEllipse(0, 12, 12, 5);

  // Side ear-pods
  g.fillStyle(PALETTE.sand, 1);
  g.lineStyle(2, PALETTE.charcoal, 1);
  g.fillRoundedRect(-15, -5, 4, 8, 2);
  g.strokeRoundedRect(-15, -5, 4, 8, 2);
  g.fillRoundedRect(11, -5, 4, 8, 2);
  g.strokeRoundedRect(11, -5, 4, 8, 2);

  // Chunky AI pod chassis
  g.fillStyle(PALETTE.techBlue, 1);
  g.lineStyle(2.5, PALETTE.charcoal, 1);
  g.fillRoundedRect(-12, -12, 24, 21, 8);
  g.strokeRoundedRect(-12, -12, 24, 21, 8);

  // Screen face
  g.fillStyle(PALETTE.charcoal, 1);
  g.fillRoundedRect(-8.5, -8, 17, 12, 4);

  // Expressive eyes & smile
  g.fillStyle(PALETTE.creamLight, 1);
  g.fillCircle(-3.6, -3, 2.3);
  g.fillCircle(3.6, -3, 2.3);
  g.fillStyle(PALETTE.techBlue, 1);
  g.fillCircle(-3.2, -3.3, 0.8);
  g.fillCircle(4.0, -3.3, 0.8);

  g.lineStyle(1.8, PALETTE.lifeGreenBright, 1);
  g.beginPath();
  g.arc(0, -0.5, 3.2, 0.2, Math.PI - 0.2, false);
  g.strokePath();

  // Antenna fin
  g.lineStyle(2.2, PALETTE.charcoal, 1);
  g.lineBetween(0, -12, 0, -18);
  g.fillStyle(0xf4c552, 1);
  g.fillCircle(0, -19.5, 3.2);
  g.strokeCircle(0, -19.5, 3.2);

  gilBody.add(g);
  container.add([shadow, gilBody]);
  container.setDepth(43);
  return container;
}

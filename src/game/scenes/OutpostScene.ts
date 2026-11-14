import Phaser from 'phaser';
import { BUILDING_DEFINITIONS, BUILDING_LIST } from '../../data/buildings';
import { gameStore, WorldFeedbackEvent } from '../../state/gameStore';
import { soundFX } from '../../systems/audio';
import { getContextualGilMessage } from '../../systems/gil';
import { BuildingId } from '../../types/building';
import { GameState, ScreenMode, TerrainScar } from '../../types/game';
import {
  gridManager,
  Point2D,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from '../grid/GridManager';
import {
  createCrewMemberContainer,
  createGilContainer,
  createNasContainer,
  drawBuildingGraphics,
  PALETTE,
} from '../rendering/GraphicsFactory';

interface BuildingVisual {
  container: Phaser.GameObjects.Container;
  graphics: Phaser.GameObjects.Graphics;
  selectionRing: Phaser.GameObjects.Graphics;
  workBar: Phaser.GameObjects.Graphics;
  statusTag: Phaser.GameObjects.Text;
  nameTag: Phaser.GameObjects.Text;
  baseX: number;
  baseY: number;
  width: number;
  height: number;
  restoringUntil: number;
}

type ActionAnimKind = 'restore' | 'repair' | 'clean' | 'plant' | 'harvest';

interface ActiveWorkAnimation {
  buildingId: BuildingId;
  kind: ActionAnimKind;
  startedAt: number;
  duration: number;
  label: string;
}

interface CrewAgent {
  container: Phaser.GameObjects.Container;
  homeBuilding: BuildingId;
  patrolBuildings: BuildingId[];
  path: Point2D[];
  allowInsideBuildingId?: BuildingId;
  waitUntil: number;
  phaseOffset: number;
}

export class OutpostScene extends Phaser.Scene {
  private buildingVisuals = new Map<BuildingId, BuildingVisual>();
  private nas!: Phaser.GameObjects.Container;
  private crewAgents: CrewAgent[] = [];
  private gil!: Phaser.GameObjects.Container;
  private terrainGraphics!: Phaser.GameObjects.Graphics;
  private terrainRocksGraphics!: Phaser.GameObjects.Graphics;
  private terrainRocksContainer!: Phaser.GameObjects.Container;
  private jezeroLabel?: Phaser.GameObjects.Text;
  private groundSunTintLayer!: Phaser.GameObjects.Graphics;
  private groundLightsLayer!: Phaser.GameObjects.Graphics;
  private environmentalScarsLayer!: Phaser.GameObjects.Graphics;
  private scarDustLayer!: Phaser.GameObjects.Graphics;
  private skyHorizonLayer!: Phaser.GameObjects.Graphics;
  private dayNightOverlay!: Phaser.GameObjects.Graphics;
  private outpostLightsLayer!: Phaser.GameObjects.Graphics;
  private nightStars: Array<{ circle: Phaser.GameObjects.Arc; phase: number; baseAlpha: number }> =
    [];
  private displayHours = 5;
  private lastDrawnHours = -1;
  private lastTerrainHours = -100;
  private lastScarsKey = '';
  private weatherOverlay!: Phaser.GameObjects.Graphics;
  private eventEffectsLayer!: Phaser.GameObjects.Graphics;
  private actionAnimLayer!: Phaser.GameObjects.Graphics;
  private activeWorkAnim: ActiveWorkAnimation | null = null;
  private lastFootDustAt = 0;
  private dustParticles: Array<{ rect: Phaser.GameObjects.Rectangle; speed: number }> = [];
  private stormStreaks: Array<{
    rect: Phaser.GameObjects.Rectangle;
    speed: number;
    driftY: number;
  }> = [];
  private iceParticles: Array<{
    circle: Phaser.GameObjects.Arc;
    speedY: number;
    driftX: number;
  }> = [];

  private lastActiveEventKey: string | null = null;
  private nextQuakeAt = 0;
  private quakeEndAt = 0;
  private reducedMotion = false;

  private unsubscribeState?: () => void;
  private unsubscribeFeedback?: () => void;

  private isDragging = false;
  private activePointerId: number | null = null;
  private dragStartX = 0;
  private dragStartY = 0;
  private camStartX = 0;
  private camStartY = 0;
  private wasDragged = false;
  private lastScreen: ScreenMode | null = null;

  private keys?: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
    UP: Phaser.Input.Keyboard.Key;
    LEFT: Phaser.Input.Keyboard.Key;
    DOWN: Phaser.Input.Keyboard.Key;
    RIGHT: Phaser.Input.Keyboard.Key;
  };

  private nasPath: Point2D[] = [];
  private nasAllowInsideBuildingId: BuildingId | undefined = undefined;
  private nasJumpUntil = 0;
  private elapsedTime = 0;

  constructor() {
    super({ key: 'OutpostScene' });
  }

  public create() {
    this.reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this.cameras.main.setBackgroundColor('#B94F32');
    // Generous world bounds so zoom never locks camera scrolling; clampCameraScroll keeps outpost contained.
    this.cameras.main.setBounds(-1600, -1200, WORLD_WIDTH + 3200, WORLD_HEIGHT + 2400);

    this.drawMarsTerrain();
    this.createBuildings();
    this.createCharacters();
    this.createDayNightLayer();
    this.createWeatherLayer();
    this.setupCameraAndInput();

    const initialState = gameStore.getState();
    this.displayHours = initialState.hoursElapsed;
    this.syncWithGameState(initialState);
    this.renderDayNightCycle(initialState);

    this.unsubscribeState = gameStore.subscribe((state) => {
      this.syncWithGameState(state);
    });

    this.unsubscribeFeedback = gameStore.onFeedback((evt) => {
      this.handleWorldFeedback(evt);
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribeState?.();
      this.unsubscribeFeedback?.();
    });

    this.centerCameraOnOutpost();
    this.scale.on('resize', () => {
      this.centerCameraOnOutpost();
    });
  }

  private centerCameraOnOutpost() {
    const cam = this.cameras.main;
    if (!cam) return;
    const effectiveWidth = Math.min(cam.width, 1440);
    const horizontalMargin = effectiveWidth >= 768 ? 110 : 32;
    const verticalMargin = 180;
    const fitZoom = Math.min(
      (effectiveWidth - horizontalMargin) / (WORLD_WIDTH + 170),
      (cam.height - verticalMargin) / WORLD_HEIGHT,
      1.0
    );
    cam.setZoom(Math.max(0.45, fitZoom));
    cam.centerOn(WORLD_WIDTH / 2 + 56, WORLD_HEIGHT / 2);
    this.clampCameraScroll();
  }

  private clampCameraScroll() {
    const cam = this.cameras.main;
    if (!cam) return;
    const minCenterX = -80;
    const maxCenterX = WORLD_WIDTH + 220;
    const minCenterY = -40;
    const maxCenterY = WORLD_HEIGHT + 40;

    const currentCenterX = cam.scrollX + cam.width * 0.5;
    const currentCenterY = cam.scrollY + cam.height * 0.5;

    const clampedCenterX = Phaser.Math.Clamp(currentCenterX, minCenterX, maxCenterX);
    const clampedCenterY = Phaser.Math.Clamp(currentCenterY, minCenterY, maxCenterY);

    cam.scrollX = clampedCenterX - cam.width * 0.5;
    cam.scrollY = clampedCenterY - cam.height * 0.5;
  }

  private drawMarsTerrain() {
    this.terrainGraphics = this.add.graphics();
    this.terrainGraphics.setDepth(0);

    this.terrainRocksContainer = this.add.container(0, 0);
    this.terrainRocksContainer.setDepth(1);
    this.terrainRocksGraphics = this.add.graphics();
    this.terrainRocksContainer.add(this.terrainRocksGraphics);

    this.jezeroLabel = this.add
      .text(WORLD_WIDTH + 188, 128, 'JEZERO CRATER', {
        fontFamily: '"Plus Jakarta Sans", sans-serif',
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#FAF0DC',
        backgroundColor: '#292C2B',
        padding: { x: 8, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(2);

    this.groundSunTintLayer = this.add.graphics();
    this.groundSunTintLayer.setDepth(2);

    this.groundLightsLayer = this.add.graphics();
    this.groundLightsLayer.setDepth(3);

    this.environmentalScarsLayer = this.add.graphics();
    this.environmentalScarsLayer.setDepth(4);

    this.scarDustLayer = this.add.graphics();
    this.scarDustLayer.setDepth(5);

    this.redrawTerrainAtmosphere(this.computeDayNightLighting(this.displayHours));
  }

  private redrawTerrainAtmosphere(lighting: ReturnType<OutpostScene['computeDayNightLighting']>) {
    const g = this.terrainGraphics;
    const rocksG = this.terrainRocksGraphics;
    if (!g || !rocksG) return;

    g.clear();
    rocksG.clear();

    // Sync canvas backdrop color with sky atmosphere
    this.cameras.main?.setBackgroundColor(lighting.skyOuterColor);

    // 1. Darker/colored Martian sky framing outside the outpost plateau
    g.fillStyle(lighting.skyOuterColor, 1);
    g.fillRect(-1400, -1100, WORLD_WIDTH + 2800, WORLD_HEIGHT + 2200);

    // Mid horizon atmospheric band hugging the outpost & Jezero landscape
    g.fillStyle(lighting.skyInnerColor, 0.84);
    g.fillRoundedRect(-440, -290, WORLD_WIDTH + 980, WORLD_HEIGHT + 580, 64);

    // Distant layered Martian hills, mesas & stepped ridges framing North, West, South & Far East
    const ridges = [
      { x: -320, y: -185, w: 320, h: 110 },
      { x: 110, y: -210, w: 420, h: 125 },
      { x: 640, y: -195, w: 390, h: 115 },
      { x: -380, y: 120, w: 260, h: 240 },
      { x: -360, y: 460, w: 250, h: 220 },
      { x: -160, y: WORLD_HEIGHT + 65, w: 340, h: 120 },
      { x: 260, y: WORLD_HEIGHT + 75, w: 360, h: 115 },
      { x: 690, y: WORLD_HEIGHT + 60, w: 320, h: 115 },
    ];
    for (const hill of ridges) {
      g.fillStyle(lighting.shadowColor, 0.36);
      g.fillRoundedRect(
        hill.x + lighting.shadowDx * 0.7,
        hill.y + lighting.shadowDy * 0.8,
        hill.w,
        hill.h,
        36
      );
      g.fillStyle(lighting.terrainDune, 0.85);
      g.fillRoundedRect(hill.x, hill.y, hill.w, hill.h, 36);
      g.lineStyle(2.5, lighting.craterRim, 0.45);
      g.lineBetween(hill.x + 28, hill.y + 4, hill.x + hill.w - 28, hill.y + 4);
    }

    // Surrounding outer craters in West, North & South Martian plains
    const outerCraters = [
      { x: -205, y: 215, r: 62 },
      { x: -185, y: 585, r: 48 },
      { x: 260, y: -115, r: 44 },
      { x: 740, y: -110, r: 52 },
      { x: 220, y: WORLD_HEIGHT + 118, r: 48 },
      { x: 720, y: WORLD_HEIGHT + 125, r: 56 },
    ];
    for (const c of outerCraters) {
      g.fillStyle(lighting.craterShade, 0.72);
      g.fillCircle(c.x, c.y, c.r);
      g.fillStyle(lighting.shadowColor, 0.28);
      g.fillCircle(c.x + lighting.shadowDx * 0.25, c.y + lighting.shadowDy * 0.25, c.r * 0.76);
      g.lineStyle(3, lighting.craterRim, 0.62);
      g.strokeCircle(c.x, c.y, c.r + 2);
    }

    // Clearly Visible JEZERO CRATER beside the eastern plateau edge
    const jcX = WORLD_WIDTH + 205;
    const jcY = WORLD_HEIGHT * 0.5;
    const jcRx = 188;
    const jcRy = 285;

    // Outer Jezero ejecta shelf & rim ridge
    g.fillStyle(lighting.terrainDune, 0.9);
    g.fillEllipse(jcX, jcY, jcRx * 2 + 44, jcRy * 2 + 44);
    g.lineStyle(4, lighting.craterRim, 0.76);
    g.strokeEllipse(jcX, jcY, jcRx * 2 + 12, jcRy * 2 + 12);

    // Upper terraced crater bench
    g.fillStyle(lighting.craterShade, 0.86);
    g.fillEllipse(jcX, jcY, jcRx * 2, jcRy * 2);
    g.lineStyle(3, lighting.craterRim, 0.52);
    g.strokeEllipse(jcX, jcY, jcRx * 2, jcRy * 2);

    // Deeper stepped inner crater floor + directional wall shadow
    g.fillStyle(lighting.shadowColor, 0.36);
    g.fillEllipse(
      jcX + lighting.shadowDx * 0.85,
      jcY + lighting.shadowDy * 0.85,
      jcRx * 1.56,
      jcRy * 1.56
    );
    g.fillStyle(lighting.craterShade, 0.95);
    g.fillEllipse(jcX + 6, jcY + 4, jcRx * 1.32, jcRy * 1.32);
    g.lineStyle(2.5, lighting.craterRim, 0.38);
    g.strokeEllipse(jcX + 6, jcY + 4, jcRx * 1.32, jcRy * 1.32);

    // Ancient Jezero Crater river delta channels curving in from the NW rim
    g.lineStyle(9, lighting.walkwayColor, 0.38);
    g.lineBetween(WORLD_WIDTH + 46, 210, jcX - 72, 295);
    g.lineBetween(jcX - 72, 295, jcX - 24, 375);
    g.lineStyle(6, lighting.walkwayColor, 0.32);
    g.lineBetween(jcX - 72, 295, jcX - 96, 392);
    g.lineBetween(jcX - 24, 375, jcX + 26, 422);

    // Central crater peak mound inside Jezero floor
    g.fillStyle(lighting.shadowColor, 0.4);
    g.fillEllipse(jcX + 16 + lighting.shadowDx * 0.4, jcY + 12 + lighting.shadowDy * 0.4, 58, 42);
    g.fillStyle(lighting.rockBody, 0.92);
    g.fillEllipse(jcX + 12, jcY + 8, 52, 36);
    g.lineStyle(2.5, lighting.rimColor, 0.65);
    g.strokeEllipse(jcX + 12, jcY + 8, 52, 36);

    // Small craterlets inside Jezero floor
    g.fillStyle(lighting.shadowColor, 0.42);
    g.fillCircle(jcX - 42, jcY + 115, 22);
    g.lineStyle(2, lighting.craterRim, 0.45);
    g.strokeCircle(jcX - 42, jcY + 115, 22);
    g.fillStyle(lighting.shadowColor, 0.36);
    g.fillCircle(jcX + 58, jcY - 110, 18);
    g.lineStyle(2, lighting.craterRim, 0.42);
    g.strokeCircle(jcX + 58, jcY - 110, 18);

    if (this.jezeroLabel) {
      this.jezeroLabel.setAlpha(0.92);
    }

    // Subtle Phobos moonlight orb + cool halo in upper-right night/twilight sky
    if (lighting.nightFactor > 0.12) {
      const moonX = WORLD_WIDTH + 92;
      const moonY = -64;
      g.fillStyle(0x8fb6ff, 0.14 * lighting.nightFactor);
      g.fillCircle(moonX, moonY, 64);
      g.fillStyle(0xb7d2ff, 0.24 * lighting.nightFactor);
      g.fillCircle(moonX, moonY, 32);
      g.fillStyle(0xe8f2ff, 0.88 * lighting.nightFactor);
      g.fillCircle(moonX, moonY, 13);
      g.fillStyle(0x4c6294, 0.35 * lighting.nightFactor);
      g.fillCircle(moonX - 4, moonY - 2, 3.2);
      g.fillCircle(moonX + 5, moonY + 4, 2.2);
    }

    // 2. Elevated Outpost Mars Plateau (preserves subtle Mars-red soil tones even at deep night!)
    g.fillStyle(lighting.shadowColor, 0.45);
    g.fillRoundedRect(-14, -8, WORLD_WIDTH + 36, WORLD_HEIGHT + 30, 24);

    g.fillStyle(lighting.terrainSoil, 1);
    g.fillRoundedRect(-24, -18, WORLD_WIDTH + 48, WORLD_HEIGHT + 36, 20);

    // Subtle wind-sculpted Mars dune bands across the plateau
    g.fillStyle(lighting.terrainDune, 0.36);
    g.fillEllipse(220, 210, 260, 78);
    g.fillEllipse(700, 215, 250, 74);
    g.fillEllipse(235, 535, 270, 80);
    g.fillEllipse(710, 540, 245, 76);

    // Small surface craters placed safely in open perimeter spaces outside 13x10 building pads
    const craterSpots = [
      { x: 180, y: 625, r: 34 },
      { x: 836, y: 642, r: 36 },
      { x: 888, y: 382, r: 22 },
      { x: 234, y: 245, r: 24 },
    ];
    for (const c of craterSpots) {
      g.fillStyle(lighting.craterShade, 0.65);
      g.fillCircle(c.x, c.y, c.r);
      g.fillStyle(lighting.shadowColor, 0.24);
      g.fillCircle(c.x + lighting.shadowDx * 0.25, c.y + lighting.shadowDy * 0.25, c.r * 0.78);
      g.lineStyle(2.5, lighting.craterRim, 0.56);
      g.strokeCircle(c.x, c.y, c.r + 2);
    }

    // Natural plateau border without artificial road or runway markings
    g.lineStyle(3, lighting.craterRim, 0.44);
    g.strokeRoundedRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT, 12);

    // 3. Perimeter & surrounding Martian boulders + scattered stone clusters (clear of walkways/buildings!)
    const rocks = [
      // Outpost corners & outer margins
      { x: 18, y: 20, w: 28, h: 20 },
      { x: 312, y: 18, w: 24, h: 16 },
      { x: 528, y: 18, w: 22, h: 16 },
      { x: 882, y: 22, w: 30, h: 20 },
      { x: 18, y: 405, w: 24, h: 18 },
      { x: 24, y: 668, w: 30, h: 20 },
      { x: 280, y: 672, w: 26, h: 18 },
      { x: 655, y: 670, w: 28, h: 18 },
      { x: 882, y: 666, w: 32, h: 22 },
      // Surrounding Martian terrain & Jezero Crater rim boulders
      { x: -125, y: 85, w: 36, h: 24 },
      { x: -165, y: 425, w: 42, h: 28 },
      { x: -95, y: 645, w: 34, h: 22 },
      { x: 480, y: -92, w: 38, h: 24 },
      { x: 460, y: WORLD_HEIGHT + 72, w: 36, h: 24 },
      { x: WORLD_WIDTH + 64, y: 120, w: 32, h: 22 },
      { x: WORLD_WIDTH + 72, y: 580, w: 36, h: 24 },
      { x: jcX + 68, y: jcY + 135, w: 28, h: 20 },
    ];
    for (const r of rocks) {
      rocksG.fillStyle(lighting.shadowColor, 0.4);
      rocksG.fillRoundedRect(
        r.x + lighting.shadowDx * 0.45,
        r.y + lighting.shadowDy * 0.55,
        r.w + 2,
        r.h + 1,
        5
      );
      rocksG.fillStyle(lighting.rockBody, 1);
      rocksG.lineStyle(2, PALETTE.charcoal, 1);
      rocksG.fillRoundedRect(r.x, r.y, r.w, r.h, 5);
      rocksG.strokeRoundedRect(r.x, r.y, r.w, r.h, 5);
      rocksG.lineStyle(2.2, lighting.rimColor, 0.65);
      rocksG.lineBetween(r.x + 4, r.y + 3, r.x + r.w - 4, r.y + 3);
    }

    // Scattered small Martian pebbles/stones outside buildings & paths
    const pebbles = [
      { x: 320, y: 235, r: 4 },
      { x: 540, y: 185, r: 3.5 },
      { x: 756, y: 105, r: 4 },
      { x: 245, y: 540, r: 4 },
      { x: 756, y: 396, r: 3.5 },
      { x: 520, y: 645, r: 4.5 },
      { x: -70, y: 315, r: 5 },
      { x: -110, y: 540, r: 4.5 },
      { x: WORLD_WIDTH + 54, y: 420, r: 5 },
      { x: jcX - 55, y: jcY - 95, r: 4 },
    ];
    for (const p of pebbles) {
      rocksG.fillStyle(lighting.shadowColor, 0.35);
      rocksG.fillCircle(p.x + 2, p.y + 2, p.r);
      rocksG.fillStyle(lighting.rockBody, 0.95);
      rocksG.fillCircle(p.x, p.y, p.r);
    }
  }

  private createBuildings() {
    for (const def of BUILDING_LIST) {
      const bounds = gridManager.getBuildingBounds(def);
      const container = this.add.container(bounds.centerX, bounds.centerY);
      container.setDepth(10);

      const selectionRing = this.add.graphics();
      const graphics = this.add.graphics();
      const workBar = this.add.graphics();

      const nameTag = this.add
        .text(0, bounds.height / 2 + 6, def.shortName, {
          fontFamily: '"Plus Jakarta Sans", sans-serif',
          fontSize: '11px',
          fontStyle: 'bold',
          color: '#292C2B',
          backgroundColor: '#F1D8A8',
          padding: { x: 5, y: 2 },
        })
        .setOrigin(0.5, 0);

      const statusTag = this.add
        .text(0, -bounds.height / 2 - 22, '', {
          fontFamily: '"Plus Jakarta Sans", sans-serif',
          fontSize: '11px',
          fontStyle: 'bold',
          color: '#FAF0DC',
          backgroundColor: '#C94B43',
          padding: { x: 6, y: 2 },
        })
        .setOrigin(0.5, 1);

      container.add([selectionRing, graphics, workBar, nameTag, statusTag]);
      container.setSize(bounds.width, bounds.height);
      container.setInteractive({ useHandCursor: true });

      container.on('pointerover', () => {
        if (gameStore.getState().screen !== 'PLAYING') return;
        container.setScale(1.03);
      });

      container.on('pointerout', () => {
        container.setScale(1);
      });

      container.on('pointerup', () => {
        if (this.wasDragged) return;
        if (gameStore.getState().screen !== 'PLAYING') return;
        this.runNasToBuilding(def.id);
        gameStore.selectBuilding(def.id);
      });

      this.buildingVisuals.set(def.id, {
        container,
        graphics,
        selectionRing,
        workBar,
        statusTag,
        nameTag,
        baseX: bounds.centerX,
        baseY: bounds.centerY,
        width: bounds.width,
        height: bounds.height,
        restoringUntil: 0,
      });
    }
  }

  private createCharacters() {
    const habBounds = gridManager.getBuildingBounds(BUILDING_DEFINITIONS.main_habitat);
    const frontY = habBounds.y + habBounds.height + 24;
    this.nas = createNasContainer(this, habBounds.centerX - 18, frontY);
    this.gil = createGilContainer(this, habBounds.centerX + 26, frontY - 18);

    // Three supporting human crew members with distinct astronaut suit accents
    const crewSpecs: Array<{
      name: string;
      suitAccent: number;
      skinTone: number;
      hairColor: number;
      homeBuilding: BuildingId;
      patrolBuildings: BuildingId[];
      spawnX: number;
      spawnY: number;
    }> = [
      {
        name: 'EVA',
        suitAccent: PALETTE.lifeGreen,
        skinTone: 0x8d5524,
        hairColor: 0x221b18,
        homeBuilding: 'greenhouse',
        patrolBuildings: ['greenhouse', 'food_storage', 'main_habitat'],
        spawnX: habBounds.centerX - 72,
        spawnY: frontY,
      },
      {
        name: 'KAI',
        suitAccent: PALETTE.techBlue,
        skinTone: 0xe0ac69,
        hairColor: 0x292c2b,
        homeBuilding: 'oxygen_generator',
        patrolBuildings: ['oxygen_generator', 'water_recycling', 'main_habitat'],
        spawnX: habBounds.centerX + 38,
        spawnY: frontY,
      },
      {
        name: 'MIA',
        suitAccent: PALETTE.terracotta,
        skinTone: 0xf1c27d,
        hairColor: 0x7c3e26,
        homeBuilding: 'solar_panels',
        patrolBuildings: ['solar_panels', 'energy_storage', 'maintenance_facility'],
        spawnX: habBounds.centerX + 92,
        spawnY: frontY - 4,
      },
    ];

    this.crewAgents = crewSpecs.map((spec, idx) => {
      const container = createCrewMemberContainer(
        this,
        spec.spawnX,
        spec.spawnY,
        {
          name: spec.name,
          suitAccent: spec.suitAccent,
          skinTone: spec.skinTone,
          hairColor: spec.hairColor,
        }
      );
      return {
        container,
        homeBuilding: spec.homeBuilding,
        patrolBuildings: spec.patrolBuildings,
        path: [],
        allowInsideBuildingId: undefined,
        waitUntil: 1.5 + idx * 1.1,
        phaseOffset: idx * 2.1,
      };
    });

    this.actionAnimLayer = this.add.graphics();
    this.actionAnimLayer.setDepth(46);
  }

  private createWeatherLayer() {
    this.weatherOverlay = this.add.graphics();
    this.weatherOverlay.setDepth(60);

    this.eventEffectsLayer = this.add.graphics();
    this.eventEffectsLayer.setDepth(61);

    for (let i = 0; i < 24; i++) {
      const rect = this.add.rectangle(
        Phaser.Math.Between(0, WORLD_WIDTH),
        Phaser.Math.Between(0, WORLD_HEIGHT),
        Phaser.Math.Between(14, 34),
        4,
        PALETTE.sand,
        0.22
      );
      rect.setDepth(59);
      this.dustParticles.push({
        rect,
        speed: Phaser.Math.Between(35, 95),
      });
    }

    // Blowing storm dust streaks (visible only during dust storms)
    for (let i = 0; i < 28; i++) {
      const streak = this.add.rectangle(
        Phaser.Math.Between(-80, WORLD_WIDTH),
        Phaser.Math.Between(0, WORLD_HEIGHT),
        Phaser.Math.Between(48, 125),
        Phaser.Math.Between(4, 9),
        i % 2 === 0 ? PALETTE.sand : PALETTE.terracotta,
        0.34
      );
      streak.setAngle(-8);
      streak.setDepth(62);
      streak.setVisible(false);
      this.stormStreaks.push({
        rect: streak,
        speed: Phaser.Math.Between(260, 480),
        driftY: Phaser.Math.Between(25, 70),
      });
    }

    // Falling ice crystals (visible during cold snaps)
    for (let i = 0; i < 24; i++) {
      const circle = this.add.circle(
        Phaser.Math.Between(0, WORLD_WIDTH),
        Phaser.Math.Between(0, WORLD_HEIGHT),
        Phaser.Math.Between(2, 4),
        0xdcf2ff,
        0.7
      );
      circle.setDepth(62);
      circle.setVisible(false);
      this.iceParticles.push({
        circle,
        speedY: Phaser.Math.Between(35, 75),
        driftX: Phaser.Math.Between(-18, 18),
      });
    }
  }

  private createDayNightLayer() {
    // Horizon atmospheric light sweep sits under buildings/characters so it never muddies interactive assets
    this.skyHorizonLayer = this.add.graphics();
    this.skyHorizonLayer.setDepth(2);

    // Ultra-subtle atmospheric air perspective veil (no dark overlay dimming gameplay!)
    this.dayNightOverlay = this.add.graphics();
    this.dayNightOverlay.setDepth(57);

    this.outpostLightsLayer = this.add.graphics();
    this.outpostLightsLayer.setDepth(58);

    // Subtle multi-hue twinkling stars in the outer Martian night sky framing the plateau
    const starColors = [0xfaf0dc, 0xa8cbff, 0xffe2b0];
    for (let i = 0; i < 42; i++) {
      const band = i % 4;
      const sx =
        band === 0
          ? Phaser.Math.Between(-280, WORLD_WIDTH + 280)
          : band === 1
          ? Phaser.Math.Between(-280, WORLD_WIDTH + 280)
          : band === 2
          ? Phaser.Math.Between(-280, -32)
          : Phaser.Math.Between(WORLD_WIDTH + 32, WORLD_WIDTH + 280);
      const sy =
        band === 0
          ? Phaser.Math.Between(-200, -28)
          : band === 1
          ? Phaser.Math.Between(WORLD_HEIGHT + 28, WORLD_HEIGHT + 200)
          : Phaser.Math.Between(-150, WORLD_HEIGHT + 150);
      const star = this.add.circle(
        sx,
        sy,
        i % 4 === 0 ? 2.4 : i % 2 === 0 ? 1.8 : 1.3,
        starColors[i % starColors.length],
        0
      );
      star.setDepth(2);
      this.nightStars.push({
        circle: star,
        phase: i * 0.72,
        baseAlpha: 0.5 + (i % 3) * 0.18,
      });
    }
  }

  private lerpHexColor(c1: number, c2: number, t: number): number {
    const clamped = Phaser.Math.Clamp(t, 0, 1);
    const col1 = Phaser.Display.Color.IntegerToColor(c1);
    const col2 = Phaser.Display.Color.IntegerToColor(c2);
    const blended = Phaser.Display.Color.Interpolate.ColorWithColor(col1, col2, 100, clamped * 100);
    return Phaser.Display.Color.GetColor(blended.r, blended.g, blended.b);
  }

  private computeDayNightLighting(hours: number): {
    tintColor: number;
    tintAlpha: number;
    nightFactor: number;
    shadowDx: number;
    shadowDy: number;
    shadowAlpha: number;
    shadowColor: number;
    sunBias: number;
    rimColor: number;
    rimAlpha: number;
    horizonColor: number;
    horizonAlpha: number;
    horizonSide: 'east' | 'west' | 'none';
    groundTintColor: number;
    groundTintAlpha: number;
    skyOuterColor: number;
    skyInnerColor: number;
    terrainSoil: number;
    terrainDune: number;
    craterShade: number;
    craterRim: number;
    walkwayColor: number;
    gridTint: number;
    rockBody: number;
  } {
    const h = Phaser.Math.Clamp(hours, 0, 24);

    // Key color-graded palettes grounded in complementary warm/cool color theory
    const NIGHT = {
      tintColor: 0x262a5c,
      tintAlpha: 0.08,
      nightFactor: 1,
      shadowDx: 7,
      shadowDy: 6,
      shadowAlpha: 0.34,
      shadowColor: 0x1b1940, // Deep violet-indigo shadow
      sunBias: 0,
      rimColor: 0x8fb8ff, // Cool ambient moonlight rim
      rimAlpha: 0.56,
      horizonColor: 0x3b4e8a,
      horizonAlpha: 0.14,
      horizonSide: 'east' as const,
      groundTintColor: 0x7ba4f7, // Soft cool moonlight sheen
      groundTintAlpha: 0.07,
      skyOuterColor: 0x0b1026, // Deep navy night sky
      skyInnerColor: 0x1e234d, // Muted indigo atmosphere
      terrainSoil: 0x522a3c, // Preserved Mars-red rust blended with twilight plum
      terrainDune: 0x673549,
      craterShade: 0x251e48, // Cool violet crater shadow
      craterRim: 0x75597d, // Lavender-clay crater rim
      walkwayColor: 0x695069, // Warm muted sand under moonlight
      gridTint: 0x8fa4d8,
      rockBody: 0x733c48, // Subtle Mars-red boulder silhouette
    };

    const SUNRISE = {
      tintColor: 0xff9e68,
      tintAlpha: 0.08,
      nightFactor: 0.25,
      shadowDx: -15,
      shadowDy: 8,
      shadowAlpha: 0.34,
      shadowColor: 0x3b264e, // Cool lavender-violet dawn shadows
      sunBias: -0.82,
      rimColor: 0xffbe7a, // Warm peach-gold sunrise rim
      rimAlpha: 0.5,
      horizonColor: 0xffa65c,
      horizonAlpha: 0.32,
      horizonSide: 'east' as const,
      groundTintColor: 0xffaa64,
      groundTintAlpha: 0.11,
      skyOuterColor: 0x693954,
      skyInnerColor: 0xd96e4c,
      terrainSoil: 0xaf4b38,
      terrainDune: 0xc95f42,
      craterShade: 0x512c46,
      craterRim: 0xf49862,
      walkwayColor: 0xe29f6d,
      gridTint: 0x3b2638,
      rockBody: 0xcc6a47,
    };

    const DAY = {
      tintColor: 0xffb870,
      tintAlpha: 0.02,
      nightFactor: 0,
      shadowDx: 2,
      shadowDy: 6.5,
      shadowAlpha: 0.32,
      shadowColor: 0x46283c, // Warm-plum umber shadow (never flat black!)
      sunBias: 0,
      rimColor: 0xffe4ad, // Warm orange-cream sunlight highlight
      rimAlpha: 0.4,
      horizonColor: 0xf5aa6e,
      horizonAlpha: 0.08,
      horizonSide: 'none' as const,
      groundTintColor: 0xffc67d,
      groundTintAlpha: 0.04,
      skyOuterColor: 0xb45539,
      skyInnerColor: 0xde8252,
      terrainSoil: 0xc45636, // Natural vibrant Mars red
      terrainDune: 0xd66b43,
      craterShade: 0x7b332d,
      craterRim: 0xeb9257, // Warm orange rim highlight
      walkwayColor: 0xedd293, // Sunlit Mars sand
      gridTint: 0x3a2420,
      rockBody: 0xd77b4a,
    };

    const SUNSET = {
      tintColor: 0xf06d42,
      tintAlpha: 0.11,
      nightFactor: 0.42,
      shadowDx: 17,
      shadowDy: 8.5,
      shadowAlpha: 0.38,
      shadowColor: 0x2f1e4c, // Long complementary cool violet sunset shadows!
      sunBias: 0.85,
      rimColor: 0xff8b4a, // Deep fiery orange-amber rim
      rimAlpha: 0.58,
      horizonColor: 0xff6e48,
      horizonAlpha: 0.36,
      horizonSide: 'west' as const,
      groundTintColor: 0xff7e47,
      groundTintAlpha: 0.12,
      skyOuterColor: 0x45224c, // Twilight violet sky edge
      skyInnerColor: 0xe25b41, // Coral & deep orange sunset glow
      terrainSoil: 0xa6423a, // Rich coral-amber Mars terrain
      terrainDune: 0xc7563c,
      craterShade: 0x3a224d, // Deep indigo-violet crater shadow
      craterRim: 0xff884d, // Glowing amber crater rim
      walkwayColor: 0xd8875a,
      gridTint: 0x351e3d,
      rockBody: 0xc1523f,
    };

    const blendPalette = (
      a: ReturnType<OutpostScene['computeDayNightLighting']>,
      b: ReturnType<OutpostScene['computeDayNightLighting']>,
      t: number,
      side: 'east' | 'west' | 'none'
    ): ReturnType<OutpostScene['computeDayNightLighting']> => ({
      tintColor: this.lerpHexColor(a.tintColor, b.tintColor, t),
      tintAlpha: Phaser.Math.Linear(a.tintAlpha, b.tintAlpha, t),
      nightFactor: Phaser.Math.Linear(a.nightFactor, b.nightFactor, t),
      shadowDx: Phaser.Math.Linear(a.shadowDx, b.shadowDx, t),
      shadowDy: Phaser.Math.Linear(a.shadowDy, b.shadowDy, t),
      shadowAlpha: Phaser.Math.Linear(a.shadowAlpha, b.shadowAlpha, t),
      shadowColor: this.lerpHexColor(a.shadowColor, b.shadowColor, t),
      sunBias: Phaser.Math.Linear(a.sunBias, b.sunBias, t),
      rimColor: this.lerpHexColor(a.rimColor, b.rimColor, t),
      rimAlpha: Phaser.Math.Linear(a.rimAlpha, b.rimAlpha, t),
      horizonColor: this.lerpHexColor(a.horizonColor, b.horizonColor, t),
      horizonAlpha: Phaser.Math.Linear(a.horizonAlpha, b.horizonAlpha, t),
      horizonSide: side,
      groundTintColor: this.lerpHexColor(a.groundTintColor, b.groundTintColor, t),
      groundTintAlpha: Phaser.Math.Linear(a.groundTintAlpha, b.groundTintAlpha, t),
      skyOuterColor: this.lerpHexColor(a.skyOuterColor, b.skyOuterColor, t),
      skyInnerColor: this.lerpHexColor(a.skyInnerColor, b.skyInnerColor, t),
      terrainSoil: this.lerpHexColor(a.terrainSoil, b.terrainSoil, t),
      terrainDune: this.lerpHexColor(a.terrainDune, b.terrainDune, t),
      craterShade: this.lerpHexColor(a.craterShade, b.craterShade, t),
      craterRim: this.lerpHexColor(a.craterRim, b.craterRim, t),
      walkwayColor: this.lerpHexColor(a.walkwayColor, b.walkwayColor, t),
      gridTint: this.lerpHexColor(a.gridTint, b.gridTint, t),
      rockBody: this.lerpHexColor(a.rockBody, b.rockBody, t),
    });

    if (h < 5.0) {
      return NIGHT;
    }
    if (h < 6.4) {
      // Pre-dawn Night -> Warm Coral Sunrise
      return blendPalette(NIGHT, SUNRISE, (h - 5.0) / 1.4, 'east');
    }
    if (h < 8.5) {
      // Sunrise -> Bright Morning Sun
      return blendPalette(SUNRISE, DAY, (h - 6.4) / 2.1, 'east');
    }
    if (h < 15.5) {
      // Bright Daytime with slow overhead sun shadow sweep (-3 -> +7)
      const t = (h - 8.5) / 7.0;
      return {
        ...DAY,
        shadowDx: Phaser.Math.Linear(-3, 7, t),
        shadowDy: 6.2 + Math.sin(t * Math.PI) * 1.4,
        sunBias: Phaser.Math.Linear(-0.22, 0.25, t),
      };
    }
    if (h < 18.0) {
      // Afternoon -> Rich Amber/Coral/Deep Orange Sunset with long violet shadows
      return blendPalette(DAY, SUNSET, (h - 15.5) / 2.5, 'west');
    }
    if (h < 20.0) {
      // Sunset -> Deep Navy/Indigo Nightfall
      return blendPalette(SUNSET, NIGHT, (h - 18.0) / 2.0, 'west');
    }
    return NIGHT;
  }

  private renderDayNightCycle(state: GameState) {
    if (!this.dayNightOverlay || !this.outpostLightsLayer) return;

    const lighting = this.computeDayNightLighting(this.displayHours);

    if (Math.abs(this.displayHours - this.lastTerrainHours) > 0.005) {
      this.lastTerrainHours = this.displayHours;
      this.redrawTerrainAtmosphere(lighting);
    }

    if (this.groundSunTintLayer) {
      this.groundSunTintLayer.clear();
      if (lighting.groundTintAlpha > 0.005) {
        this.groundSunTintLayer.fillStyle(lighting.groundTintColor, lighting.groundTintAlpha);
        this.groundSunTintLayer.fillRoundedRect(-24, -18, WORLD_WIDTH + 48, WORLD_HEIGHT + 36, 20);
      }
    }

    if (this.skyHorizonLayer) {
      this.skyHorizonLayer.clear();
      if (lighting.horizonAlpha > 0.01 && lighting.horizonSide !== 'none') {
        const isEast = lighting.horizonSide === 'east';
        // Layered gradient horizon haze washing in from sun/moon direction without crossing buildings harshly
        const bandX = isEast ? WORLD_WIDTH - 280 : -340;
        this.skyHorizonLayer.fillStyle(lighting.horizonColor, lighting.horizonAlpha * 0.24);
        this.skyHorizonLayer.fillRect(bandX, -420, 640, WORLD_HEIGHT + 840);
        const rimX = isEast ? WORLD_WIDTH - 60 : -220;
        this.skyHorizonLayer.fillStyle(lighting.horizonColor, lighting.horizonAlpha * 0.42);
        this.skyHorizonLayer.fillRect(rimX, -420, 320, WORLD_HEIGHT + 840);
      }
    }

    // Warm artificial ground light pools spilling from habitats & systems (under buildings!)
    if (this.groundLightsLayer) {
      this.groundLightsLayer.clear();
      if (lighting.nightFactor > 0.1 && state.screen !== 'TITLE_MENU') {
        const nf = lighting.nightFactor;
        const groundSpecs: Array<{
          id: BuildingId;
          outerColor: number;
          innerColor: number;
          radius: number;
          alpha: number;
        }> = [
          { id: 'main_habitat', outerColor: 0xff9f43, innerColor: 0xffd773, radius: 138, alpha: 0.34 },
          { id: 'greenhouse', outerColor: 0xff80c4, innerColor: 0xffc2e2, radius: 126, alpha: 0.3 },
          { id: 'oxygen_generator', outerColor: 0x5ee0d4, innerColor: 0xb0fff4, radius: 86, alpha: 0.24 },
          { id: 'water_recycling', outerColor: 0x6cc8ff, innerColor: 0xbde8ff, radius: 86, alpha: 0.24 },
          { id: 'maintenance_facility', outerColor: 0xffad4d, innerColor: 0xffe08a, radius: 98, alpha: 0.28 },
          {
            id: 'radiation_shelter',
            outerColor: 0xffb85c,
            innerColor: 0xffe4a3,
            radius: state.crew.inShelter ? 105 : 82,
            alpha: state.crew.inShelter ? 0.34 : 0.22,
          },
          { id: 'energy_storage', outerColor: 0xffb84d, innerColor: 0xffe28a, radius: 72, alpha: 0.22 },
          { id: 'water_storage', outerColor: 0x6cc8ff, innerColor: 0xaee2ff, radius: 68, alpha: 0.18 },
          { id: 'food_storage', outerColor: 0x8be2ff, innerColor: 0xd4f4ff, radius: 68, alpha: 0.18 },
        ];

        for (const spec of groundSpecs) {
          const bState = state.buildings[spec.id];
          if (bState.status === 'inactive') continue;
          const visual = this.buildingVisuals.get(spec.id);
          if (!visual) continue;
          const factor = bState.status === 'operational' ? nf : nf * 0.48;
          this.groundLightsLayer.fillStyle(spec.outerColor, spec.alpha * 0.55 * factor);
          this.groundLightsLayer.fillCircle(visual.baseX, visual.baseY + 8, spec.radius);
          this.groundLightsLayer.fillStyle(spec.innerColor, spec.alpha * factor);
          this.groundLightsLayer.fillCircle(visual.baseX, visual.baseY + 6, spec.radius * 0.58);
        }
      }
    }

    this.dayNightOverlay.clear();
    if (lighting.tintAlpha > 0.004) {
      this.dayNightOverlay.fillStyle(lighting.tintColor, lighting.tintAlpha);
      this.dayNightOverlay.fillRect(-1200, -1000, WORLD_WIDTH + 2400, WORLD_HEIGHT + 2000);
    }

    // Twinkling multi-hue stars at night/dawn/dusk
    for (const s of this.nightStars) {
      if (lighting.nightFactor <= 0.12) {
        s.circle.setAlpha(0);
      } else {
        const twinkle = this.reducedMotion
          ? 1
          : 0.6 + 0.4 * Math.sin(this.elapsedTime * 2.3 + s.phase);
        s.circle.setAlpha(s.baseAlpha * lighting.nightFactor * twinkle);
      }
    }

    // Gentle overhead atmospheric light bloom + astronaut headlamps at dusk/night (keeps buildings sharp!)
    this.outpostLightsLayer.clear();
    if (lighting.nightFactor > 0.1 && state.screen !== 'TITLE_MENU') {
      const nf = lighting.nightFactor;
      const litSpecs: Array<{
        id: BuildingId;
        color: number;
        radius: number;
        alpha: number;
      }> = [
        { id: 'main_habitat', color: 0xffd773, radius: 96, alpha: 0.16 },
        { id: 'greenhouse', color: 0xffb7df, radius: 92, alpha: 0.15 },
        { id: 'oxygen_generator', color: 0x7be0d6, radius: 66, alpha: 0.12 },
        { id: 'water_recycling', color: 0x8be2ff, radius: 66, alpha: 0.12 },
        { id: 'maintenance_facility', color: 0xffe08a, radius: 72, alpha: 0.14 },
        { id: 'radiation_shelter', color: 0xffdf99, radius: 74, alpha: state.crew.inShelter ? 0.18 : 0.11 },
      ];

      for (const spec of litSpecs) {
        const bState = state.buildings[spec.id];
        if (bState.status === 'inactive') continue;
        const visual = this.buildingVisuals.get(spec.id);
        if (!visual) continue;
        const factor = bState.status === 'operational' ? nf : nf * 0.45;
        this.outpostLightsLayer.fillStyle(spec.color, spec.alpha * factor);
        this.outpostLightsLayer.fillCircle(visual.baseX, visual.baseY, spec.radius);
      }

      // Astronaut helmet lamps + GIL cool-cyan beacon light (off once inside shelter or tucked sleeping)
      const isTuckedInside = state.crew.inShelter || state.sleepPhase === 'sleeping';
      if (this.nas && !isTuckedInside) {
        this.outpostLightsLayer.fillStyle(0xfff1bf, 0.28 * nf);
        this.outpostLightsLayer.fillCircle(this.nas.x, this.nas.y - 4, 34);
      }
      if (this.gil && !isTuckedInside) {
        this.outpostLightsLayer.fillStyle(0x8be2ff, 0.28 * nf);
        this.outpostLightsLayer.fillCircle(this.gil.x, this.gil.y, 26);
      }
      if (!isTuckedInside) {
        for (const agent of this.crewAgents) {
          this.outpostLightsLayer.fillStyle(0xfff1bf, 0.18 * nf);
          this.outpostLightsLayer.fillCircle(agent.container.x, agent.container.y - 3, 24);
        }
      }
    }
  }

  private setupCameraAndInput() {
    if (this.input.keyboard) {
      this.keys = {
        W: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        A: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        S: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        D: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
        UP: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
        LEFT: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
        DOWN: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
        RIGHT: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      };

      window.addEventListener('blur', () => {
        if (!this.keys) return;
        Object.values(this.keys).forEach((k) => k.reset());
      });
    }

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (gameStore.getState().screen !== 'PLAYING') return;
      this.isDragging = true;
      this.activePointerId = pointer.id;
      this.wasDragged = false;
      this.dragStartX = pointer.x;
      this.dragStartY = pointer.y;
      this.camStartX = this.cameras.main.scrollX;
      this.camStartY = this.cameras.main.scrollY;
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.isDragging || pointer.id !== this.activePointerId || !pointer.isDown) return;
      const dx = pointer.x - this.dragStartX;
      const dy = pointer.y - this.dragStartY;
      if (Math.hypot(dx, dy) > 7) {
        if (!this.wasDragged) {
          this.wasDragged = true;
          this.input.setDefaultCursor('grabbing');
          for (const visual of this.buildingVisuals.values()) {
            visual.container.setScale(1);
          }
        }
      }
      if (this.wasDragged) {
        const zoom = this.cameras.main.zoom;
        this.cameras.main.scrollX = this.camStartX - dx / zoom;
        this.cameras.main.scrollY = this.camStartY - dy / zoom;
        this.clampCameraScroll();
      }
    });

    const endDrag = (pointer?: Phaser.Input.Pointer, currentlyOver?: unknown[]) => {
      if (pointer && this.activePointerId !== null && pointer.id !== this.activePointerId) return;
      const currentState = gameStore.getState();
      if (
        pointer &&
        !this.wasDragged &&
        currentState.screen === 'PLAYING' &&
        currentState.activeEvent &&
        currentState.activeEvent.animationRemaining > 0
      ) {
        this.spawnEventTapRipple(pointer.worldX, pointer.worldY, currentState.activeEvent.definition.id);
        soundFX.playSelect();
      }
      const shouldDeselect =
        Boolean(pointer) &&
        !this.wasDragged &&
        Array.isArray(currentlyOver) &&
        currentlyOver.length === 0 &&
        currentState.screen === 'PLAYING' &&
        currentState.selectedBuildingId !== null;
      this.isDragging = false;
      this.activePointerId = null;
      this.input.setDefaultCursor('default');
      if (shouldDeselect) {
        gameStore.selectBuilding(null);
      }
    };

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer, currentlyOver: unknown[]) =>
      endDrag(pointer, currentlyOver)
    );
    this.input.on('pointerupoutside', (pointer: Phaser.Input.Pointer) => endDrag(pointer));
    this.input.on('gameout', () => endDrag());

    this.input.on(
      'wheel',
      (_pointer: Phaser.Input.Pointer, _objs: unknown, _dx: number, dy: number) => {
        if (gameStore.getState().screen !== 'PLAYING') return;
        const cam = this.cameras.main;
        const nextZoom = Phaser.Math.Clamp(cam.zoom - dy * 0.0008, 0.45, 1.45);
        cam.setZoom(nextZoom);
        this.clampCameraScroll();
      }
    );
  }

  private syncWithGameState(state: GameState) {
    const lighting = this.computeDayNightLighting(this.displayHours);
    for (const def of BUILDING_LIST) {
      const visual = this.buildingVisuals.get(def.id);
      if (!visual) continue;

      const bState = state.buildings[def.id];
      drawBuildingGraphics(
        visual.graphics,
        def.id,
        visual.width,
        visual.height,
        bState,
        def.id === 'greenhouse' ? state.greenhouseCrop : null,
        this.elapsedTime,
        {
          inShelter: state.crew.inShelter,
          isSleeping: state.sleepPhase === 'sleeping',
          shadowDx: lighting.shadowDx,
          shadowDy: lighting.shadowDy,
          shadowAlpha: lighting.shadowAlpha,
          shadowColor: lighting.shadowColor,
          nightFactor: lighting.nightFactor,
          sunBias: lighting.sunBias,
          rimColor: lighting.rimColor,
          rimAlpha: lighting.rimAlpha,
        }
      );

      // Selection highlight ring (drawn cleanly and animated in update loop)
      this.drawSelectionHighlight(visual, state.selectedBuildingId === def.id && state.screen === 'PLAYING', 1);

      // Clear kid-friendly icon/short state tag above buildings needing attention
      const needsRestorationFirst = !bState.restoredOnce || bState.status === 'inactive';
      const pendingAtThis =
        state.pendingAction?.buildingId === def.id ? state.pendingAction : null;

      if (pendingAtThis?.phase === 'working' || visual.restoringUntil > this.elapsedTime) {
        const k = pendingAtThis?.taskKind ?? this.activeWorkAnim?.kind;
        visual.statusTag.setText(
          k === 'plant'
            ? 'Planting...'
            : k === 'harvest'
            ? 'Harvesting...'
            : k === 'clean'
            ? 'Cleaning...'
            : 'Building...'
        );
        visual.statusTag.setBackgroundColor('#477C9B');
        visual.statusTag.setVisible(true);
      } else if (pendingAtThis?.phase === 'walking') {
        visual.statusTag.setText('On Way...');
        visual.statusTag.setBackgroundColor('#718B78');
        visual.statusTag.setVisible(true);
      } else if (needsRestorationFirst) {
        visual.statusTag.setText('Fix!');
        visual.statusTag.setBackgroundColor(
          bState.status === 'inactive' ? '#C94B43' : '#D77B4A'
        );
        visual.statusTag.setVisible(true);
      } else if (bState.status === 'damaged') {
        visual.statusTag.setText(`Repair ${bState.condition}%`);
        visual.statusTag.setBackgroundColor('#D77B4A');
        visual.statusTag.setVisible(true);
      } else if (def.id === 'solar_panels' && bState.dustLevel >= 35) {
        visual.statusTag.setText('Dust!');
        visual.statusTag.setBackgroundColor('#D77B4A');
        visual.statusTag.setVisible(true);
      } else if (def.id === 'greenhouse' && state.greenhouseCrop?.isMature) {
        visual.statusTag.setText('Harvest!');
        visual.statusTag.setBackgroundColor('#718B78');
        visual.statusTag.setVisible(true);
      } else {
        visual.statusTag.setVisible(false);
      }
    }

    // Event transition triggers (weather tint rendered smoothly in update())
    const activeEvent = state.activeEvent;
    const eventKey = activeEvent
      ? `${activeEvent.dayTriggered}:${activeEvent.definition.id}`
      : null;

    if (eventKey !== this.lastActiveEventKey) {
      this.lastActiveEventKey = eventKey;
      if (activeEvent?.definition.id === 'marsquake') {
        this.triggerQuakeBurst();
      } else {
        this.quakeEndAt = 0;
      }
    }

    this.renderEnvironmentalScars(state.environmentalScars);

    if (state.screen === 'PLAYING' && this.lastScreen === 'TITLE_MENU') {
      this.centerCameraOnOutpost();
    }
    this.lastScreen = state.screen;

    if (state.crew.inShelter && state.sleepPhase === 'idle' && state.sleepingRemaining <= 0) {
      const shelterBounds = gridManager.getBuildingBounds(BUILDING_DEFINITIONS.radiation_shelter);
      const nasSlot = this.getShelterSlots(shelterBounds)[0];
      if (
        this.nas &&
        this.nasPath.length === 0 &&
        Math.hypot(this.nas.x - nasSlot.x, this.nas.y - nasSlot.y) > 4
      ) {
        this.setNasDestination(nasSlot.x, nasSlot.y, 'radiation_shelter');
      }
    }
  }

  private getShelterSlots(bounds: { centerX: number; centerY: number }): Point2D[] {
    return [
      { x: bounds.centerX - 24, y: bounds.centerY - 18 },
      { x: bounds.centerX + 24, y: bounds.centerY - 18 },
      { x: bounds.centerX - 24, y: bounds.centerY + 22 },
      { x: bounds.centerX + 24, y: bounds.centerY + 22 },
    ];
  }

  private getHabitatSleepSlots(bounds: { centerX: number; centerY: number }): Point2D[] {
    return [
      { x: bounds.centerX - 20, y: bounds.centerY + 4 },
      { x: bounds.centerX + 20, y: bounds.centerY + 4 },
      { x: bounds.centerX - 20, y: bounds.centerY + 22 },
      { x: bounds.centerX + 20, y: bounds.centerY + 22 },
    ];
  }

  private isInsideBuildingFootprint(x: number, y: number, buildingId: BuildingId): boolean {
    const b = gridManager.getBuildingBounds(BUILDING_DEFINITIONS[buildingId]);
    return x >= b.x - 10 && x <= b.x + b.width + 10 && y >= b.y - 10 && y <= b.y + b.height + 10;
  }

  private buildCharacterPath(
    startX: number,
    startY: number,
    goalX: number,
    goalY: number,
    allowInsideBuildingId?: BuildingId
  ): { path: Point2D[]; permitBuildingId?: BuildingId } {
    let curInside: BuildingId | undefined = undefined;
    if (this.isInsideBuildingFootprint(startX, startY, 'radiation_shelter')) {
      curInside = 'radiation_shelter';
    } else if (this.isInsideBuildingFootprint(startX, startY, 'main_habitat')) {
      curInside = 'main_habitat';
    }

    // If entering an interior building, walk cleanly around obstacles to its airlock doorstep first
    if (allowInsideBuildingId) {
      if (curInside === allowInsideBuildingId) {
        return { path: [{ x: goalX, y: goalY }], permitBuildingId: allowInsideBuildingId };
      }
      const targetDoor = gridManager.getBuildingDoorstep(allowInsideBuildingId, startX, startY);
      if (curInside && curInside !== allowInsideBuildingId) {
        const exitDoor = gridManager.getBuildingDoorstep(curInside);
        const between = gridManager.findPath(exitDoor.x, exitDoor.y, targetDoor.x, targetDoor.y);
        return {
          path: [exitDoor, ...between, { x: goalX, y: goalY }],
          permitBuildingId: allowInsideBuildingId,
        };
      }
      const outsidePath = gridManager.findPath(startX, startY, targetDoor.x, targetDoor.y);
      return {
        path: [...outsidePath, { x: goalX, y: goalY }],
        permitBuildingId: allowInsideBuildingId,
      };
    }

    // Leaving an interior building to an outdoor location: step out airlock first
    if (curInside) {
      const exitDoor = gridManager.getBuildingDoorstep(curInside);
      const rest = gridManager.findPath(exitDoor.x, exitDoor.y, goalX, goalY);
      return {
        path: [exitDoor, ...rest],
        permitBuildingId: curInside,
      };
    }

    return {
      path: gridManager.findPath(startX, startY, goalX, goalY),
      permitBuildingId: undefined,
    };
  }

  private setNasDestination(goalX: number, goalY: number, allowInsideBuildingId?: BuildingId) {
    if (!this.nas) return;
    const built = this.buildCharacterPath(
      this.nas.x,
      this.nas.y,
      goalX,
      goalY,
      allowInsideBuildingId
    );
    this.nasPath = built.path;
    this.nasAllowInsideBuildingId = built.permitBuildingId;
  }

  private setAgentDestination(
    agent: CrewAgent,
    goalX: number,
    goalY: number,
    allowInsideBuildingId?: BuildingId
  ) {
    if (!agent.container) return;
    const built = this.buildCharacterPath(
      agent.container.x,
      agent.container.y,
      goalX,
      goalY,
      allowInsideBuildingId
    );
    agent.path = built.path;
    agent.allowInsideBuildingId = built.permitBuildingId;
  }

  private sendCrewToSleepInHabitat() {
    const habBounds = gridManager.getBuildingBounds(BUILDING_DEFINITIONS.main_habitat);
    const sleepSlots = this.getHabitatSleepSlots(habBounds);
    if (this.nas) {
      this.setNasDestination(sleepSlots[0].x, sleepSlots[0].y, 'main_habitat');
    }
    this.crewAgents.forEach((agent, idx) => {
      const slot = sleepSlots[idx + 1] ?? sleepSlots[0];
      this.setAgentDestination(agent, slot.x, slot.y, 'main_habitat');
      agent.waitUntil = this.elapsedTime + 999;
    });
  }

  private placeCrewAtMorningPost() {
    const state = gameStore.getState();
    if (state.crew.inShelter) return;
    const habBounds = gridManager.getBuildingBounds(BUILDING_DEFINITIONS.main_habitat);
    const frontY = habBounds.y + habBounds.height + 24;
    if (this.nas) {
      this.nas.setPosition(habBounds.centerX - 18, frontY);
      this.nas.setScale(1.08);
      this.nas.setAlpha(1);
      this.nasPath = [];
      this.nasAllowInsideBuildingId = undefined;
    }
    if (this.gil) {
      this.gil.setPosition(habBounds.centerX + 26, frontY - 18);
      this.gil.setScale(1);
      this.gil.setAlpha(1);
    }
    const offsets = [-72, 38, 92];
    this.crewAgents.forEach((agent, i) => {
      agent.container.setPosition(habBounds.centerX + (offsets[i] ?? 0), frontY - (i === 2 ? 4 : 0));
      agent.container.setScale(0.92);
      agent.container.setAlpha(1);
      agent.path = [];
      agent.allowInsideBuildingId = undefined;
      agent.waitUntil = this.elapsedTime + 1.2 + i * 0.9;
    });
  }

  private runNasToBuilding(buildingId: BuildingId) {
    const st = gameStore.getState();
    if (st.sleepPhase !== 'idle' || st.sleepingRemaining > 0) return;
    const doorstep = gridManager.getBuildingDoorstep(buildingId, this.nas?.x, this.nas?.y);
    this.setNasDestination(doorstep.x, doorstep.y);
  }

  private handleWorldFeedback(evt: WorldFeedbackEvent) {
    if (evt.type === 'task_assigned') {
      this.activeWorkAnim = null;
      this.runNasToBuilding(evt.buildingId);

      // Have the nearest crew helper walk nearby around obstacles to assist
      const helper = this.crewAgents[0];
      const st = gameStore.getState();
      if (helper && !st.crew.inShelter && st.sleepPhase === 'idle' && st.sleepingRemaining <= 0) {
        const door = gridManager.getBuildingDoorstep(
          evt.buildingId,
          helper.container.x,
          helper.container.y
        );
        const safeAssist = gridManager.pushOutOfBuildings(door.x + 28, door.y, 12);
        this.setAgentDestination(helper, safeAssist.x, safeAssist.y);
        helper.waitUntil = this.elapsedTime + 4.2;
      }
    } else if (evt.type === 'work_started') {
      this.activeWorkAnim = {
        buildingId: evt.buildingId,
        kind: evt.taskKind,
        startedAt: this.elapsedTime,
        duration: evt.duration,
        label: evt.label,
      };

      const visual = this.buildingVisuals.get(evt.buildingId);
      if (visual) {
        visual.restoringUntil = this.elapsedTime + evt.duration;
        visual.statusTag.setText(
          evt.taskKind === 'plant'
            ? 'Planting...'
            : evt.taskKind === 'harvest'
            ? 'Harvesting...'
            : evt.taskKind === 'clean'
            ? 'Cleaning...'
            : 'Building...'
        );
        visual.statusTag.setBackgroundColor('#477C9B');
        visual.statusTag.setVisible(true);

        this.tweens.add({
          targets: visual.container,
          scaleX: 1.07,
          scaleY: 1.07,
          duration: 140,
          yoyo: true,
          ease: 'Sine.easeOut',
        });
      }
    } else if (evt.type === 'task' || evt.type === 'plant' || evt.type === 'harvest') {
      const kind: ActionAnimKind =
        evt.type === 'plant'
          ? 'plant'
          : evt.type === 'harvest'
          ? 'harvest'
          : evt.taskKind ?? 'repair';

      const labelText =
        evt.type === 'harvest'
          ? `+${evt.amount} Food!`
          : evt.type === 'plant'
          ? 'Seeds Planted!'
          : kind === 'clean'
          ? 'Sparkling Clean!'
          : kind === 'restore'
          ? 'System Restored!'
          : evt.conditionGain && evt.conditionGain > 0
          ? `Repaired +${evt.conditionGain}%!`
          : 'Repaired!';

      const visual = this.buildingVisuals.get(evt.buildingId);
      this.activeWorkAnim = null;
      if (visual) {
        visual.restoringUntil = 0;
        this.triggerWorkCompletion(
          {
            buildingId: evt.buildingId,
            kind,
            startedAt: this.elapsedTime,
            duration: 0.1,
            label: labelText,
          },
          visual
        );
      }
    } else if (evt.type === 'shelter') {
      const targetDef = evt.inShelter
        ? BUILDING_DEFINITIONS.radiation_shelter
        : BUILDING_DEFINITIONS.main_habitat;
      const bounds = gridManager.getBuildingBounds(targetDef);
      if (evt.inShelter) {
        const slots = this.getShelterSlots(bounds);
        this.setNasDestination(slots[0].x, slots[0].y, 'radiation_shelter');
        this.crewAgents.forEach((agent, i) => {
          const slot = slots[i + 1] ?? slots[0];
          this.setAgentDestination(agent, slot.x, slot.y, 'radiation_shelter');
          agent.waitUntil = this.elapsedTime + 999;
        });
      } else {
        const frontY = bounds.y + bounds.height + 24;
        this.setNasDestination(bounds.centerX - 18, frontY);
        const offsets = [-72, 38, 92];
        this.crewAgents.forEach((agent, i) => {
          const safeOut = gridManager.pushOutOfBuildings(
            bounds.centerX + (offsets[i] ?? 0),
            frontY - (i === 2 ? 4 : 0),
            12
          );
          this.setAgentDestination(agent, safeOut.x, safeOut.y);
          agent.waitUntil = this.elapsedTime + 1.8;
        });
      }
      this.spawnCompletionBurst(bounds.centerX, bounds.centerY, 'restore', targetDef.id);
      this.spawnFloatingFeedback(
        bounds.centerX,
        bounds.centerY - 24,
        evt.inShelter ? 'Crew Safe Inside!' : 'Crew Outside!'
      );
    } else if (evt.type === 'sleep_start') {
      this.activeWorkAnim = null;
      this.sendCrewToSleepInHabitat();
      const habBounds = gridManager.getBuildingBounds(BUILDING_DEFINITIONS.main_habitat);
      this.spawnFloatingFeedback(habBounds.centerX, habBounds.centerY - 28, 'Heading Home to Sleep!');
    } else if (evt.type === 'focus_building') {
      const def = BUILDING_DEFINITIONS[evt.buildingId];
      const bounds = gridManager.getBuildingBounds(def);
      const st = gameStore.getState();
      if (st.pendingAction?.phase !== 'walking' && st.pendingAction?.phase !== 'working') {
        this.runNasToBuilding(evt.buildingId);
      }
      this.cameras.main.pan(bounds.centerX, bounds.centerY, 320, 'Sine.easeOut', true);

      const visual = this.buildingVisuals.get(evt.buildingId);
      if (visual) {
        this.tweens.add({
          targets: visual.container,
          scaleX: 1.07,
          scaleY: 1.07,
          duration: 150,
          yoyo: true,
          ease: 'Sine.easeOut',
        });
      }
    } else if (evt.type === 'decision') {
      const impacts = evt.buildingImpacts ?? [];
      if (impacts.length > 0) {
        impacts.forEach((impact, idx) => {
          const visual = this.buildingVisuals.get(impact.buildingId);
          if (!visual) return;
          const isPositive = impact.conditionDelta >= 0;
          const label = isPositive
            ? `+${impact.conditionDelta}% Health`
            : `${impact.conditionDelta}% Health`;
          this.time.delayedCall(idx * 120, () => {
            this.spawnFloatingFeedback(
              visual.baseX,
              visual.baseY - visual.height / 2 - 14,
              label
            );
            if (isPositive) {
              this.spawnCompletionBurst(visual.baseX, visual.baseY, 'repair', impact.buildingId);
            } else {
              this.spawnDamageImpactRing(visual.baseX, visual.baseY, visual.width, visual.height);
            }
          });
        });
      } else {
        const hab = this.buildingVisuals.get('main_habitat');
        if (hab) {
          this.spawnCompletionBurst(hab.baseX, hab.baseY, 'restore', 'main_habitat');
          this.spawnFloatingFeedback(hab.baseX, hab.baseY - 24, evt.choiceTitle);
        }
      }
    } else if (evt.type === 'end_day') {
      this.placeCrewAtMorningPost();
      if (evt.buildingImpacts?.length) {
        evt.buildingImpacts.forEach((impact, idx) => {
          const visual = this.buildingVisuals.get(impact.buildingId);
          if (!visual) return;

          const msgParts: string[] = [];
          if (impact.conditionDelta < 0) msgParts.push(`${impact.conditionDelta}% Health`);
          if (impact.dustAdded && impact.dustAdded > 0) msgParts.push(`+${impact.dustAdded}% Dust`);
          if (msgParts.length > 0) {
            this.time.delayedCall(idx * 140, () => {
              this.spawnFloatingFeedback(
                visual.baseX,
                visual.baseY - visual.height / 2 - 14,
                msgParts.join(' · ')
              );
              this.spawnDamageImpactRing(visual.baseX, visual.baseY, visual.width, visual.height);
            });
          }
        });
      }
    } else if (evt.type === 'event_impact' && evt.buildingImpacts?.length) {
      if (!this.reducedMotion && gameStore.getState().screen === 'PLAYING') {
        this.cameras.main.shake(280, 0.0055);
      }
      evt.buildingImpacts.forEach((impact, idx) => {
        const visual = this.buildingVisuals.get(impact.buildingId);
        if (!visual) return;

        const msgParts: string[] = [];
        if (impact.conditionDelta < 0) msgParts.push(`${impact.conditionDelta}% Health`);
        if (impact.dustAdded && impact.dustAdded > 0) msgParts.push(`+${impact.dustAdded}% Dust`);
        if (msgParts.length > 0) {
          this.time.delayedCall(idx * 140, () => {
            this.spawnFloatingFeedback(
              visual.baseX,
              visual.baseY - visual.height / 2 - 14,
              msgParts.join(' · ')
            );
            this.spawnDamageImpactRing(visual.baseX, visual.baseY, visual.width, visual.height);
          });
        }
      });
    }
  }

  private drawSelectionHighlight(visual: BuildingVisual, isSelected: boolean, pulseAlpha: number) {
    visual.selectionRing.clear();
    if (!isSelected) return;

    const hw = visual.width / 2;
    const hh = visual.height / 2;

    // Outer warm gold glow frame
    visual.selectionRing.lineStyle(6, 0xf4c552, 0.45 * pulseAlpha);
    visual.selectionRing.strokeRoundedRect(-hw - 8, -hh - 8, visual.width + 16, visual.height + 16, 14);

    // Crisp inner bright border
    visual.selectionRing.lineStyle(3.5, PALETTE.creamLight, 1);
    visual.selectionRing.strokeRoundedRect(-hw - 4, -hh - 4, visual.width + 8, visual.height + 8, 12);

    // Corner focus brackets for instant recognition
    const bLen = 12;
    const bx = hw + 9;
    const by = hh + 9;
    visual.selectionRing.lineStyle(3, 0xf4c552, 1);
    // Top-left
    visual.selectionRing.lineBetween(-bx, -by + bLen, -bx, -by);
    visual.selectionRing.lineBetween(-bx, -by, -bx + bLen, -by);
    // Top-right
    visual.selectionRing.lineBetween(bx - bLen, -by, bx, -by);
    visual.selectionRing.lineBetween(bx, -by, bx, -by + bLen);
    // Bottom-left
    visual.selectionRing.lineBetween(-bx, by - bLen, -bx, by);
    visual.selectionRing.lineBetween(-bx, by, -bx + bLen, by);
    // Bottom-right
    visual.selectionRing.lineBetween(bx - bLen, by, bx, by);
    visual.selectionRing.lineBetween(bx, by - bLen, bx, by);
  }

  private spawnFloatingFeedback(x: number, y: number, text: string) {
    const popup = this.add
      .text(x, y, text, {
        fontFamily: '"Plus Jakarta Sans", sans-serif',
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#292C2B',
        backgroundColor: '#FAF0DC',
        padding: { x: 8, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(80);

    this.tweens.add({
      targets: popup,
      y: y - 34,
      alpha: 0,
      duration: 1100,
      ease: 'Cubic.easeOut',
      onComplete: () => popup.destroy(),
    });
  }

  public update(_time: number, rawDeltaMs: number) {
    const dt = Math.min(rawDeltaMs / 1000, 0.05);
    this.elapsedTime += dt;

    const state = gameStore.getState();
    const isReturningToSleep = state.sleepPhase === 'returning';
    const isSleeping =
      state.sleepPhase === 'sleeping' ||
      (state.sleepPhase === 'idle' && state.sleepingRemaining > 0);
    const isHeadingHome = isReturningToSleep || isSleeping;
    const targetDisplayHour = isHeadingHome ? Math.max(state.hoursElapsed, 21.0) : state.hoursElapsed;

    // Smoothly transition visual time-of-day toward target (snap on new day or reset)
    if (this.reducedMotion || (!isHeadingHome && state.hoursElapsed < this.displayHours - 0.5)) {
      this.displayHours = targetDisplayHour;
    } else {
      const lerpSpeed = isHeadingHome ? 1.45 : 1.65;
      this.displayHours = Phaser.Math.Linear(
        this.displayHours,
        targetDisplayHour,
        Math.min(1, dt * lerpSpeed)
      );
      if (Math.abs(this.displayHours - targetDisplayHour) < 0.002) {
        this.displayHours = targetDisplayHour;
      }
    }

    const lighting = this.computeDayNightLighting(this.displayHours);
    const lightingChanged = Math.abs(this.displayHours - this.lastDrawnHours) > 0.002;
    if (lightingChanged) {
      this.lastDrawnHours = this.displayHours;
    }
    this.renderDayNightCycle(state);

    // Animate operational machinery (O2 fans, water ripples, habitat beacon) & shifting sun shadows
    for (const def of BUILDING_LIST) {
      const visual = this.buildingVisuals.get(def.id);
      if (!visual) continue;
      const bState = state.buildings[def.id];

      if (bState.status === 'operational' || lightingChanged) {
        drawBuildingGraphics(
          visual.graphics,
          def.id,
          visual.width,
          visual.height,
          bState,
          def.id === 'greenhouse' ? state.greenhouseCrop : null,
          this.elapsedTime,
          {
            inShelter: state.crew.inShelter,
            isSleeping,
            shadowDx: lighting.shadowDx,
            shadowDy: lighting.shadowDy,
            shadowAlpha: lighting.shadowAlpha,
            shadowColor: lighting.shadowColor,
            nightFactor: lighting.nightFactor,
            sunBias: lighting.sunBias,
            rimColor: lighting.rimColor,
            rimAlpha: lighting.rimAlpha,
          }
        );
      }

      if (state.selectedBuildingId === def.id && state.screen === 'PLAYING') {
        const pulse = 0.65 + 0.35 * Math.sin(this.elapsedTime * 5);
        this.drawSelectionHighlight(visual, true, pulse);
      }

      visual.workBar.clear();
      const workingHere =
        state.pendingAction?.phase === 'working' && state.pendingAction.buildingId === def.id
          ? state.pendingAction
          : null;
      if (workingHere) {
        const pct = Math.min(
          1,
          Math.max(
            0,
            (workingHere.workDurationSec - workingHere.workRemainingSec) /
              Math.max(0.1, workingHere.workDurationSec)
          )
        );
        const bw = 78;
        visual.workBar.fillStyle(PALETTE.charcoal, 1);
        visual.workBar.fillRoundedRect(-bw / 2 - 2, -7, bw + 4, 14, 5);
        visual.workBar.fillStyle(
          workingHere.taskKind === 'plant' || workingHere.taskKind === 'harvest'
            ? PALETTE.lifeGreenBright
            : workingHere.taskKind === 'clean'
            ? 0xf4c552
            : PALETTE.techBlueLight,
          1
        );
        visual.workBar.fillRoundedRect(-bw / 2, -5, Math.max(6, bw * pct), 10, 3);
      }
    }

    if (state.screen === 'TITLE_MENU') {
      const cam = this.cameras.main;
      const targetX = WORLD_WIDTH / 2 + 40 + Math.sin(this.elapsedTime * 0.25) * 70;
      const targetY = WORLD_HEIGHT / 2 + Math.cos(this.elapsedTime * 0.18) * 30;
      cam.centerOn(targetX, targetY);
    } else if (state.screen === 'PLAYING' && this.keys) {
      const panSpeed = 360 * dt;
      let panned = false;
      if (this.keys.A.isDown || this.keys.LEFT.isDown) {
        this.cameras.main.scrollX -= panSpeed;
        panned = true;
      }
      if (this.keys.D.isDown || this.keys.RIGHT.isDown) {
        this.cameras.main.scrollX += panSpeed;
        panned = true;
      }
      if (this.keys.W.isDown || this.keys.UP.isDown) {
        this.cameras.main.scrollY -= panSpeed;
        panned = true;
      }
      if (this.keys.S.isDown || this.keys.DOWN.isDown) {
        this.cameras.main.scrollY += panSpeed;
        panned = true;
      }
      if (panned) {
        this.clampCameraScroll();
      }
    }

    // Ensure returning/sleeping crew stays routed into main_habitat until all 4 enter
    if (isHeadingHome && this.nas) {
      const habBounds = gridManager.getBuildingBounds(BUILDING_DEFINITIONS.main_habitat);
      const habSlot = this.getHabitatSleepSlots(habBounds)[0];
      if (
        this.nasAllowInsideBuildingId !== 'main_habitat' ||
        (this.nasPath.length === 0 && !this.isInsideBuildingFootprint(this.nas.x, this.nas.y, 'main_habitat'))
      ) {
        this.setNasDestination(habSlot.x, habSlot.y, 'main_habitat');
      }
    }

    // Keep NAS walking to pendingAction doorstep if reassigned or blocked slightly
    if (
      state.screen === 'PLAYING' &&
      !isHeadingHome &&
      state.pendingAction?.phase === 'walking' &&
      this.nas
    ) {
      const doorstep = gridManager.getBuildingDoorstep(
        state.pendingAction.buildingId,
        this.nas.x,
        this.nas.y
      );
      const distToDoor = Math.hypot(this.nas.x - doorstep.x, this.nas.y - doorstep.y);
      if (distToDoor <= 18 && this.nasPath.length <= 1) {
        this.nasPath = [];
        gameStore.notifyCrewArrived(state.pendingAction.id);
      } else if (this.nasPath.length === 0) {
        this.setNasDestination(doorstep.x, doorstep.y);
      }
    }

    // Update NAS pathfinding movement + obstacle collision enforcement + articulated limbs
    let nasIsRunning = false;
    let nasMoveDirX = 0;
    if (this.nasPath.length > 0 && this.nas) {
      const nextWaypoint = this.nasPath[0];
      const dx = nextWaypoint.x - this.nas.x;
      const dy = nextWaypoint.y - this.nas.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 4) {
        nasIsRunning = true;
        nasMoveDirX = dx;
        const speed = (isHeadingHome ? 320 : 305) * dt;
        const step = Math.min(dist, speed);
        this.nas.x += (dx / dist) * step;
        this.nas.y += (dy / dist) * step;

        const pushed = gridManager.pushOutOfBuildings(
          this.nas.x,
          this.nas.y,
          12,
          this.nasAllowInsideBuildingId
        );
        this.nas.x = pushed.x;
        this.nas.y = pushed.y;

        if (!this.reducedMotion && this.elapsedTime - this.lastFootDustAt > 0.12) {
          this.lastFootDustAt = this.elapsedTime;
          this.spawnFootDust(this.nas.x, this.nas.y + 16);
        }
      } else {
        this.nasPath.shift();
        if (this.nasPath.length === 0 && !isHeadingHome && !state.crew.inShelter) {
          this.nasAllowInsideBuildingId = undefined;
        }
      }
    }

    const nasInsideHabitatSleeping =
      isHeadingHome &&
      Boolean(this.nas) &&
      this.isInsideBuildingFootprint(this.nas.x, this.nas.y, 'main_habitat');

    const nasIsWorking =
      state.pendingAction?.phase === 'working' && !nasIsRunning && !isHeadingHome;
    this.animateAstronautLimbs(
      this.nas,
      nasIsRunning,
      nasIsWorking ? state.pendingAction?.taskKind ?? this.activeWorkAnim?.kind ?? null : null,
      nasMoveDirX,
      0
    );

    if (this.nas && !this.reducedMotion && this.nasJumpUntil > this.elapsedTime) {
      const nasBody = this.nas.getByName('bodyGroup') as Phaser.GameObjects.Container | null;
      if (nasBody) {
        const jumpProgress = 1 - (this.nasJumpUntil - this.elapsedTime) / 0.36;
        nasBody.y -= Math.sin(Phaser.Math.Clamp(jumpProgress, 0, 1) * Math.PI) * 14;
      }
    }

    if (this.nas) {
      const targetScale = nasInsideHabitatSleeping
        ? 0.66
        : state.crew.inShelter && !nasIsRunning
        ? 0.76
        : 1.08;
      const targetAlpha = nasInsideHabitatSleeping
        ? 0.16
        : state.crew.inShelter && !nasIsRunning
        ? 0.94
        : 1;
      this.nas.setScale(Phaser.Math.Linear(this.nas.scaleX, targetScale, Math.min(1, dt * 8)));
      this.nas.setAlpha(Phaser.Math.Linear(this.nas.alpha, targetAlpha, Math.min(1, dt * 8)));
      const nasIndicator = this.nas.getByName('nasIndicator') as Phaser.GameObjects.Graphics | null;
      if (nasIndicator) {
        nasIndicator.setVisible(!nasInsideHabitatSleeping);
        nasIndicator.y = Math.sin(this.elapsedTime * 4) * 3.5;
      }
    }

    // Update the 3 supporting human crew members
    this.updateCrewAgents(state, dt);

    // Check if ALL 4 crew members have visibly entered Main Habitat before triggering 3s sleep!
    if (isReturningToSleep && this.nas) {
      const nasInside =
        this.nasPath.length === 0 &&
        this.isInsideBuildingFootprint(this.nas.x, this.nas.y, 'main_habitat');
      const allAgentsInside = this.crewAgents.every(
        (agent) =>
          agent.path.length === 0 &&
          this.isInsideBuildingFootprint(agent.container.x, agent.container.y, 'main_habitat')
      );
      if (nasInside && allAgentsInside) {
        gameStore.beginHabitatSleep();
      }
    }

    // Update GIL companion smoothly following NAS, inside Habitat sleeping, or hovering inside Radiation Shelter
    const gilEmotion = getContextualGilMessage(state).emotion;
    if (this.gil && this.nas) {
      const habBounds = gridManager.getBuildingBounds(BUILDING_DEFINITIONS.main_habitat);
      const shelterBounds = gridManager.getBuildingBounds(BUILDING_DEFINITIONS.radiation_shelter);
      const gilInsideHab =
        isHeadingHome && this.isInsideBuildingFootprint(this.gil.x, this.gil.y, 'main_habitat');
      const bobSpeed =
        gilEmotion === 'excited'
          ? 6.4
          : gilEmotion === 'worried'
          ? 8.0
          : gilEmotion === 'surprised'
          ? 5.5
          : 3.4;
      const bobAmp =
        gilEmotion === 'excited' ? 6.5 : gilEmotion === 'worried' ? 2.5 : 4.5;
      const worriedJitter =
        gilEmotion === 'worried' && !this.reducedMotion ? Math.sin(this.elapsedTime * 22) * 2.2 : 0;

      const targetGilX = isHeadingHome
        ? habBounds.centerX
        : state.crew.inShelter
        ? shelterBounds.centerX
        : this.nas.x + 36 + worriedJitter;
      const targetGilY = isHeadingHome
        ? habBounds.centerY - 12 + Math.sin(this.elapsedTime * 2.2) * 2.0
        : state.crew.inShelter
        ? shelterBounds.centerY - 2 + Math.sin(this.elapsedTime * 3.4) * 3.0
        : this.nas.y - 18 + Math.sin(this.elapsedTime * bobSpeed) * bobAmp;
      const prevGilX = this.gil.x;
      this.gil.x = Phaser.Math.Linear(this.gil.x, targetGilX, 0.12);
      this.gil.y = Phaser.Math.Linear(this.gil.y, targetGilY, 0.16);
      const gilTargetScale = gilInsideHab ? 0.68 : state.crew.inShelter ? 0.84 : 1.0;
      const gilTargetAlpha = gilInsideHab ? 0.18 : state.crew.inShelter ? 0.96 : 1;
      this.gil.setScale(Phaser.Math.Linear(this.gil.scaleX, gilTargetScale, Math.min(1, dt * 8)));
      this.gil.setAlpha(Phaser.Math.Linear(this.gil.alpha, gilTargetAlpha, Math.min(1, dt * 8)));
      const gilBody = this.gil.getByName('gilBody') as Phaser.GameObjects.Container | null;
      if (gilBody) {
        const excitedTilt =
          gilEmotion === 'excited' && !this.reducedMotion ? Math.sin(this.elapsedTime * 7) * 0.12 : 0;
        gilBody.rotation =
          Phaser.Math.Clamp((this.gil.x - prevGilX) * 0.04, -0.18, 0.18) + excitedTilt;
      }
    }

    // Draw contextual building construction, planting, cleaning & repair visual animations + walking marker + sleeping Zs
    this.renderActiveWorkAnimation(isSleeping, state);

    const activeEvent = state.activeEvent;
    const activeEventId = activeEvent?.definition.id ?? null;
    const animDuration = Math.max(1, activeEvent?.animationDuration ?? 1);
    const animRemaining = activeEvent?.animationRemaining ?? 0;
    const animElapsed = Math.max(0, animDuration - animRemaining);
    const fadeIn = Phaser.Math.Clamp(animElapsed / 1.6, 0, 1);
    const fadeOut = animRemaining > 0 ? Phaser.Math.Clamp(animRemaining / 2.2, 0, 1) : 0.32;
    const eventStrength = activeEvent
      ? this.reducedMotion
        ? animRemaining > 0
          ? 0.85
          : 0.3
        : animRemaining > 0
        ? fadeIn * fadeOut
        : 0.32
      : 0;

    // Smooth atmospheric weather tint overlay
    this.renderWeatherTint(state, eventStrength);

    const isDustStorm =
      activeEventId === 'dust_devils' ||
      activeEventId === 'global_dust_storm';
    const isGlobalStorm = activeEventId === 'global_dust_storm';
    const isDustDevils = activeEventId === 'dust_devils';
    const isQuake = activeEventId === 'marsquake';
    const isNeutronCascade = activeEventId === 'secondary_neutron_cascades';
    const isIceClouds = activeEventId === 'water_ice_cloud_formation';
    const isSolarFlare = activeEventId === 'solar_flare_xray_uv';
    const isSolarStorm = activeEventId === 'solar_storm_response';
    const isSepStorm = activeEventId === 'solar_energetic_particles';
    const isRadiation = Boolean(activeEvent?.definition.radiationLevel);

    // 15-second Marsquake tremor envelope + smooth restoration once event animation finishes
    const quakeAnimRunning = isQuake && state.screen === 'PLAYING' && animRemaining > 0;
    if (quakeAnimRunning && this.elapsedTime >= this.nextQuakeAt) {
      this.triggerQuakeBurst();
    }
    const quakeActiveNow = quakeAnimRunning && this.elapsedTime < this.quakeEndAt;
    const quakeAlpha = quakeAnimRunning
      ? Phaser.Math.Clamp(animElapsed / 1.0, 0, 1) * Phaser.Math.Clamp(animRemaining / 2.0, 0, 1)
      : 0;

    if (this.terrainRocksContainer) {
      if (quakeActiveNow && !this.reducedMotion) {
        this.terrainRocksContainer.setPosition(
          Math.sin(this.elapsedTime * 64) * 6.0 * quakeAlpha,
          Math.cos(this.elapsedTime * 54) * 4.2 * quakeAlpha
        );
      } else {
        this.terrainRocksContainer.setPosition(
          Phaser.Math.Linear(this.terrainRocksContainer.x, 0, Math.min(1, dt * 8)),
          Phaser.Math.Linear(this.terrainRocksContainer.y, 0, Math.min(1, dt * 8))
        );
      }
    }

    if (this.terrainGraphics && this.environmentalScarsLayer) {
      if (quakeActiveNow && !this.reducedMotion) {
        const tx = Math.sin(this.elapsedTime * 58) * 3.2 * quakeAlpha;
        const ty = Math.cos(this.elapsedTime * 49) * 2.4 * quakeAlpha;
        this.terrainGraphics.setPosition(tx, ty);
        this.environmentalScarsLayer.setPosition(tx, ty);
      } else {
        this.terrainGraphics.setPosition(
          Phaser.Math.Linear(this.terrainGraphics.x, 0, Math.min(1, dt * 9)),
          Phaser.Math.Linear(this.terrainGraphics.y, 0, Math.min(1, dt * 9))
        );
        this.environmentalScarsLayer.setPosition(
          Phaser.Math.Linear(this.environmentalScarsLayer.x, 0, Math.min(1, dt * 9)),
          Phaser.Math.Linear(this.environmentalScarsLayer.y, 0, Math.min(1, dt * 9))
        );
      }
    }

    const quakeTargets = new Set(isQuake ? activeEvent?.definition.targetBuildings ?? [] : []);
    for (const [bId, visual] of this.buildingVisuals.entries()) {
      if (quakeActiveNow && !this.reducedMotion) {
        const isHitTarget = quakeTargets.has(bId);
        const amp = (isHitTarget ? 7.2 : 4.2) * quakeAlpha;
        const shakeX = Math.sin(this.elapsedTime * 58 + visual.baseX * 0.1) * amp;
        const shakeY = Math.cos(this.elapsedTime * 51 + visual.baseY * 0.1) * (amp * 0.65);
        visual.container.setPosition(visual.baseX + shakeX, visual.baseY + shakeY);
        visual.container.setRotation(
          (isHitTarget ? Math.sin(this.elapsedTime * 40 + visual.baseY) * 0.036 : Math.sin(this.elapsedTime * 34) * 0.018) *
            quakeAlpha
        );
      } else {
        visual.container.setPosition(
          Phaser.Math.Linear(visual.container.x, visual.baseX, Math.min(1, dt * 9)),
          Phaser.Math.Linear(visual.container.y, visual.baseY, Math.min(1, dt * 9))
        );
        visual.container.setRotation(
          Phaser.Math.Linear(visual.container.rotation, 0, Math.min(1, dt * 9))
        );
      }
    }

    this.renderScarDustClouds(state.environmentalScars ?? []);

    // Render animated non-obstructive environmental effects + building damage visuals
    this.renderEventEffects(state, {
      isGlobalStorm,
      isDustDevils,
      isQuake,
      quakeActiveNow,
      quakeAlpha,
      isNeutronCascade,
      isIceClouds,
      isSolarFlare,
      isSolarStorm,
      isSepStorm,
      isRadiation,
      eventStrength,
      animRemaining,
    });

    const stormMultiplier = activeEvent
      ? activeEvent.definition.severity === 'super_major'
        ? 4.4
        : activeEvent.definition.severity === 'major'
        ? 2.8
        : 2.1
      : 1;

    for (const p of this.dustParticles) {
      p.rect.setAlpha(isDustStorm ? 0.22 + 0.34 * eventStrength : 0.22);
      p.rect.x += p.speed * stormMultiplier * dt;
      if (p.rect.x > WORLD_WIDTH + 60) {
        p.rect.x = -60;
        p.rect.y = Phaser.Math.Between(0, WORLD_HEIGHT);
      }
    }

    // Blowing storm dust streaks smoothly scaled by eventStrength
    const streakDensity = isGlobalStorm
      ? Math.round(this.stormStreaks.length * Math.max(0.3, eventStrength))
      : isDustDevils
      ? Math.round(14 * Math.max(0.35, eventStrength))
      : 0;
    this.stormStreaks.forEach((s, idx) => {
      const show = idx < streakDensity;
      s.rect.setVisible(show);
      s.rect.setAlpha(0.32 * Math.max(0.35, eventStrength));
      if (show && !this.reducedMotion) {
        const speedBoost = isGlobalStorm ? 1.4 : 1;
        s.rect.x += s.speed * speedBoost * dt;
        s.rect.y += s.driftY * dt;
        if (s.rect.x > WORLD_WIDTH + 140 || s.rect.y > WORLD_HEIGHT + 60) {
          s.rect.x = -140;
          s.rect.y = Phaser.Math.Between(-40, WORLD_HEIGHT - 20);
        }
      }
    });

    // Water Ice Cloud Formation falling sparkling ice crystals
    this.iceParticles.forEach((p) => {
      p.circle.setVisible(isIceClouds);
      p.circle.setAlpha(0.7 * Math.max(0.35, eventStrength));
      if (isIceClouds && !this.reducedMotion) {
        p.circle.y += p.speedY * dt;
        p.circle.x += p.driftX * dt;
        if (p.circle.y > WORLD_HEIGHT + 20) {
          p.circle.y = -20;
          p.circle.x = Phaser.Math.Between(0, WORLD_WIDTH);
        }
      }
    });
  }

  private renderWeatherTint(state: GameState, eventStrength: number) {
    if (!this.weatherOverlay) return;
    this.weatherOverlay.clear();
    const activeEvent = state.activeEvent;
    if (!activeEvent || state.screen === 'TITLE_MENU') return;

    const id = activeEvent.definition.id;
    const sev = activeEvent.definition.severity;
    let color = PALETTE.terracotta;
    let baseAlpha = 0.1;

    if (id === 'water_ice_cloud_formation') {
      color = 0x7dd3fc;
      baseAlpha = 0.13;
    } else if (id === 'secondary_neutron_cascades') {
      color = 0x7c3aed;
      baseAlpha = 0.11;
    } else if (id === 'solar_flare_xray_uv') {
      color = 0xf59e0b;
      baseAlpha = 0.11;
    } else if (id === 'solar_energetic_particles') {
      color = 0xbe185d;
      baseAlpha = 0.14;
    } else if (id === 'solar_storm_response') {
      color = PALETTE.alertRed;
      baseAlpha = 0.14;
    } else if (id === 'global_dust_storm') {
      color = PALETTE.terracotta;
      baseAlpha = 0.22;
    } else if (id === 'dust_devils') {
      color = PALETTE.sand;
      baseAlpha = 0.1;
    } else if (sev === 'major') {
      baseAlpha = 0.14;
    }

    const alpha = baseAlpha * Math.max(0.25, eventStrength);
    this.weatherOverlay.fillStyle(color, alpha);
    this.weatherOverlay.fillRect(-1200, -1000, WORLD_WIDTH + 2400, WORLD_HEIGHT + 2000);
  }

  private renderEnvironmentalScars(scars: TerrainScar[]) {
    if (!this.environmentalScarsLayer) return;
    const key = scars.map((s) => s.id).join('|');
    if (key === this.lastScarsKey) return;
    this.lastScarsKey = key;

    const g = this.environmentalScarsLayer;
    g.clear();

    for (const scar of scars) {
      const sz = scar.size;
      if (scar.kind === 'quake_fissure') {
        // Branching seismic ground fracture + displaced rock rubble
        g.lineStyle(3.2, PALETTE.charcoal, 0.84);
        g.lineBetween(scar.x - sz, scar.y + 4, scar.x - sz * 0.25, scar.y - 5);
        g.lineBetween(scar.x - sz * 0.25, scar.y - 5, scar.x + sz * 0.35, scar.y + 7);
        g.lineBetween(scar.x + sz * 0.35, scar.y + 7, scar.x + sz, scar.y - 2);
        g.lineBetween(scar.x - sz * 0.25, scar.y - 5, scar.x - sz * 0.45, scar.y - 16);
        g.fillStyle(PALETTE.wreckDark, 0.9);
        g.fillRect(scar.x - 10, scar.y + 8, 7, 5);
        g.fillStyle(PALETTE.terracotta, 0.92);
        g.fillCircle(scar.x + 12, scar.y - 8, 3.8);
      } else if (scar.kind === 'solar_scorch') {
        // Charred scorch pit + bent metallic hull debris + warm ember spots
        g.fillStyle(PALETTE.charcoal, 0.44);
        g.fillEllipse(scar.x, scar.y, sz * 1.4, sz * 0.82);
        g.fillStyle(0xea580c, 0.34);
        g.fillEllipse(scar.x - 2, scar.y - 1, sz * 0.72, sz * 0.42);
        g.fillStyle(PALETTE.wreckMetal, 0.95);
        g.fillRect(scar.x + 6, scar.y + 4, 8, 4);
        g.fillStyle(0xfbbf24, 0.78);
        g.fillCircle(scar.x - 5, scar.y + 2, 2.2);
      } else if (scar.kind === 'sep_crater') {
        // Static zap burn ring + shattered casing shards
        g.fillStyle(0x1f2438, 0.46);
        g.fillCircle(scar.x, scar.y, sz * 0.56);
        g.lineStyle(2, 0x8be2ff, 0.72);
        g.strokeCircle(scar.x, scar.y, sz * 0.62);
        g.fillStyle(PALETTE.techBlueLight, 0.92);
        g.fillTriangle(scar.x - 9, scar.y + 6, scar.x - 2, scar.y - 4, scar.x + 3, scar.y + 8);
        g.fillStyle(0xf4c552, 0.92);
        g.fillCircle(scar.x + 10, scar.y - 5, 2.6);
      } else if (scar.kind === 'dust_drift') {
        // Drifted terracotta/sand dunes + scattered storm debris pebbles
        g.fillStyle(PALETTE.terracotta, 0.68);
        g.fillEllipse(scar.x, scar.y, sz * 1.65, sz * 0.74);
        g.fillStyle(PALETTE.sand, 0.66);
        g.fillEllipse(scar.x - 4, scar.y - 3, sz * 1.05, sz * 0.42);
        g.fillStyle(PALETTE.wreckDark, 0.85);
        g.fillCircle(scar.x + 11, scar.y + 4, 3);
        g.fillCircle(scar.x - 13, scar.y + 3, 2.5);
      }
    }
  }

  private renderScarDustClouds(scars: TerrainScar[]) {
    if (!this.scarDustLayer) return;
    const g = this.scarDustLayer;
    g.clear();
    if (this.reducedMotion) return;

    for (let i = 0; i < scars.length; i++) {
      const scar = scars[i];
      if (scar.kind !== 'dust_drift' && scar.kind !== 'quake_fissure') continue;
      const p = (this.elapsedTime * 0.35 + i * 0.29) % 1;
      const driftX = scar.x - 14 + p * 34;
      const driftY = scar.y - 4 - Math.sin(p * Math.PI) * 8;
      const alpha = Math.sin(p * Math.PI) * (scar.kind === 'dust_drift' ? 0.36 : 0.24);
      g.fillStyle(scar.kind === 'dust_drift' ? PALETTE.sand : PALETTE.terracotta, alpha);
      g.fillEllipse(driftX, driftY, 24, 10);
    }
  }

  private triggerQuakeBurst() {
    const activeEvent = gameStore.getState().activeEvent;
    const animRem = activeEvent?.animationRemaining ?? 0;
    if (animRem <= 0) return;

    if (!this.reducedMotion && gameStore.getState().screen === 'PLAYING') {
      const strength = Phaser.Math.Clamp(animRem / 2.5, 0.35, 1);
      this.cameras.main.shake(520, 0.0085 * strength);
    }
    this.quakeEndAt = this.elapsedTime + 1.15;
    this.nextQuakeAt = this.elapsedTime + 1.85;
  }

  private spawnEventTapRipple(x: number, y: number, eventId: string) {
    if (this.reducedMotion) return;
    const color =
      eventId === 'marsquake'
        ? 0xf4c552
        : eventId === 'global_dust_storm' || eventId === 'dust_devils'
        ? PALETTE.sand
        : eventId === 'water_ice_cloud_formation'
        ? 0x8be2ff
        : 0xfbbf24;

    const ring = this.add.circle(x, y, 10, color, 0.35);
    ring.setStrokeStyle(3, 0xfaf0dc, 0.9);
    ring.setDepth(76);
    this.tweens.add({
      targets: ring,
      scale: 4.2,
      alpha: 0,
      duration: 460,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  private spawnDamageImpactRing(x: number, y: number, width: number, height: number) {
    if (this.reducedMotion) return;
    const ring = this.add.graphics();
    ring.setDepth(74);
    ring.lineStyle(4, PALETTE.alertRed, 0.95);
    ring.strokeRoundedRect(
      x - width / 2 - 4,
      y - height / 2 - 4,
      width + 8,
      height + 8,
      14
    );
    this.tweens.add({
      targets: ring,
      alpha: 0,
      duration: 850,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  private renderEventEffects(
    state: GameState,
    flags: {
      isGlobalStorm: boolean;
      isDustDevils: boolean;
      isQuake: boolean;
      quakeActiveNow: boolean;
      quakeAlpha: number;
      isNeutronCascade: boolean;
      isIceClouds: boolean;
      isSolarFlare: boolean;
      isSolarStorm: boolean;
      isSepStorm: boolean;
      isRadiation: boolean;
      eventStrength: number;
      animRemaining: number;
    }
  ) {
    const g = this.eventEffectsLayer;
    if (!g) return;
    g.clear();

    if (state.screen === 'TITLE_MENU') return;

    // 0. Live damaged / inactive equipment visual feedback (smoke wisps & electrical sparks)
    if (!this.reducedMotion) {
      for (const def of BUILDING_LIST) {
        const bState = state.buildings[def.id];
        const visual = this.buildingVisuals.get(def.id);
        if (!visual) continue;

        if (bState.status === 'inactive') {
          // Rising gray smoke puffs from broken machinery
          for (let s = 0; s < 2; s++) {
            const p = (this.elapsedTime * 0.65 + s * 0.5 + visual.baseX * 0.01) % 1;
            const sx = visual.baseX - 10 + s * 20 + Math.sin(this.elapsedTime * 2 + s) * 6;
            const sy = visual.baseY - 12 - p * 34;
            g.fillStyle(0x4b4846, (1 - p) * 0.45);
            g.fillCircle(sx, sy, 4 + p * 7);
          }
        } else if (bState.status === 'damaged') {
          // Periodic amber spark flash on damaged systems
          const sparkPhase = Math.sin(this.elapsedTime * 7 + visual.baseY * 0.05);
          if (sparkPhase > 0.72) {
            const sx = visual.baseX + Math.cos(this.elapsedTime * 11) * 18;
            const sy = visual.baseY + Math.sin(this.elapsedTime * 9) * 14;
            g.lineStyle(2.5, 0xf4c552, 0.95);
            g.lineBetween(sx - 6, sy, sx, sy - 5);
            g.lineBetween(sx, sy - 5, sx + 5, sy + 4);
          }
        }
      }
    }

    if (!state.activeEvent) return;

    const env = Math.max(0.25, flags.eventStrength);
    const targets = state.activeEvent.definition.targetBuildings ?? [];
    const targetPulse = 0.45 + 0.55 * Math.sin(this.elapsedTime * 4.5);

    // Subtle warning perimeter on systems at risk during active event
    for (const bId of targets) {
      const visual = this.buildingVisuals.get(bId);
      if (!visual) continue;
      g.lineStyle(
        2.5,
        state.activeEvent.definition.severity === 'minor' ? 0xf4c552 : PALETTE.alertRed,
        (0.22 + targetPulse * 0.32) * Math.min(1, env + 0.25)
      );
      g.strokeRoundedRect(
        visual.baseX - visual.width / 2 - 7,
        visual.baseY - visual.height / 2 - 7,
        visual.width + 14,
        visual.height + 14,
        14
      );
    }

    // 1. Dust Devils: spinning red-orange conical vortices wandering across outpost
    if (flags.isDustDevils) {
      const devilCount = 3;
      for (let i = 0; i < devilCount; i++) {
        const travel = (this.elapsedTime * (0.14 + i * 0.03) + i * 0.34) % 1;
        const dx = 70 + travel * (WORLD_WIDTH - 140);
        const dy = 140 + i * 210 + Math.sin(this.elapsedTime * 2.5 + i * 2) * 35;

        g.fillStyle(PALETTE.charcoal, 0.22 * env);
        g.fillEllipse(dx, dy + 22, 34, 12);

        for (let ring = 0; ring < 5; ring++) {
          const ry = dy + 16 - ring * 11;
          const rw = 16 + ring * 7;
          const wobble = Math.sin(this.elapsedTime * 11 + ring + i) * 5;
          g.lineStyle(3, ring % 2 === 0 ? PALETTE.sand : PALETTE.terracotta, 0.78 * env);
          g.strokeEllipse(dx + wobble, ry, rw, 8);
        }

        for (let f = 0; f < 4; f++) {
          const a = this.elapsedTime * 9 + (f * Math.PI) / 2 + i;
          g.fillStyle(PALETTE.marsDark, 0.85 * env);
          g.fillCircle(dx + Math.cos(a) * 26, dy - 10 + Math.sin(a) * 10, 3);
        }
      }
    }

    // 2. Global Dust Storm: smooth layered swirling terracotta storm clouds + lightning static flashes
    if (flags.isGlobalStorm) {
      for (let i = 0; i < 8; i++) {
        const speed = 88 + i * 22;
        const cx = ((this.elapsedTime * speed + i * 195) % (WORLD_WIDTH + 380)) - 190;
        const cy = 75 + ((i * 110) % (WORLD_HEIGHT - 130));
        g.fillStyle(PALETTE.sand, 0.24 * env);
        g.fillEllipse(cx, cy, 280, 78);
        g.fillStyle(PALETTE.terracotta, 0.2 * env);
        g.fillEllipse(cx - 50, cy + 18, 210, 54);
      }
      if (!this.reducedMotion && Math.sin(this.elapsedTime * 19) > 0.72) {
        const lx = 180 + ((Math.floor(this.elapsedTime * 4) * 237) % (WORLD_WIDTH - 360));
        const ly = 120 + ((Math.floor(this.elapsedTime * 3) * 193) % (WORLD_HEIGHT - 260));
        g.lineStyle(2.6, 0xffe49c, 0.85 * env);
        g.lineBetween(lx, ly, lx + 14, ly + 22);
        g.lineBetween(lx + 14, ly + 22, lx - 6, ly + 42);
      }
    }

    // 3. Marsquake (15s): concentric seismic waves, surface fractures & dust plumes, smoothly restored once ended
    if (flags.isQuake && flags.quakeAlpha > 0.02) {
      const qa = flags.quakeAlpha;
      const wavePhase = (this.elapsedTime * 1.45) % 1;
      for (const bId of targets) {
        const visual = this.buildingVisuals.get(bId);
        if (!visual) continue;

        const radius = 30 + wavePhase * 62;
        const alpha = (1 - wavePhase) * (flags.quakeActiveNow ? 0.78 : 0.36) * qa;
        g.lineStyle(3.5, PALETTE.sand, alpha);
        g.strokeCircle(visual.baseX, visual.baseY + 8, radius);

        const radius2 = 20 + ((wavePhase + 0.5) % 1) * 52;
        const alpha2 = (1 - ((wavePhase + 0.5) % 1)) * 0.45 * qa;
        g.lineStyle(2.5, PALETTE.terracotta, alpha2);
        g.strokeCircle(visual.baseX, visual.baseY + 8, radius2);

        // Jagged seismic fissure beneath shaking structure
        g.lineStyle(3, PALETTE.charcoal, 0.68 * qa);
        g.lineBetween(visual.baseX - 42, visual.baseY + visual.height / 2 + 6, visual.baseX - 18, visual.baseY + visual.height / 2 + 13);
        g.lineBetween(visual.baseX - 18, visual.baseY + visual.height / 2 + 13, visual.baseX - 2, visual.baseY + visual.height / 2 + 7);
        g.lineBetween(visual.baseX - 2, visual.baseY + visual.height / 2 + 7, visual.baseX + 20, visual.baseY + visual.height / 2 + 14);

        if (!this.reducedMotion) {
          for (let d = 0; d < 6; d++) {
            const p = (this.elapsedTime * 1.25 + d * 0.19) % 1;
            const dx = visual.baseX - visual.width * 0.36 + (d / 5) * visual.width * 0.72 + Math.sin(this.elapsedTime * 5 + d) * 4;
            const dy = visual.baseY - visual.height * 0.35 + p * (visual.height * 0.85);
            const dustAlpha = (1 - p) * (flags.quakeActiveNow ? 0.72 : 0.34) * qa;
            g.fillStyle(d % 2 === 0 ? PALETTE.sand : PALETTE.terracotta, dustAlpha);
            g.fillCircle(dx, dy, 3.0 + (1 - p) * 3.2);
          }
        }
      }
      if (flags.quakeActiveNow && !this.reducedMotion) {
        const bounce = Math.abs(Math.sin(this.elapsedTime * 22)) * 9 * qa;
        for (let r = 0; r < 8; r++) {
          const rx = 110 + r * 135;
          const ry = 180 + ((r * 130) % 480) - bounce;
          g.fillStyle(PALETTE.terracotta, 0.86 * qa);
          g.fillCircle(rx, ry, 4.2);
        }
      }
    }

    // 4. Secondary Neutron Cascades: cosmic rays hitting soil & splashing upward neutron bursts!
    if (flags.isNeutronCascade) {
      for (let i = 0; i < 4; i++) {
        const cycle = (this.elapsedTime * 0.75 + i * 0.27) % 1;
        const gx = 160 + i * 240;
        const gy = 210 + ((i * 155) % 420);

        if (cycle < 0.35) {
          const p = cycle / 0.35;
          const sx = gx - 90 * (1 - p);
          const sy = gy - 130 * (1 - p);
          g.lineStyle(2.5, 0xf4c552, 0.85 * env);
          g.lineBetween(sx - 18, sy - 26, sx, sy);
        } else {
          const p = (cycle - 0.35) / 0.65;
          const alpha = (1 - p) * env;
          g.fillStyle(0xc084fc, alpha * 0.4);
          g.fillCircle(gx, gy, 10 + p * 18);
          for (let b = 0; b < 4; b++) {
            const bx = gx + (b - 1.5) * (16 + p * 34);
            const by = gy - p * (55 + (b % 2) * 20);
            g.lineStyle(2, b % 2 === 0 ? 0xc084fc : 0x6ca4c4, alpha * 0.9);
            g.lineBetween(gx, gy, bx, by);
            g.fillStyle(b % 2 === 0 ? 0xf4c552 : 0xc084fc, alpha);
            g.fillCircle(bx, by, 3.5);
          }
        }
      }
    }

    // 5. Water Ice Cloud Formation: drifting icy blue-white cirrus clouds + tank frost shimmer
    if (flags.isIceClouds) {
      for (let i = 0; i < 6; i++) {
        const cx = ((this.elapsedTime * (34 + i * 9) + i * 185) % (WORLD_WIDTH + 320)) - 160;
        const cy = 65 + ((i * 125) % (WORLD_HEIGHT - 140));
        g.fillStyle(0xdcf4ff, 0.35 * env);
        g.fillEllipse(cx, cy, 220, 46);
        g.fillStyle(0xffffff, 0.25 * env);
        g.fillEllipse(cx + 30, cy - 10, 150, 30);
      }
      for (const bId of targets) {
        const visual = this.buildingVisuals.get(bId);
        if (!visual) continue;
        const sparkle = 0.45 + 0.55 * Math.sin(this.elapsedTime * 5 + visual.baseX);
        g.fillStyle(0xdcf4ff, 0.45 * sparkle * env);
        g.fillCircle(visual.baseX - 18, visual.baseY - 12, 4);
        g.fillCircle(visual.baseX + 20, visual.baseY + 8, 3.5);
      }
      const pulse = 0.5 + 0.5 * Math.sin(this.elapsedTime * 2.5);
      g.lineStyle(5, 0xbbe8ff, (0.25 + pulse * 0.2) * env);
      g.strokeRoundedRect(6, 6, WORLD_WIDTH - 12, WORLD_HEIGHT - 12, 12);
    }

    // 6. Solar Flare X-rays & UV Waves: golden sunbeam shafts + violet UV wave arcs sweeping down
    if (flags.isSolarFlare) {
      for (let r = 0; r < 4; r++) {
        const beamP = (this.elapsedTime * 0.42 + r * 0.26) % 1;
        const bx = WORLD_WIDTH * (0.2 + r * 0.22) - beamP * 140;
        g.fillStyle(0xf4c552, Math.sin(beamP * Math.PI) * 0.14 * env);
        g.fillTriangle(bx + 70, -20, bx - 40, WORLD_HEIGHT + 20, bx + 20, WORLD_HEIGHT + 20);
      }
      for (let w = 0; w < 5; w++) {
        const waveP = (this.elapsedTime * 0.65 + w * 0.2) % 1;
        const centerX = WORLD_WIDTH * 0.85 - waveP * WORLD_WIDTH * 0.95;
        const centerY = 40 + waveP * (WORLD_HEIGHT - 60);
        g.lineStyle(3.5, w % 2 === 0 ? 0xc084fc : 0xf4c552, (1 - waveP) * 0.72 * env);
        g.beginPath();
        g.arc(centerX, centerY, 90 + w * 28, Math.PI * 0.6, Math.PI * 1.4, false);
        g.strokePath();
      }
    }

    // 7. Solar Storm Response: crisp dual-wave crimson-gold solar wind ribbons & aurora curtains
    if (flags.isSolarStorm) {
      for (let r = 0; r < 6; r++) {
        const offset = (this.elapsedTime * 135 + r * 165) % (WORLD_WIDTH + 260);
        const yBase = 75 + r * 128 + Math.sin(this.elapsedTime * 2.6 + r) * 16;
        const color = r % 2 === 0 ? 0xfbbf24 : PALETTE.alertRed;
        g.lineStyle(6, color, 0.2 * env);
        g.lineBetween(offset - 200, yBase - 26, offset, yBase + 14);
        g.lineStyle(2.8, r % 2 === 0 ? 0xffe08a : 0xff7b6b, 0.65 * env);
        g.lineBetween(offset - 175, yBase - 22, offset - 8, yBase + 12);
      }
      // Shimmering upper-atmosphere aurora arc & border pulse
      const auroraPulse = 0.5 + 0.5 * Math.sin(this.elapsedTime * 3.1);
      g.fillStyle(0xf472b6, (0.06 + auroraPulse * 0.06) * env);
      g.fillRect(0, 0, WORLD_WIDTH, 54);
      g.lineStyle(4, 0xfbbf24, (0.24 + auroraPulse * 0.26) * env);
      g.strokeRoundedRect(12, 12, WORLD_WIDTH - 24, WORLD_HEIGHT - 24, 14);
    }

    // 8. Solar Energetic Particles: crisp tapered diagonal streaks + clean target static arcs
    if (flags.isSepStorm) {
      for (let i = 0; i < 18; i++) {
        const progress = (this.elapsedTime * 0.9 + i * 0.13) % 1;
        const rx = 45 + ((i * 83) % WORLD_WIDTH) - progress * 125;
        const ry = -30 + progress * (WORLD_HEIGHT + 70);
        const color = i % 3 === 0 ? 0xfaf0dc : i % 3 === 1 ? 0x6ca4c4 : 0xf472b6;
        g.lineStyle(4.5, color, 0.24 * env);
        g.lineBetween(rx, ry, rx - 32, ry + 42);
        g.lineStyle(2.2, color, 0.8 * env);
        g.lineBetween(rx - 4, ry + 5, rx - 28, ry + 38);
        g.fillStyle(0xffffff, 0.9 * env);
        g.fillCircle(rx - 28, ry + 38, 2.3);
      }
      if (flags.animRemaining > 0 && Math.sin(this.elapsedTime * 17) > 0.25) {
        for (const bId of targets) {
          const visual = this.buildingVisuals.get(bId);
          if (!visual) continue;
          const sx = visual.baseX + Math.sin(this.elapsedTime * 13 + visual.baseX) * 22;
          const sy = visual.baseY + Math.cos(this.elapsedTime * 11) * 16;
          g.lineStyle(2.5, 0x8be2ff, 0.88 * env);
          g.lineBetween(sx - 8, sy, sx, sy - 6);
          g.lineBetween(sx, sy - 6, sx + 6, sy + 5);
        }
      }
    }

    // Shared Radiation Alert border + Shelter Beacon whenever radiation > 0
    if (flags.isRadiation) {
      const pulse = 0.5 + 0.5 * Math.sin(this.elapsedTime * 5.0);
      const borderColor =
        state.activeEvent.definition.severity === 'minor' ? 0xf4c552 : PALETTE.alertRed;
      g.lineStyle(4.5, borderColor, (0.2 + pulse * 0.24) * Math.min(1, env + 0.2));
      g.strokeRoundedRect(6, 6, WORLD_WIDTH - 12, WORLD_HEIGHT - 12, 12);

      // Beacon on Radiation Shelter if crew is still outside!
      if (!state.crew.inShelter) {
        const shelter = this.buildingVisuals.get('radiation_shelter');
        if (shelter) {
          g.lineStyle(4, 0xf4c552, 0.4 + pulse * 0.52);
          g.strokeRoundedRect(
            shelter.baseX - shelter.width / 2 - 12,
            shelter.baseY - shelter.height / 2 - 12,
            shelter.width + 24,
            shelter.height + 24,
            16
          );
        }
      }
    }
  }

  private animateAstronautLimbs(
    astronaut: Phaser.GameObjects.Container | undefined,
    isRunning: boolean,
    workKind: ActionAnimKind | null,
    moveDirX: number,
    phaseOffset: number
  ) {
    if (!astronaut) return;
    const bodyGroup = astronaut.getByName('bodyGroup') as Phaser.GameObjects.Container | null;
    if (!bodyGroup) return;

    const leftLeg = bodyGroup.getByName('leftLeg') as Phaser.GameObjects.Graphics | null;
    const rightLeg = bodyGroup.getByName('rightLeg') as Phaser.GameObjects.Graphics | null;
    const leftArm = bodyGroup.getByName('leftArm') as Phaser.GameObjects.Graphics | null;
    const rightArm = bodyGroup.getByName('rightArm') as Phaser.GameObjects.Container | null;

    if (rightArm) {
      const wrenchProp = rightArm.getByName('wrenchProp') as Phaser.GameObjects.Graphics | null;
      const brushProp = rightArm.getByName('brushProp') as Phaser.GameObjects.Graphics | null;
      const seedProp = rightArm.getByName('seedProp') as Phaser.GameObjects.Graphics | null;

      wrenchProp?.setVisible(workKind === 'restore' || workKind === 'repair');
      brushProp?.setVisible(workKind === 'clean');
      seedProp?.setVisible(workKind === 'plant' || workKind === 'harvest');
    }

    if (this.reducedMotion) {
      bodyGroup.y = 0;
      bodyGroup.rotation = 0;
      if (leftLeg) leftLeg.y = 0;
      if (rightLeg) rightLeg.y = 0;
      if (leftArm) leftArm.rotation = 0;
      if (rightArm) rightArm.rotation = 0;
      return;
    }

    const t = this.elapsedTime + phaseOffset;

    if (isRunning) {
      const stride = Math.sin(t * 15);
      bodyGroup.y = -Math.abs(Math.cos(t * 15)) * 4.5;
      bodyGroup.rotation = moveDirX < -2 ? -0.08 : moveDirX > 2 ? 0.08 : 0;
      if (leftLeg) leftLeg.y = stride * 3.5;
      if (rightLeg) rightLeg.y = -stride * 3.5;
      if (leftArm) leftArm.rotation = -stride * 0.5;
      if (rightArm) rightArm.rotation = stride * 0.5;
    } else if (workKind) {
      bodyGroup.y = Math.sin(t * 9) * 2;
      bodyGroup.rotation = 0;
      if (leftLeg) leftLeg.y = 0;
      if (rightLeg) rightLeg.y = 0;
      if (leftArm) leftArm.rotation = -0.25 + Math.sin(t * 8) * 0.15;
      if (rightArm) {
        rightArm.rotation =
          workKind === 'clean'
            ? -0.6 + Math.sin(t * 14) * 0.65
            : -0.9 + Math.sin(t * 16) * 0.7;
      }
    } else {
      // Gentle breathing idle
      bodyGroup.y = Math.sin(t * 2.5) * 1.3;
      bodyGroup.rotation = 0;
      if (leftLeg) leftLeg.y = 0;
      if (rightLeg) rightLeg.y = 0;
      if (leftArm) leftArm.rotation = Math.sin(t * 2.2) * 0.06;
      if (rightArm) rightArm.rotation = -Math.sin(t * 2.2) * 0.06;
    }
  }

  private updateCrewAgents(state: GameState, dt: number) {
    const isHeadingHome =
      state.sleepPhase === 'returning' ||
      state.sleepPhase === 'sleeping' ||
      (state.sleepPhase === 'idle' && state.sleepingRemaining > 0);
    const shelterBounds = gridManager.getBuildingBounds(BUILDING_DEFINITIONS.radiation_shelter);
    const shelterSlots = this.getShelterSlots(shelterBounds);

    for (let i = 0; i < this.crewAgents.length; i++) {
      const agent = this.crewAgents[i];
      if (!agent.container) continue;

      if (isHeadingHome) {
        const habBounds = gridManager.getBuildingBounds(BUILDING_DEFINITIONS.main_habitat);
        const sleepSlot = this.getHabitatSleepSlots(habBounds)[i + 1] ?? habBounds;
        const insideHab = this.isInsideBuildingFootprint(
          agent.container.x,
          agent.container.y,
          'main_habitat'
        );
        if (
          agent.allowInsideBuildingId !== 'main_habitat' ||
          (agent.path.length === 0 && !insideHab)
        ) {
          this.setAgentDestination(agent, sleepSlot.x, sleepSlot.y, 'main_habitat');
        }
      } else if (state.crew.inShelter) {
        const slot = shelterSlots[i + 1] ?? shelterSlots[0];
        if (
          agent.path.length === 0 &&
          Math.hypot(agent.container.x - slot.x, agent.container.y - slot.y) > 4
        ) {
          this.setAgentDestination(agent, slot.x, slot.y, 'radiation_shelter');
        }
      } else if (agent.path.length === 0 && this.elapsedTime >= agent.waitUntil && state.screen === 'PLAYING') {
        // Pick an operational building from patrol list (or home building) & walk cleanly around obstacles
        const operationalTargets = agent.patrolBuildings.filter(
          (bId) => state.buildings[bId].status !== 'inactive'
        );
        const chosenId =
          operationalTargets.length > 0
            ? operationalTargets[Phaser.Math.Between(0, operationalTargets.length - 1)]
            : 'main_habitat';
        const door = gridManager.getBuildingDoorstep(chosenId, agent.container.x, agent.container.y);
        const candidate = gridManager.pushOutOfBuildings(
          door.x + Phaser.Math.Between(-24, 24),
          door.y + Phaser.Math.Between(-6, 10),
          12
        );
        const goal = gridManager.isPointBlocked(candidate.x, candidate.y, 10) ? door : candidate;
        this.setAgentDestination(agent, goal.x, goal.y);
      }

      let isMoving = false;
      let moveDirX = 0;
      if (agent.path.length > 0) {
        const nextWp = agent.path[0];
        const dx = nextWp.x - agent.container.x;
        const dy = nextWp.y - agent.container.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 4) {
          isMoving = true;
          moveDirX = dx;
          const speed = isHeadingHome ? 275 * dt : state.crew.inShelter ? 195 * dt : 120 * dt;
          const step = Math.min(dist, speed);
          agent.container.x += (dx / dist) * step;
          agent.container.y += (dy / dist) * step;

          const pushed = gridManager.pushOutOfBuildings(
            agent.container.x,
            agent.container.y,
            12,
            agent.allowInsideBuildingId
          );
          agent.container.x = pushed.x;
          agent.container.y = pushed.y;
        } else {
          agent.path.shift();
          if (agent.path.length === 0) {
            if (!isHeadingHome && !state.crew.inShelter) {
              agent.allowInsideBuildingId = undefined;
            }
            agent.waitUntil = this.elapsedTime + Phaser.Math.FloatBetween(3.2, 6.0);
          }
        }
      }

      const insideHabSleeping =
        isHeadingHome &&
        this.isInsideBuildingFootprint(agent.container.x, agent.container.y, 'main_habitat');

      const targetScale = insideHabSleeping
        ? 0.64
        : state.crew.inShelter && !isMoving
        ? 0.76
        : 0.92;
      const targetAlpha = insideHabSleeping
        ? 0.15
        : state.crew.inShelter && !isMoving
        ? 0.94
        : 1;
      agent.container.setScale(
        Phaser.Math.Linear(agent.container.scaleX, targetScale, Math.min(1, dt * 8))
      );
      agent.container.setAlpha(
        Phaser.Math.Linear(agent.container.alpha, targetAlpha, Math.min(1, dt * 8))
      );
      const isHelping =
        !isMoving &&
        state.pendingAction?.phase === 'working' &&
        i === 0 &&
        !state.crew.inShelter &&
        !isHeadingHome;
      this.animateAstronautLimbs(
        agent.container,
        isMoving,
        isHelping ? state.pendingAction?.taskKind ?? this.activeWorkAnim?.kind ?? null : null,
        moveDirX,
        agent.phaseOffset
      );
    }
  }

  private renderActiveWorkAnimation(isSleeping = false, state?: GameState) {
    const g = this.actionAnimLayer;
    if (!g) return;
    g.clear();

    if (isSleeping) {
      const hab = this.buildingVisuals.get('main_habitat');
      if (hab) {
        for (let i = 0; i < 3; i++) {
          const cycle = (this.elapsedTime * 0.55 + i * 0.33) % 1;
          const zx = hab.baseX + 18 + i * 11 + Math.sin(this.elapsedTime * 2.4 + i) * 5;
          const zy = hab.baseY - hab.height / 2 - 12 - cycle * 38;
          const size = 7 + i * 2;
          const alpha = Math.sin(cycle * Math.PI) * 0.95;
          g.lineStyle(2.6, 0xffe49c, alpha);
          g.lineBetween(zx - size * 0.5, zy - size * 0.5, zx + size * 0.5, zy - size * 0.5);
          g.lineBetween(zx + size * 0.5, zy - size * 0.5, zx - size * 0.5, zy + size * 0.5);
          g.lineBetween(zx - size * 0.5, zy + size * 0.5, zx + size * 0.5, zy + size * 0.5);
        }
      }
    }

    // Destination ring when NAS is walking to perform an arrival-gated task
    if (state?.pendingAction?.phase === 'walking' && this.nas) {
      const door = gridManager.getBuildingDoorstep(
        state.pendingAction.buildingId,
        this.nas.x,
        this.nas.y
      );
      const ringPulse = 0.55 + 0.45 * Math.sin(this.elapsedTime * 6);
      g.lineStyle(2.8, 0xf4c552, 0.5 + ringPulse * 0.45);
      g.strokeCircle(door.x, door.y, 11 + ringPulse * 4);
      g.fillStyle(0xf4c552, 0.35);
      g.fillCircle(door.x, door.y, 5);
    }

    const anim = this.activeWorkAnim;
    if (!anim || state?.pendingAction?.phase !== 'working') return;

    const visual = this.buildingVisuals.get(anim.buildingId);
    if (!visual) return;

    const elapsed = this.elapsedTime - anim.startedAt;
    const progress = Phaser.Math.Clamp(elapsed / anim.duration, 0, 1);
    const cx = visual.baseX;
    const cy = visual.baseY;
    const hw = visual.width / 2;
    const hh = visual.height / 2;

    if (anim.kind === 'restore') {
      // Active construction beam frame & welding sparks
      g.lineStyle(3, 0xf4c552, 0.85);
      const buildHeight = hh * 2 * progress;
      g.strokeRoundedRect(cx - hw - 4, cy + hh - buildHeight, visual.width + 8, Math.max(8, buildHeight), 10);

      if (anim.buildingId === 'greenhouse') {
        // Greenhouse roof truss beams snapping into place
        g.lineStyle(3, PALETTE.creamLight, 0.9);
        const beamX = cx - hw + progress * visual.width;
        g.lineBetween(cx - hw + 10, cy - hh + 8, beamX, cy - hh + 8);
        g.lineBetween(cx - hw + 10, cy + hh - 8, beamX, cy + hh - 8);
      }

      // Welding / wrench sparks popping near building center & NAS
      for (let i = 0; i < 6; i++) {
        const angle = elapsed * 9 + (i * Math.PI) / 3;
        const dist = 10 + ((elapsed * 45 + i * 7) % 24);
        const sx = cx + Math.cos(angle) * dist;
        const sy = cy + Math.sin(angle) * (dist * 0.65);
        g.fillStyle(i % 2 === 0 ? 0xf4c552 : PALETTE.terracotta, 0.95);
        g.fillCircle(sx, sy, 3.2);
      }
    } else if (anim.kind === 'repair') {
      // Wrench spin ring & tool sparks
      g.lineStyle(3, PALETTE.techBlueLight, 0.8);
      g.strokeCircle(cx, cy, 24 + Math.sin(elapsed * 12) * 5);
      for (let i = 0; i < 4; i++) {
        const a = elapsed * 10 + (i * Math.PI) / 2;
        g.fillStyle(0xf4c552, 0.9);
        g.fillCircle(cx + Math.cos(a) * 28, cy + Math.sin(a) * 18, 3);
      }
    } else if (anim.kind === 'clean') {
      // Sweeping dust clouds scattering & solar blue glints
      for (let i = 0; i < 6; i++) {
        const sweep = (elapsed * 1.8 + i * 0.18) % 1;
        const dx = cx - hw + 18 + sweep * (visual.width - 20);
        const dy = cy - hh + 18 + ((i * 23) % (visual.height - 30));
        g.fillStyle(PALETTE.sand, (1 - sweep) * 0.75);
        g.fillCircle(dx, dy, 6 + sweep * 5);
      }
      g.lineStyle(3, 0xffffff, 0.8);
      const glintX = cx - hw + progress * visual.width;
      g.lineBetween(glintX - 12, cy - hh + 12, glintX + 12, cy + hh - 12);
    } else if (anim.kind === 'plant') {
      // Seeds arcing into the 3 greenhouse planter beds + water droplets + sprouts
      for (let bed = 0; bed < 3; bed++) {
        const bedX = cx - hw * 0.55 + bed * (hw * 0.55);
        const arcP = Phaser.Math.Clamp(progress * 1.4 - bed * 0.12, 0, 1);
        if (arcP > 0 && arcP < 1) {
          const sx = Phaser.Math.Linear(cx, bedX, arcP);
          const sy = Phaser.Math.Linear(cy + hh + 10, cy, arcP) - Math.sin(arcP * Math.PI) * 28;
          g.fillStyle(0xf4c552, 1);
          g.fillCircle(sx, sy, 4);
        }
        // Blue water mist & green sprout popping up in second half
        if (progress > 0.4) {
          const sproutP = (progress - 0.4) / 0.6;
          g.fillStyle(PALETTE.techBlueLight, (1 - sproutP) * 0.85);
          g.fillCircle(bedX - 8, cy - 10 + sproutP * 14, 3);
          g.fillCircle(bedX + 8, cy - 6 + sproutP * 12, 3);

          g.fillStyle(PALETTE.lifeGreenBright, 1);
          g.fillCircle(bedX, cy, 4 + sproutP * 5);
        }
      }
    } else if (anim.kind === 'harvest') {
      // Golden & green harvest orbs lifting up out of Greenhouse
      for (let i = 0; i < 6; i++) {
        const ox = cx - 45 + i * 18;
        const oy = cy - progress * 44 - Math.sin(progress * Math.PI + i) * 10;
        g.fillStyle(i % 2 === 0 ? PALETTE.lifeGreenBright : 0xf4c552, 1 - progress * 0.6);
        g.fillCircle(ox, oy, 5.5);
      }
    }
  }

  private triggerWorkCompletion(anim: ActiveWorkAnimation, visual: BuildingVisual) {
    this.spawnCompletionBurst(visual.baseX, visual.baseY, anim.kind, anim.buildingId);
    this.spawnFloatingFeedback(visual.baseX, visual.baseY - 28, anim.label);

    if (!this.reducedMotion) {
      const healRing = this.add.graphics();
      healRing.setDepth(74);
      healRing.lineStyle(4, PALETTE.lifeGreenBright, 0.95);
      healRing.strokeRoundedRect(
        visual.baseX - visual.width / 2 - 4,
        visual.baseY - visual.height / 2 - 4,
        visual.width + 8,
        visual.height + 8,
        14
      );
      this.tweens.add({
        targets: healRing,
        alpha: 0,
        duration: 700,
        ease: 'Cubic.easeOut',
        onComplete: () => healRing.destroy(),
      });

      this.tweens.add({
        targets: visual.container,
        scaleX: 1.1,
        scaleY: 1.1,
        duration: 160,
        yoyo: true,
        ease: 'Back.easeOut',
      });

      this.nasJumpUntil = this.elapsedTime + 0.36;
    }
  }

  private spawnCompletionBurst(
    x: number,
    y: number,
    kind: ActionAnimKind,
    buildingId: BuildingId
  ) {
    if (this.reducedMotion) return;

    const primaryColor =
      kind === 'plant' || kind === 'harvest'
        ? PALETTE.lifeGreenBright
        : buildingId === 'water_recycling'
        ? PALETTE.techBlueLight
        : buildingId === 'oxygen_generator'
        ? 0xdcf4ff
        : 0xf4c552;

    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      const dist = Phaser.Math.Between(34, 64);
      const star = this.add.circle(
        x,
        y,
        Phaser.Math.Between(4, 7),
        i % 2 === 0 ? primaryColor : 0xfaf0dc,
        0.95
      );
      star.setDepth(75);
      this.tweens.add({
        targets: star,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist - 12,
        alpha: 0,
        scale: 0.4,
        duration: 550,
        ease: 'Cubic.easeOut',
        onComplete: () => star.destroy(),
      });
    }
  }

  private spawnFootDust(x: number, y: number) {
    const puff = this.add.circle(x, y, Phaser.Math.Between(3, 5), PALETTE.sand, 0.6);
    puff.setDepth(38);
    this.tweens.add({
      targets: puff,
      y: y - 8,
      scale: 1.6,
      alpha: 0,
      duration: 320,
      ease: 'Quad.easeOut',
      onComplete: () => puff.destroy(),
    });
  }
}

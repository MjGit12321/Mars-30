import Phaser from 'phaser';
import { BUILDING_DEFINITIONS, BUILDING_LIST } from '../../data/buildings';
import { gameStore, WorldFeedbackEvent } from '../../state/gameStore';
import { BuildingId } from '../../types/building';
import { GameState, ScreenMode } from '../../types/game';
import {
  GRID_COLS,
  GRID_ROWS,
  gridManager,
  TILE_SIZE,
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
  targetPos: { x: number; y: number } | null;
  waitUntil: number;
  phaseOffset: number;
}

export class OutpostScene extends Phaser.Scene {
  private buildingVisuals = new Map<BuildingId, BuildingVisual>();
  private nas!: Phaser.GameObjects.Container;
  private crewAgents: CrewAgent[] = [];
  private gil!: Phaser.GameObjects.Container;
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

  private nasTargetPos: { x: number; y: number } | null = null;
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
    this.createWeatherLayer();
    this.setupCameraAndInput();

    this.syncWithGameState(gameStore.getState());

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
    const horizontalMargin = effectiveWidth >= 768 ? 140 : 36;
    const verticalMargin = 185;
    const fitZoom = Math.min(
      (effectiveWidth - horizontalMargin) / WORLD_WIDTH,
      (cam.height - verticalMargin) / WORLD_HEIGHT,
      1.0
    );
    cam.setZoom(Math.max(0.45, fitZoom));
    cam.centerOn(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
    this.clampCameraScroll();
  }

  private clampCameraScroll() {
    const cam = this.cameras.main;
    if (!cam) return;
    const minCenterX = 120;
    const maxCenterX = WORLD_WIDTH - 120;
    const minCenterY = 90;
    const maxCenterY = WORLD_HEIGHT - 90;

    const currentCenterX = cam.scrollX + cam.width * 0.5;
    const currentCenterY = cam.scrollY + cam.height * 0.5;

    const clampedCenterX = Phaser.Math.Clamp(currentCenterX, minCenterX, maxCenterX);
    const clampedCenterY = Phaser.Math.Clamp(currentCenterY, minCenterY, maxCenterY);

    cam.scrollX = clampedCenterX - cam.width * 0.5;
    cam.scrollY = clampedCenterY - cam.height * 0.5;
  }

  private drawMarsTerrain() {
    const g = this.add.graphics();
    g.setDepth(0);

    g.fillStyle(PALETTE.marsRed, 1);
    g.fillRect(-1200, -1000, WORLD_WIDTH + 2400, WORLD_HEIGHT + 2000);

    const craterSpots = [
      { x: 110, y: 120, r: 58 },
      { x: 850, y: 130, r: 46 },
      { x: 90, y: 580, r: 64 },
      { x: 860, y: 590, r: 52 },
      { x: 470, y: 70, r: 38 },
      { x: 520, y: 660, r: 42 },
    ];
    for (const c of craterSpots) {
      g.fillStyle(PALETTE.marsDark, 0.55);
      g.fillCircle(c.x, c.y, c.r);
      g.lineStyle(3, PALETTE.terracotta, 0.45);
      g.strokeCircle(c.x, c.y, c.r + 3);
    }

    // Sand walkways connecting central Main Habitat to facilities
    g.fillStyle(PALETTE.sand, 0.3);
    g.fillRoundedRect(2 * TILE_SIZE, 4.3 * TILE_SIZE, 9 * TILE_SIZE, 1.4 * TILE_SIZE, 16);
    g.fillRoundedRect(5.3 * TILE_SIZE, 1.5 * TILE_SIZE, 1.4 * TILE_SIZE, 6.5 * TILE_SIZE, 16);

    g.lineStyle(1, PALETTE.charcoal, 0.14);
    for (let col = 0; col <= GRID_COLS; col++) {
      g.lineBetween(col * TILE_SIZE, 0, col * TILE_SIZE, WORLD_HEIGHT);
    }
    for (let row = 0; row <= GRID_ROWS; row++) {
      g.lineBetween(0, row * TILE_SIZE, WORLD_WIDTH, row * TILE_SIZE);
    }

    g.lineStyle(3, PALETTE.charcoal, 0.35);
    g.strokeRoundedRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT, 12);

    const rocks = [
      { x: 48, y: 50, w: 28, h: 20 },
      { x: 880, y: 60, w: 34, h: 24 },
      { x: 64, y: 665, w: 30, h: 22 },
      { x: 870, y: 660, w: 36, h: 24 },
      { x: 40, y: 340, w: 24, h: 20 },
      { x: 900, y: 360, w: 26, h: 22 },
    ];
    for (const r of rocks) {
      g.fillStyle(PALETTE.charcoal, 0.25);
      g.fillRoundedRect(r.x + 3, r.y + 4, r.w, r.h, 5);
      g.fillStyle(PALETTE.terracotta, 1);
      g.lineStyle(2, PALETTE.charcoal, 1);
      g.fillRoundedRect(r.x, r.y, r.w, r.h, 5);
      g.strokeRoundedRect(r.x, r.y, r.w, r.h, 5);
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
        .text(0, bounds.height / 2 + 8, def.shortName, {
          fontFamily: '"Plus Jakarta Sans", sans-serif',
          fontSize: '12px',
          fontStyle: 'bold',
          color: '#292C2B',
          backgroundColor: '#F1D8A8',
          padding: { x: 6, y: 2 },
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
    this.nas = createNasContainer(this, habBounds.centerX - 18, habBounds.centerY + 76);
    this.gil = createGilContainer(this, habBounds.centerX + 26, habBounds.centerY + 56);

    // Three supporting human crew members with distinct astronaut suit accents
    const crewSpecs: Array<{
      name: string;
      suitAccent: number;
      skinTone: number;
      hairColor: number;
      homeBuilding: BuildingId;
      patrolBuildings: BuildingId[];
      offsetX: number;
      offsetY: number;
    }> = [
      {
        name: 'EVA',
        suitAccent: PALETTE.lifeGreen,
        skinTone: 0x8d5524,
        hairColor: 0x221b18,
        homeBuilding: 'greenhouse',
        patrolBuildings: ['greenhouse', 'food_storage', 'main_habitat'],
        offsetX: -46,
        offsetY: 42,
      },
      {
        name: 'KAI',
        suitAccent: PALETTE.techBlue,
        skinTone: 0xe0ac69,
        hairColor: 0x292c2b,
        homeBuilding: 'oxygen_generator',
        patrolBuildings: ['oxygen_generator', 'water_recycling', 'main_habitat'],
        offsetX: 46,
        offsetY: 42,
      },
      {
        name: 'MIA',
        suitAccent: PALETTE.terracotta,
        skinTone: 0xf1c27d,
        hairColor: 0x7c3e26,
        homeBuilding: 'solar_panels',
        patrolBuildings: ['solar_panels', 'energy_storage', 'maintenance_facility'],
        offsetX: 0,
        offsetY: -54,
      },
    ];

    this.crewAgents = crewSpecs.map((spec, idx) => {
      const container = createCrewMemberContainer(
        this,
        habBounds.centerX + spec.offsetX,
        habBounds.centerY + spec.offsetY,
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
        targetPos: null,
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
      const shouldDeselect =
        Boolean(pointer) &&
        !this.wasDragged &&
        Array.isArray(currentlyOver) &&
        currentlyOver.length === 0 &&
        gameStore.getState().screen === 'PLAYING' &&
        gameStore.getState().selectedBuildingId !== null;
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
        { inShelter: state.crew.inShelter }
      );

      // Selection highlight ring (drawn cleanly and animated in update loop)
      this.drawSelectionHighlight(visual, state.selectedBuildingId === def.id && state.screen === 'PLAYING', 1);

      // Clear kid-friendly icon/short state tag above buildings needing attention
      const needsRestorationFirst = !bState.restoredOnce || bState.status === 'inactive';
      if (visual.restoringUntil > this.elapsedTime) {
        visual.statusTag.setText('Fixing...');
        visual.statusTag.setBackgroundColor('#477C9B');
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

    // Weather tint & event transition triggers
    this.weatherOverlay.clear();
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

    if (activeEvent) {
      const id = activeEvent.definition.id;
      const sev = activeEvent.definition.severity;
      let color = PALETTE.terracotta;
      let alpha = 0.1;

      if (id === 'water_ice_cloud_formation') {
        color = 0x7dd3fc;
        alpha = 0.14;
      } else if (id === 'secondary_neutron_cascades') {
        color = 0x7c3aed;
        alpha = 0.11;
      } else if (id === 'solar_flare_xray_uv') {
        color = 0xf59e0b;
        alpha = 0.11;
      } else if (id === 'solar_energetic_particles') {
        color = 0xbe185d;
        alpha = 0.16;
      } else if (id === 'solar_storm_response') {
        color = PALETTE.alertRed;
        alpha = 0.16;
      } else if (id === 'global_dust_storm') {
        color = PALETTE.terracotta;
        alpha = 0.26;
      } else if (id === 'dust_devils') {
        color = PALETTE.sand;
        alpha = 0.11;
      } else if (sev === 'major') {
        alpha = 0.16;
      }

      this.weatherOverlay.fillStyle(color, alpha);
      this.weatherOverlay.fillRect(-1200, -1000, WORLD_WIDTH + 2400, WORLD_HEIGHT + 2000);
    }

    if (state.screen === 'PLAYING' && this.lastScreen === 'TITLE_MENU') {
      this.centerCameraOnOutpost();
    }
    this.lastScreen = state.screen;

    if (state.crew.inShelter) {
      const shelterBounds = gridManager.getBuildingBounds(BUILDING_DEFINITIONS.radiation_shelter);
      this.nasTargetPos = {
        x: shelterBounds.centerX,
        y: shelterBounds.centerY + shelterBounds.height / 2 + 14,
      };
    }
  }

  private runNasToBuilding(buildingId: BuildingId) {
    const def = BUILDING_DEFINITIONS[buildingId];
    const bounds = gridManager.getBuildingBounds(def);
    this.nasTargetPos = {
      x: bounds.centerX,
      y: bounds.centerY + bounds.height / 2 + 14,
    };
  }

  private handleWorldFeedback(evt: WorldFeedbackEvent) {
    if (evt.type === 'task' || evt.type === 'plant' || evt.type === 'harvest') {
      const def = BUILDING_DEFINITIONS[evt.buildingId];
      const bounds = gridManager.getBuildingBounds(def);
      this.runNasToBuilding(evt.buildingId);

      const kind: ActionAnimKind =
        evt.type === 'plant'
          ? 'plant'
          : evt.type === 'harvest'
          ? 'harvest'
          : evt.taskKind ?? 'repair';

      const duration =
        kind === 'restore'
          ? 1.65
          : kind === 'plant'
          ? 1.45
          : 1.25;

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

      this.activeWorkAnim = {
        buildingId: evt.buildingId,
        kind,
        startedAt: this.elapsedTime,
        duration,
        label: labelText,
      };

      // Have the nearest crew helper walk nearby to assist/cheer
      const helper = this.crewAgents[0];
      if (helper && !gameStore.getState().crew.inShelter) {
        helper.targetPos = {
          x: bounds.centerX + 38,
          y: bounds.centerY + bounds.height / 2 + 16,
        };
        helper.waitUntil = this.elapsedTime + 3.2;
      }

      const visual = this.buildingVisuals.get(evt.buildingId);
      if (visual) {
        visual.restoringUntil = this.elapsedTime + duration;
        visual.statusTag.setText(
          kind === 'plant'
            ? 'Planting...'
            : kind === 'harvest'
            ? 'Harvesting...'
            : kind === 'clean'
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
    } else if (evt.type === 'shelter') {
      const targetDef = evt.inShelter
        ? BUILDING_DEFINITIONS.radiation_shelter
        : BUILDING_DEFINITIONS.main_habitat;
      const bounds = gridManager.getBuildingBounds(targetDef);
      this.nasTargetPos = {
        x: bounds.centerX,
        y: bounds.centerY + bounds.height / 2 + 14,
      };
      this.crewAgents.forEach((agent, i) => {
        agent.targetPos = {
          x: bounds.centerX + (i - 1) * 26,
          y: bounds.centerY + bounds.height / 2 + 16,
        };
        agent.waitUntil = this.elapsedTime + 3;
      });
      this.spawnCompletionBurst(bounds.centerX, bounds.centerY, 'restore', targetDef.id);
      this.spawnFloatingFeedback(
        bounds.centerX,
        bounds.centerY - 24,
        evt.inShelter ? 'Crew Safe Inside!' : 'Crew Outside!'
      );
    } else if (evt.type === 'focus_building') {
      const def = BUILDING_DEFINITIONS[evt.buildingId];
      const bounds = gridManager.getBuildingBounds(def);
      this.runNasToBuilding(evt.buildingId);
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
    } else if (evt.type === 'end_day' && evt.buildingImpacts?.length) {
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

    // Animate operational machinery (O2 fans, water ripples, habitat beacon) & Under Restoration progress bars
    for (const def of BUILDING_LIST) {
      const visual = this.buildingVisuals.get(def.id);
      if (!visual) continue;
      const bState = state.buildings[def.id];

      if (bState.status === 'operational') {
        drawBuildingGraphics(
          visual.graphics,
          def.id,
          visual.width,
          visual.height,
          bState,
          def.id === 'greenhouse' ? state.greenhouseCrop : null,
          this.elapsedTime,
          { inShelter: state.crew.inShelter }
        );
      }

      if (state.selectedBuildingId === def.id && state.screen === 'PLAYING') {
        const pulse = 0.65 + 0.35 * Math.sin(this.elapsedTime * 5);
        this.drawSelectionHighlight(visual, true, pulse);
      }

      visual.workBar.clear();
      if (visual.restoringUntil > this.elapsedTime && this.activeWorkAnim?.buildingId === def.id) {
        const anim = this.activeWorkAnim;
        const pct = Math.min(1, Math.max(0, (this.elapsedTime - anim.startedAt) / anim.duration));
        const bw = 78;
        visual.workBar.fillStyle(PALETTE.charcoal, 1);
        visual.workBar.fillRoundedRect(-bw / 2 - 2, -7, bw + 4, 14, 5);
        visual.workBar.fillStyle(
          anim.kind === 'plant' || anim.kind === 'harvest'
            ? PALETTE.lifeGreenBright
            : anim.kind === 'clean'
            ? 0xf4c552
            : PALETTE.techBlueLight,
          1
        );
        visual.workBar.fillRoundedRect(-bw / 2, -5, Math.max(6, bw * pct), 10, 3);
      } else if (visual.restoringUntil > 0 && visual.restoringUntil <= this.elapsedTime) {
        visual.restoringUntil = 0;
        if (this.activeWorkAnim?.buildingId === def.id) {
          this.triggerWorkCompletion(this.activeWorkAnim, visual);
          this.activeWorkAnim = null;
        }
        this.syncWithGameState(state);
      }
    }

    if (state.screen === 'TITLE_MENU') {
      const cam = this.cameras.main;
      const targetX = WORLD_WIDTH / 2 + Math.sin(this.elapsedTime * 0.25) * 70;
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

    // Update NAS running movement + articulated limbs + contextual tools
    let nasIsRunning = false;
    let nasMoveDirX = 0;
    if (this.nasTargetPos && this.nas) {
      const dx = this.nasTargetPos.x - this.nas.x;
      const dy = this.nasTargetPos.y - this.nas.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 3) {
        nasIsRunning = true;
        nasMoveDirX = dx;
        const speed = 305 * dt;
        const step = Math.min(dist, speed);
        this.nas.x += (dx / dist) * step;
        this.nas.y += (dy / dist) * step;

        if (!this.reducedMotion && this.elapsedTime - this.lastFootDustAt > 0.12) {
          this.lastFootDustAt = this.elapsedTime;
          this.spawnFootDust(this.nas.x, this.nas.y + 16);
        }
      } else {
        this.nasTargetPos = null;
      }
    }

    const nasIsWorking = Boolean(this.activeWorkAnim) && !nasIsRunning;
    this.animateAstronautLimbs(
      this.nas,
      nasIsRunning,
      nasIsWorking ? this.activeWorkAnim?.kind ?? null : null,
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
      this.nas.setAlpha(state.crew.inShelter && !nasIsRunning ? 0.45 : 1);
      const nasIndicator = this.nas.getByName('nasIndicator') as Phaser.GameObjects.Graphics | null;
      if (nasIndicator) {
        nasIndicator.y = Math.sin(this.elapsedTime * 4) * 3.5;
      }
    }

    // Update the 3 supporting human crew members
    this.updateCrewAgents(state, dt);

    // Update GIL companion smoothly following NAS
    if (this.gil && this.nas) {
      const targetGilX = this.nas.x + 36;
      const targetGilY = this.nas.y - 18 + Math.sin(this.elapsedTime * 3.4) * 4.5;
      const prevGilX = this.gil.x;
      this.gil.x = Phaser.Math.Linear(this.gil.x, targetGilX, 0.09);
      this.gil.y = Phaser.Math.Linear(this.gil.y, targetGilY, 0.13);
      const gilBody = this.gil.getByName('gilBody') as Phaser.GameObjects.Container | null;
      if (gilBody) {
        gilBody.rotation = Phaser.Math.Clamp((this.gil.x - prevGilX) * 0.04, -0.18, 0.18);
      }
      this.gil.setAlpha(state.crew.inShelter && !nasIsRunning ? 0.55 : 1);
    }

    // Draw contextual building construction, planting, cleaning & repair visual animations
    this.renderActiveWorkAnimation();

    const activeEventId = state.activeEvent?.definition.id ?? null;
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
    const isRadiation = Boolean(state.activeEvent?.definition.radiationLevel);

    // Periodic Marsquake tremor bursts (camera shake + structural rattle)
    if (isQuake && state.screen === 'PLAYING' && this.elapsedTime >= this.nextQuakeAt) {
      this.triggerQuakeBurst();
    }
    const quakeActiveNow =
      isQuake && state.screen === 'PLAYING' && this.elapsedTime < this.quakeEndAt;

    for (const visual of this.buildingVisuals.values()) {
      if (quakeActiveNow && !this.reducedMotion) {
        const shakeX = Math.sin(this.elapsedTime * 54 + visual.baseX * 0.1) * 3.5;
        const shakeY = Math.cos(this.elapsedTime * 48 + visual.baseY * 0.1) * 2.2;
        visual.container.setPosition(visual.baseX + shakeX, visual.baseY + shakeY);
      } else {
        visual.container.setPosition(visual.baseX, visual.baseY);
      }
    }

    // Render animated non-obstructive environmental effects + building damage visuals
    this.renderEventEffects(state, {
      isGlobalStorm,
      isDustDevils,
      isQuake,
      quakeActiveNow,
      isNeutronCascade,
      isIceClouds,
      isSolarFlare,
      isSolarStorm,
      isSepStorm,
      isRadiation,
    });

    const stormMultiplier = state.activeEvent
      ? state.activeEvent.definition.severity === 'super_major'
        ? 4.8
        : state.activeEvent.definition.severity === 'major'
        ? 3.0
        : 2.2
      : 1;

    for (const p of this.dustParticles) {
      p.rect.setAlpha(isDustStorm ? 0.55 : 0.22);
      p.rect.x += p.speed * stormMultiplier * dt;
      if (p.rect.x > WORLD_WIDTH + 60) {
        p.rect.x = -60;
        p.rect.y = Phaser.Math.Between(0, WORLD_HEIGHT);
      }
    }

    // Blowing storm dust streaks
    const streakDensity = isGlobalStorm
      ? this.stormStreaks.length
      : isDustDevils
      ? 14
      : 0;
    this.stormStreaks.forEach((s, idx) => {
      const show = idx < streakDensity;
      s.rect.setVisible(show);
      if (show && !this.reducedMotion) {
        const speedBoost = isGlobalStorm ? 1.5 : 1;
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

  private triggerQuakeBurst() {
    if (!this.reducedMotion && gameStore.getState().screen === 'PLAYING') {
      this.cameras.main.shake(420, 0.0045);
    }
    this.quakeEndAt = this.elapsedTime + 0.65;
    this.nextQuakeAt = this.elapsedTime + 3.2;
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
      isNeutronCascade: boolean;
      isIceClouds: boolean;
      isSolarFlare: boolean;
      isSolarStorm: boolean;
      isSepStorm: boolean;
      isRadiation: boolean;
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

    const targets = state.activeEvent.definition.targetBuildings ?? [];
    const targetPulse = 0.45 + 0.55 * Math.sin(this.elapsedTime * 4.5);

    // Subtle warning perimeter on systems at risk during active event
    for (const bId of targets) {
      const visual = this.buildingVisuals.get(bId);
      if (!visual) continue;
      g.lineStyle(
        2.5,
        state.activeEvent.definition.severity === 'minor' ? 0xf4c552 : PALETTE.alertRed,
        0.25 + targetPulse * 0.35
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

        // Shadow under funnel
        g.fillStyle(PALETTE.charcoal, 0.22);
        g.fillEllipse(dx, dy + 22, 34, 12);

        // Swirling funnel rings from bottom to top
        for (let ring = 0; ring < 5; ring++) {
          const ry = dy + 16 - ring * 11;
          const rw = 16 + ring * 7;
          const wobble = Math.sin(this.elapsedTime * 11 + ring + i) * 5;
          g.lineStyle(3, ring % 2 === 0 ? PALETTE.sand : PALETTE.terracotta, 0.78);
          g.strokeEllipse(dx + wobble, ry, rw, 8);
        }

        // Orbiting sand pebbles
        for (let f = 0; f < 4; f++) {
          const a = this.elapsedTime * 9 + (f * Math.PI) / 2 + i;
          g.fillStyle(PALETTE.marsDark, 0.85);
          g.fillCircle(dx + Math.cos(a) * 26, dy - 10 + Math.sin(a) * 10, 3);
        }
      }
    }

    // 2. Global Dust Storm: planet-wide thick swirling terracotta storm clouds
    if (flags.isGlobalStorm) {
      for (let i = 0; i < 8; i++) {
        const speed = 95 + i * 24;
        const cx = ((this.elapsedTime * speed + i * 195) % (WORLD_WIDTH + 380)) - 190;
        const cy = 75 + ((i * 110) % (WORLD_HEIGHT - 130));
        g.fillStyle(PALETTE.sand, 0.22);
        g.fillEllipse(cx, cy, 280, 82);
        g.fillStyle(PALETTE.terracotta, 0.18);
        g.fillEllipse(cx - 50, cy + 20, 210, 58);
      }
    }

    // 3. Marsquake: seismic ground shockwaves, jagged ground cracks & bouncing rocks
    if (flags.isQuake) {
      const wavePhase = (this.elapsedTime * 1.6) % 1;
      for (const bId of targets) {
        const visual = this.buildingVisuals.get(bId);
        if (!visual) continue;
        const radius = 32 + wavePhase * 58;
        const alpha = (1 - wavePhase) * (flags.quakeActiveNow ? 0.75 : 0.35);
        g.lineStyle(3.5, PALETTE.sand, alpha);
        g.strokeCircle(visual.baseX, visual.baseY + 8, radius);

        // Jagged ground crack radiating beneath building
        g.lineStyle(2.5, PALETTE.charcoal, 0.55);
        g.lineBetween(visual.baseX - 38, visual.baseY + visual.height / 2 + 6, visual.baseX - 18, visual.baseY + visual.height / 2 + 12);
        g.lineBetween(visual.baseX - 18, visual.baseY + visual.height / 2 + 12, visual.baseX - 4, visual.baseY + visual.height / 2 + 8);
      }
      // Bouncing Martian pebbles during tremor burst
      if (flags.quakeActiveNow && !this.reducedMotion) {
        const bounce = Math.abs(Math.sin(this.elapsedTime * 22)) * 9;
        for (let r = 0; r < 6; r++) {
          const rx = 140 + r * 140;
          const ry = 220 + ((r * 130) % 360) - bounce;
          g.fillStyle(PALETTE.terracotta, 0.9);
          g.fillCircle(rx, ry, 4);
        }
      }
    }

    // 4. Secondary Neutron Cascades: cosmic rays hitting soil & splashing upward neutron bursts!
    if (flags.isNeutronCascade) {
      for (let i = 0; i < 4; i++) {
        const cycle = (this.elapsedTime * 0.75 + i * 0.27) % 1;
        const gx = 160 + i * 210;
        const gy = 210 + ((i * 155) % 340);

        if (cycle < 0.35) {
          // Incoming cosmic ray streak striking ground
          const p = cycle / 0.35;
          const sx = gx - 90 * (1 - p);
          const sy = gy - 130 * (1 - p);
          g.lineStyle(2.5, 0xf4c552, 0.85);
          g.lineBetween(sx - 18, sy - 26, sx, sy);
        } else {
          // Upward splashing neutron cascade sparks!
          const p = (cycle - 0.35) / 0.65;
          const alpha = 1 - p;
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
        const cy = 65 + ((i * 115) % (WORLD_HEIGHT - 140));
        g.fillStyle(0xdcf4ff, 0.35);
        g.fillEllipse(cx, cy, 220, 46);
        g.fillStyle(0xffffff, 0.25);
        g.fillEllipse(cx + 30, cy - 10, 150, 30);
      }
      const pulse = 0.5 + 0.5 * Math.sin(this.elapsedTime * 2.5);
      g.lineStyle(5, 0xbbe8ff, 0.25 + pulse * 0.2);
      g.strokeRoundedRect(6, 6, WORLD_WIDTH - 12, WORLD_HEIGHT - 12, 12);
    }

    // 6. Solar Flare X-rays & UV Waves: golden beams + violet UV wave arcs sweeping down
    if (flags.isSolarFlare) {
      for (let w = 0; w < 5; w++) {
        const waveP = (this.elapsedTime * 0.65 + w * 0.2) % 1;
        const centerX = WORLD_WIDTH * 0.85 - waveP * WORLD_WIDTH * 0.95;
        const centerY = 40 + waveP * (WORLD_HEIGHT - 60);
        g.lineStyle(3.5, w % 2 === 0 ? 0xc084fc : 0xf4c552, (1 - waveP) * 0.72);
        g.beginPath();
        g.arc(centerX, centerY, 90 + w * 28, Math.PI * 0.6, Math.PI * 1.4, false);
        g.strokePath();
      }
    }

    // 7. Solar Storm Response: glowing crimson-gold solar wind ribbons & perimeter alert
    if (flags.isSolarStorm) {
      for (let r = 0; r < 5; r++) {
        const offset = (this.elapsedTime * 140 + r * 170) % (WORLD_WIDTH + 240);
        const yBase = 80 + r * 140 + Math.sin(this.elapsedTime * 3 + r) * 18;
        g.lineStyle(4, r % 2 === 0 ? 0xfbbf24 : PALETTE.alertRed, 0.45);
        g.lineBetween(offset - 180, yBase - 25, offset, yBase + 15);
      }
    }

    // 8. Solar Energetic Particles: fast diagonal glowing particle streaks & static arcs
    if (flags.isSepStorm) {
      for (let i = 0; i < 18; i++) {
        const progress = (this.elapsedTime * 0.95 + i * 0.13) % 1;
        const rx = 40 + ((i * 79) % WORLD_WIDTH) - progress * 120;
        const ry = -30 + progress * (WORLD_HEIGHT + 70);
        const color = i % 3 === 0 ? 0xffffff : i % 3 === 1 ? 0x6ca4c4 : 0xf472b6;
        g.lineStyle(2.8, color, 0.65);
        g.lineBetween(rx, ry, rx - 28, ry + 38);
        g.fillStyle(color, 0.9);
        g.fillCircle(rx - 28, ry + 38, 2.5);
      }
      // Static arcs snapping around targeted electronics
      if (Math.sin(this.elapsedTime * 19) > 0.25) {
        for (const bId of targets) {
          const visual = this.buildingVisuals.get(bId);
          if (!visual) continue;
          const sx = visual.baseX + Math.sin(this.elapsedTime * 13 + visual.baseX) * 24;
          const sy = visual.baseY + Math.cos(this.elapsedTime * 11) * 18;
          g.lineStyle(2.5, 0x8be2ff, 0.9);
          g.lineBetween(sx - 9, sy, sx, sy - 7);
          g.lineBetween(sx, sy - 7, sx + 6, sy + 6);
        }
      }
    }

    // Shared Radiation Alert border + Shelter Beacon whenever radiation > 0
    if (flags.isRadiation) {
      const pulse = 0.5 + 0.5 * Math.sin(this.elapsedTime * 5.2);
      const borderColor =
        state.activeEvent.definition.severity === 'minor' ? 0xf4c552 : PALETTE.alertRed;
      g.lineStyle(5, borderColor, 0.2 + pulse * 0.28);
      g.strokeRoundedRect(6, 6, WORLD_WIDTH - 12, WORLD_HEIGHT - 12, 12);

      // Beacon on Radiation Shelter if crew is still outside!
      if (!state.crew.inShelter) {
        const shelter = this.buildingVisuals.get('radiation_shelter');
        if (shelter) {
          g.lineStyle(4, 0xf4c552, 0.4 + pulse * 0.55);
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
    for (let i = 0; i < this.crewAgents.length; i++) {
      const agent = this.crewAgents[i];
      if (!agent.container) continue;

      if (state.crew.inShelter) {
        const shelterBounds = gridManager.getBuildingBounds(BUILDING_DEFINITIONS.radiation_shelter);
        if (!agent.targetPos) {
          agent.targetPos = {
            x: shelterBounds.centerX + (i - 1) * 24,
            y: shelterBounds.centerY + shelterBounds.height / 2 + 16,
          };
        }
      } else if (!agent.targetPos && this.elapsedTime >= agent.waitUntil && state.screen === 'PLAYING') {
        // Pick an operational building from patrol list (or home building)
        const operationalTargets = agent.patrolBuildings.filter(
          (bId) => state.buildings[bId].status !== 'inactive'
        );
        const chosenId =
          operationalTargets.length > 0
            ? operationalTargets[Phaser.Math.Between(0, operationalTargets.length - 1)]
            : 'main_habitat';
        const bounds = gridManager.getBuildingBounds(BUILDING_DEFINITIONS[chosenId]);
        agent.targetPos = {
          x: bounds.centerX + Phaser.Math.Between(-36, 36),
          y: bounds.centerY + bounds.height / 2 + Phaser.Math.Between(12, 24),
        };
      }

      let isMoving = false;
      let moveDirX = 0;
      if (agent.targetPos) {
        const dx = agent.targetPos.x - agent.container.x;
        const dy = agent.targetPos.y - agent.container.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 3) {
          isMoving = true;
          moveDirX = dx;
          const speed = 115 * dt;
          const step = Math.min(dist, speed);
          agent.container.x += (dx / dist) * step;
          agent.container.y += (dy / dist) * step;
        } else {
          agent.targetPos = null;
          agent.waitUntil = this.elapsedTime + Phaser.Math.FloatBetween(3.2, 6.0);
        }
      }

      agent.container.setAlpha(state.crew.inShelter && !isMoving ? 0.4 : 1);
      const isHelping =
        !isMoving &&
        Boolean(this.activeWorkAnim) &&
        i === 0 &&
        !state.crew.inShelter;
      this.animateAstronautLimbs(
        agent.container,
        isMoving,
        isHelping ? this.activeWorkAnim?.kind ?? null : null,
        moveDirX,
        agent.phaseOffset
      );
    }
  }

  private renderActiveWorkAnimation() {
    const g = this.actionAnimLayer;
    if (!g) return;
    g.clear();

    const anim = this.activeWorkAnim;
    if (!anim) return;

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

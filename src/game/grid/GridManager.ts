import { BUILDING_DEFINITIONS, BUILDING_LIST } from '../../data/buildings';
import { BuildingDefinition, BuildingId } from '../../types/building';

export const GRID_COLS = 13;
export const GRID_ROWS = 10;
export const TILE_SIZE = 72;

export const WORLD_WIDTH = GRID_COLS * TILE_SIZE;
export const WORLD_HEIGHT = GRID_ROWS * TILE_SIZE;

// Half-tile subgrid (36px cells) for natural obstacle-avoiding pathfinding around buildings
const SUB_SIZE = TILE_SIZE / 2; // 36px
const SUB_COLS = GRID_COLS * 2; // 26
const SUB_ROWS = GRID_ROWS * 2; // 20
const BUILDING_CLEARANCE = 14;

export interface Point2D {
  x: number;
  y: number;
}

export class GridManager {
  public gridToWorldTopLeft(gridX: number, gridY: number): Point2D {
    return {
      x: gridX * TILE_SIZE,
      y: gridY * TILE_SIZE,
    };
  }

  public getBuildingBounds(def: BuildingDefinition): {
    x: number;
    y: number;
    width: number;
    height: number;
    centerX: number;
    centerY: number;
  } {
    const x = def.gridX * TILE_SIZE;
    const y = def.gridY * TILE_SIZE;
    const width = def.widthTiles * TILE_SIZE;
    const height = def.heightTiles * TILE_SIZE;
    return {
      x,
      y,
      width,
      height,
      centerX: x + width / 2,
      centerY: y + height / 2,
    };
  }

  public worldToGrid(worldX: number, worldY: number): { gridX: number; gridY: number } {
    return {
      gridX: Math.floor(worldX / TILE_SIZE),
      gridY: Math.floor(worldY / TILE_SIZE),
    };
  }

  /** Returns true if world coordinate falls inside any building footprint (+ padding). */
  public isPointBlocked(
    worldX: number,
    worldY: number,
    padding = BUILDING_CLEARANCE,
    ignoreBuildingId?: BuildingId
  ): boolean {
    if (
      worldX < 14 ||
      worldX > WORLD_WIDTH - 14 ||
      worldY < 14 ||
      worldY > WORLD_HEIGHT - 14
    ) {
      return true;
    }

    for (const def of BUILDING_LIST) {
      if (def.id === ignoreBuildingId) continue;
      const b = this.getBuildingBounds(def);
      if (
        worldX >= b.x - padding &&
        worldX <= b.x + b.width + padding &&
        worldY >= b.y - padding &&
        worldY <= b.y + b.height + padding
      ) {
        return true;
      }
    }
    return false;
  }

  /** Resolves accidental overlaps by gently pushing the character outside building walls. */
  public pushOutOfBuildings(
    x: number,
    y: number,
    padding = BUILDING_CLEARANCE,
    ignoreBuildingId?: BuildingId
  ): Point2D {
    let rx = Math.max(16, Math.min(WORLD_WIDTH - 16, x));
    let ry = Math.max(16, Math.min(WORLD_HEIGHT - 16, y));

    for (const def of BUILDING_LIST) {
      if (def.id === ignoreBuildingId) continue;
      const b = this.getBuildingBounds(def);
      const minX = b.x - padding;
      const maxX = b.x + b.width + padding;
      const minY = b.y - padding;
      const maxY = b.y + b.height + padding;

      if (rx > minX && rx < maxX && ry > minY && ry < maxY) {
        const dLeft = rx - minX;
        const dRight = maxX - rx;
        const dTop = ry - minY;
        const dBottom = maxY - ry;
        const minDist = Math.min(dLeft, dRight, dTop, dBottom);
        if (minDist === dLeft) rx = minX;
        else if (minDist === dRight) rx = maxX;
        else if (minDist === dTop) ry = minY;
        else ry = maxY;
      }
    }
    return { x: rx, y: ry };
  }

  /** Computes a clear airlock/front approach point outside the target building. */
  public getBuildingDoorstep(buildingId: BuildingId, fromX?: number, fromY?: number): Point2D {
    const def = BUILDING_DEFINITIONS[buildingId];
    const b = this.getBuildingBounds(def);

    const candidates: Point2D[] = [
      { x: b.centerX, y: b.y + b.height + 20 }, // Bottom front entrance (primary)
      { x: b.centerX - 24, y: b.y + b.height + 20 },
      { x: b.centerX + 24, y: b.y + b.height + 20 },
      { x: b.x - 20, y: b.centerY }, // Left apron
      { x: b.x + b.width + 20, y: b.centerY }, // Right apron
      { x: b.centerX, y: b.y - 20 }, // Top apron
    ];

    const valid = candidates.filter((p) => !this.isPointBlocked(p.x, p.y, BUILDING_CLEARANCE - 2));
    if (valid.length === 0) {
      return this.pushOutOfBuildings(b.centerX, b.y + b.height + 22, BUILDING_CLEARANCE - 2);
    }

    if (fromX === undefined || fromY === undefined) {
      return valid[0];
    }

    // Prefer front doorstep unless another valid side is dramatically closer
    const front = valid[0];
    if (Math.hypot(front.x - b.centerX, front.y - (b.y + b.height + 20)) < 30) {
      return front;
    }

    let best = valid[0];
    let bestD = Infinity;
    for (const p of valid) {
      const d = Math.hypot(p.x - fromX, p.y - fromY);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  private hasLineOfSight(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    ignoreBuildingId?: BuildingId
  ): boolean {
    const dist = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.max(2, Math.ceil(dist / 12));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const sx = x1 + (x2 - x1) * t;
      const sy = y1 + (y2 - y1) * t;
      if (this.isPointBlocked(sx, sy, BUILDING_CLEARANCE - 2, ignoreBuildingId)) {
        return false;
      }
    }
    return true;
  }

  /** Computes a collision-free smoothed waypoint path around all buildings & solar panels. */
  public findPath(
    startX: number,
    startY: number,
    goalX: number,
    goalY: number,
    allowGoalInsideBuildingId?: BuildingId
  ): Point2D[] {
    const safeStart = this.pushOutOfBuildings(startX, startY, BUILDING_CLEARANCE - 2, allowGoalInsideBuildingId);
    const safeGoal = allowGoalInsideBuildingId
      ? { x: goalX, y: goalY }
      : this.pushOutOfBuildings(goalX, goalY, BUILDING_CLEARANCE - 2);

    // Direct unobstructed line of sight shortcut
    if (
      this.hasLineOfSight(
        safeStart.x,
        safeStart.y,
        safeGoal.x,
        safeGoal.y,
        allowGoalInsideBuildingId
      )
    ) {
      return [safeGoal];
    }

    // Build half-tile blocked occupancy grid (all buildings solid except optional destination interior)
    const blocked = new Uint8Array(SUB_COLS * SUB_ROWS);
    for (let r = 0; r < SUB_ROWS; r++) {
      for (let c = 0; c < SUB_COLS; c++) {
        const wx = c * SUB_SIZE + SUB_SIZE * 0.5;
        const wy = r * SUB_SIZE + SUB_SIZE * 0.5;
        if (this.isPointBlocked(wx, wy, BUILDING_CLEARANCE - 3, allowGoalInsideBuildingId)) {
          blocked[r * SUB_COLS + c] = 1;
        }
      }
    }

    const toCell = (wx: number, wy: number) => ({
      c: Math.max(0, Math.min(SUB_COLS - 1, Math.floor(wx / SUB_SIZE))),
      r: Math.max(0, Math.min(SUB_ROWS - 1, Math.floor(wy / SUB_SIZE))),
    });

    const startCell = toCell(safeStart.x, safeStart.y);
    const goalCell = toCell(safeGoal.x, safeGoal.y);
    blocked[startCell.r * SUB_COLS + startCell.c] = 0;
    blocked[goalCell.r * SUB_COLS + goalCell.c] = 0;

    const total = SUB_COLS * SUB_ROWS;
    const gScore = new Float32Array(total).fill(Infinity);
    const fScore = new Float32Array(total).fill(Infinity);
    const cameFrom = new Int32Array(total).fill(-1);
    const closed = new Uint8Array(total);

    const startIdx = startCell.r * SUB_COLS + startCell.c;
    const goalIdx = goalCell.r * SUB_COLS + goalCell.c;
    gScore[startIdx] = 0;
    fScore[startIdx] = Math.hypot(goalCell.c - startCell.c, goalCell.r - startCell.r);

    const open: number[] = [startIdx];
    const dirs = [
      [1, 0, 1],
      [-1, 0, 1],
      [0, 1, 1],
      [0, -1, 1],
      [1, 1, Math.SQRT2],
      [1, -1, Math.SQRT2],
      [-1, 1, Math.SQRT2],
      [-1, -1, Math.SQRT2],
    ];

    let found = false;
    while (open.length > 0) {
      let bestPos = 0;
      for (let i = 1; i < open.length; i++) {
        if (fScore[open[i]] < fScore[open[bestPos]]) {
          bestPos = i;
        }
      }
      const cur = open.splice(bestPos, 1)[0];
      if (cur === goalIdx) {
        found = true;
        break;
      }
      closed[cur] = 1;

      const cc = cur % SUB_COLS;
      const cr = Math.floor(cur / SUB_COLS);

      for (const [dc, dr, cost] of dirs) {
        const nc = cc + dc;
        const nr = cr + dr;
        if (nc < 0 || nc >= SUB_COLS || nr < 0 || nr >= SUB_ROWS) continue;
        const nIdx = nr * SUB_COLS + nc;
        if (closed[nIdx] || blocked[nIdx]) continue;
        // Prevent diagonal corner clipping past solid buildings
        if (dc !== 0 && dr !== 0) {
          if (blocked[cr * SUB_COLS + nc] || blocked[nr * SUB_COLS + cc]) continue;
        }

        const tentativeG = gScore[cur] + cost;
        if (tentativeG < gScore[nIdx]) {
          cameFrom[nIdx] = cur;
          gScore[nIdx] = tentativeG;
          fScore[nIdx] = tentativeG + Math.hypot(goalCell.c - nc, goalCell.r - nr);
          if (!open.includes(nIdx)) {
            open.push(nIdx);
          }
        }
      }
    }

    if (!found) {
      return [safeGoal];
    }

    const rawWaypoints: Point2D[] = [];
    let trace = goalIdx;
    while (trace !== -1 && trace !== startIdx) {
      const tc = trace % SUB_COLS;
      const tr = Math.floor(trace / SUB_COLS);
      rawWaypoints.push({
        x: tc * SUB_SIZE + SUB_SIZE * 0.5,
        y: tr * SUB_SIZE + SUB_SIZE * 0.5,
      });
      trace = cameFrom[trace];
    }
    rawWaypoints.reverse();
    if (rawWaypoints.length > 0) {
      rawWaypoints[rawWaypoints.length - 1] = safeGoal;
    } else {
      rawWaypoints.push(safeGoal);
    }

    // String-pull smoothing: keep furthest visible waypoint from current anchor
    const smoothed: Point2D[] = [];
    let anchor: Point2D = safeStart;
    let idx = 0;
    while (idx < rawWaypoints.length) {
      let furthest = idx;
      for (let j = rawWaypoints.length - 1; j > idx; j--) {
        if (
          this.hasLineOfSight(
            anchor.x,
            anchor.y,
            rawWaypoints[j].x,
            rawWaypoints[j].y,
            allowGoalInsideBuildingId
          )
        ) {
          furthest = j;
          break;
        }
      }
      smoothed.push(rawWaypoints[furthest]);
      anchor = rawWaypoints[furthest];
      idx = furthest + 1;
    }

    return smoothed;
  }
}

export const gridManager = new GridManager();

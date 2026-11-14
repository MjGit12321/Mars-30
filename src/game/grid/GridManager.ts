import { BuildingDefinition } from '../../types/building';

export const GRID_COLS = 13;
export const GRID_ROWS = 10;
export const TILE_SIZE = 72;

export const WORLD_WIDTH = GRID_COLS * TILE_SIZE;
export const WORLD_HEIGHT = GRID_ROWS * TILE_SIZE;

export class GridManager {
  public gridToWorldTopLeft(gridX: number, gridY: number): { x: number; y: number } {
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
}

export const gridManager = new GridManager();

export interface TangoCell {
  row: number;
  col: number;
  value: 'sun' | 'moon' | null; // null = empty
}

export interface TangoConstraint {
  cell1: { row: number; col: number };
  cell2: { row: number; col: number };
  type: 'equal' | 'opposite';
}

export interface TangoBoard {
  size: number; // grid is always square (e.g., 6x6)
  cells: TangoCell[][];
  constraints: TangoConstraint[];
}

export interface ZipCell {
  row: number;
  col: number;
  number: number | null; // null = empty cell
}

/**
 * Walls/barriers between cells. Stored as a set of blocked directions per cell.
 * Key: "row,col", Value: set of directions that are blocked from that cell.
 * e.g., walls["1,4"] = Set(["right"]) means you can't move right from (1,4) to (1,5)
 */
export type ZipWalls = Map<string, Set<'up' | 'down' | 'left' | 'right'>>;

export interface ZipBoard {
  rows: number;
  cols: number;
  cells: ZipCell[][];
  numberedCells: { row: number; col: number; number: number }[];
  walls: ZipWalls; // barriers between cells
}

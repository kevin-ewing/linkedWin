import { TangoCell, TangoConstraint, TangoBoard } from '../../types';

type CellValue = 'sun' | 'moon';

/**
 * Solves a Tango puzzle board using constraint propagation and backtracking search.
 *
 * Algorithm:
 * 1. Apply constraint propagation to reduce search space
 * 2. Use backtracking with MRV (Most Restrained Variable) heuristic
 * 3. At each step, validate all Tango constraints
 * 4. Return completed grid or null if unsolvable
 */
export function solveTango(board: TangoBoard): TangoCell[][] | null {
  const { size, cells, constraints } = board;

  // Build a working grid of possible values for each cell
  // Each cell has a set of possible values: ['sun'], ['moon'], or ['sun', 'moon']
  const possibles: Set<CellValue>[][] = Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => {
      const val = cells[r][c].value;
      if (val !== null) {
        return new Set<CellValue>([val]);
      }
      return new Set<CellValue>(['sun', 'moon']);
    })
  );

  // Apply initial constraint propagation
  if (!propagate(possibles, size, constraints)) {
    return null;
  }

  // Attempt to solve with backtracking
  const solution = backtrack(possibles, size, constraints);
  if (!solution) {
    return null;
  }

  // Build result TangoCell[][] from the solution
  return solution.map((row, r) =>
    row.map((val, c) => ({
      row: r,
      col: c,
      value: val,
    }))
  );
}

/**
 * Constraint propagation: eliminate impossible values based on:
 * - Row/column balance counts
 * - No-three-in-a-row rule
 * - Equality/inequality constraints
 *
 * Returns false if a contradiction is detected (some cell has no possible values).
 */
function propagate(
  possibles: Set<CellValue>[][],
  size: number,
  constraints: TangoConstraint[]
): boolean {
  let changed = true;

  while (changed) {
    changed = false;

    // Apply equality/inequality constraints
    for (const constraint of constraints) {
      const { cell1, cell2, type } = constraint;
      const p1 = possibles[cell1.row][cell1.col];
      const p2 = possibles[cell2.row][cell2.col];

      if (type === 'equal') {
        // Both cells must have the same value - intersect their possibilities
        const intersection = new Set<CellValue>(
          [...p1].filter((v) => p2.has(v))
        );
        if (intersection.size === 0) return false;
        if (intersection.size < p1.size) {
          possibles[cell1.row][cell1.col] = new Set(intersection);
          changed = true;
        }
        if (intersection.size < p2.size) {
          possibles[cell2.row][cell2.col] = new Set(intersection);
          changed = true;
        }
      } else {
        // 'opposite': cells must have different values
        if (p1.size === 1) {
          const val = [...p1][0];
          const opposite: CellValue = val === 'sun' ? 'moon' : 'sun';
          if (p2.has(val) && p2.size > 1) {
            p2.delete(val);
            changed = true;
          }
          if (p2.size === 0) return false;
          // If p2 only has the same value, contradiction
          if (p2.size === 1 && p2.has(val)) return false;
        }
        if (p2.size === 1) {
          const val = [...p2][0];
          if (p1.has(val) && p1.size > 1) {
            p1.delete(val);
            changed = true;
          }
          if (p1.size === 0) return false;
          if (p1.size === 1 && p1.has(val)) return false;
        }
      }
    }

    // Row/column balance: if a row/column already has size/2 of one symbol,
    // all remaining cells must be the other symbol
    const half = size / 2;

    for (let r = 0; r < size; r++) {
      let sunCount = 0;
      let moonCount = 0;
      for (let c = 0; c < size; c++) {
        const p = possibles[r][c];
        if (p.size === 1) {
          if (p.has('sun')) sunCount++;
          else moonCount++;
        }
      }

      if (sunCount > half || moonCount > half) return false;

      if (sunCount === half) {
        // All remaining undecided cells in this row must be 'moon'
        for (let c = 0; c < size; c++) {
          const p = possibles[r][c];
          if (p.size > 1 && p.has('sun')) {
            p.delete('sun');
            if (p.size === 0) return false;
            changed = true;
          }
        }
      }
      if (moonCount === half) {
        for (let c = 0; c < size; c++) {
          const p = possibles[r][c];
          if (p.size > 1 && p.has('moon')) {
            p.delete('moon');
            if (p.size === 0) return false;
            changed = true;
          }
        }
      }
    }

    for (let c = 0; c < size; c++) {
      let sunCount = 0;
      let moonCount = 0;
      for (let r = 0; r < size; r++) {
        const p = possibles[r][c];
        if (p.size === 1) {
          if (p.has('sun')) sunCount++;
          else moonCount++;
        }
      }

      if (sunCount > half || moonCount > half) return false;

      if (sunCount === half) {
        for (let r = 0; r < size; r++) {
          const p = possibles[r][c];
          if (p.size > 1 && p.has('sun')) {
            p.delete('sun');
            if (p.size === 0) return false;
            changed = true;
          }
        }
      }
      if (moonCount === half) {
        for (let r = 0; r < size; r++) {
          const p = possibles[r][c];
          if (p.size > 1 && p.has('moon')) {
            p.delete('moon');
            if (p.size === 0) return false;
            changed = true;
          }
        }
      }
    }

    // No-three-in-a-row: if two consecutive cells in a row/column are the same,
    // the adjacent cells must be the opposite
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const p = possibles[r][c];
        if (p.size !== 1) continue;
        const val = [...p][0];

        // Check horizontal: if this and next are the same, the one after must be opposite
        if (c + 1 < size && possibles[r][c + 1].size === 1 && possibles[r][c + 1].has(val)) {
          // cell at (r, c+2) must be opposite
          if (c + 2 < size) {
            const target = possibles[r][c + 2];
            if (target.has(val) && target.size > 1) {
              target.delete(val);
              if (target.size === 0) return false;
              changed = true;
            }
            if (target.size === 1 && target.has(val)) return false;
          }
          // cell at (r, c-1) must be opposite
          if (c - 1 >= 0) {
            const target = possibles[r][c - 1];
            if (target.has(val) && target.size > 1) {
              target.delete(val);
              if (target.size === 0) return false;
              changed = true;
            }
            if (target.size === 1 && target.has(val)) return false;
          }
        }

        // Check vertical: if this and next are the same, the one after must be opposite
        if (r + 1 < size && possibles[r + 1][c].size === 1 && possibles[r + 1][c].has(val)) {
          if (r + 2 < size) {
            const target = possibles[r + 2][c];
            if (target.has(val) && target.size > 1) {
              target.delete(val);
              if (target.size === 0) return false;
              changed = true;
            }
            if (target.size === 1 && target.has(val)) return false;
          }
          if (r - 1 >= 0) {
            const target = possibles[r - 1][c];
            if (target.has(val) && target.size > 1) {
              target.delete(val);
              if (target.size === 0) return false;
              changed = true;
            }
            if (target.size === 1 && target.has(val)) return false;
          }
        }
      }
    }
  }

  return true;
}

/**
 * Backtracking search with MRV (Most Restrained Variable) heuristic.
 * Picks the cell with the fewest remaining possibilities first.
 */
function backtrack(
  possibles: Set<CellValue>[][],
  size: number,
  constraints: TangoConstraint[]
): CellValue[][] | null {
  // Find the most constrained unresolved cell (MRV heuristic)
  let minSize = Infinity;
  let bestRow = -1;
  let bestCol = -1;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const pSize = possibles[r][c].size;
      if (pSize === 0) return null; // contradiction
      if (pSize > 1 && pSize < minSize) {
        minSize = pSize;
        bestRow = r;
        bestCol = c;
      }
    }
  }

  // If no unresolved cell found, we have a complete assignment
  if (bestRow === -1) {
    // Validate the complete solution
    const grid = possibles.map((row) => row.map((p) => [...p][0]));
    if (isValidSolution(grid, size, constraints)) {
      return grid;
    }
    return null;
  }

  // Try each possible value for the chosen cell
  const values = [...possibles[bestRow][bestCol]];

  for (const val of values) {
    // Clone the possibles grid
    const cloned = clonePossibles(possibles);
    cloned[bestRow][bestCol] = new Set([val]);

    // Propagate constraints
    if (propagate(cloned, size, constraints)) {
      const result = backtrack(cloned, size, constraints);
      if (result) return result;
    }
  }

  return null;
}

/**
 * Deep clone the possibles grid.
 */
function clonePossibles(possibles: Set<CellValue>[][]): Set<CellValue>[][] {
  return possibles.map((row) => row.map((p) => new Set(p)));
}

/**
 * Validates a complete Tango solution against all constraints:
 * - No three consecutive identical symbols in any row or column
 * - Each row has exactly size/2 suns and size/2 moons
 * - Each column has exactly size/2 suns and size/2 moons
 * - All equality constraints are satisfied
 * - All inequality constraints are satisfied
 */
export function isValidSolution(
  grid: CellValue[][],
  size: number,
  constraints: TangoConstraint[]
): boolean {
  const half = size / 2;

  // Check row balance and no-three-in-a-row for rows
  for (let r = 0; r < size; r++) {
    let sunCount = 0;
    let moonCount = 0;

    for (let c = 0; c < size; c++) {
      if (grid[r][c] === 'sun') sunCount++;
      else moonCount++;

      // Check no three in a row horizontally
      if (c >= 2 && grid[r][c] === grid[r][c - 1] && grid[r][c] === grid[r][c - 2]) {
        return false;
      }
    }

    if (sunCount !== half || moonCount !== half) return false;
  }

  // Check column balance and no-three-in-a-row for columns
  for (let c = 0; c < size; c++) {
    let sunCount = 0;
    let moonCount = 0;

    for (let r = 0; r < size; r++) {
      if (grid[r][c] === 'sun') sunCount++;
      else moonCount++;

      // Check no three in a row vertically
      if (r >= 2 && grid[r][c] === grid[r - 1][c] && grid[r][c] === grid[r - 2][c]) {
        return false;
      }
    }

    if (sunCount !== half || moonCount !== half) return false;
  }

  // Check equality/inequality constraints
  for (const constraint of constraints) {
    const { cell1, cell2, type } = constraint;
    const v1 = grid[cell1.row][cell1.col];
    const v2 = grid[cell2.row][cell2.col];

    if (type === 'equal' && v1 !== v2) return false;
    if (type === 'opposite' && v1 === v2) return false;
  }

  return true;
}

import { PatchesBoard, PatchClue, PatchRect, PatchShape } from '../../types';

/**
 * Solves a Patches puzzle by partitioning the grid into rectangles,
 * each containing exactly one clue and matching its constraints.
 *
 * Algorithm: Backtracking with constraint propagation.
 * - For each clue, enumerate all valid rectangles that contain it
 * - Place rectangles one at a time, pruning when cells become unreachable
 */
export function solvePatches(board: PatchesBoard): PatchRect[] | null {
  const { rows, cols, clues } = board;

  // For each clue, generate all possible rectangles that:
  // 1. Contain the clue cell
  // 2. Match the shape constraint
  // 3. Match the size constraint (if specified)
  // 4. Fit within the grid
  const candidates: PatchRect[][] = clues.map((clue, clueIdx) =>
    generateCandidates(clue, clueIdx, rows, cols)
  );

  // Sort clues by number of candidates (most constrained first)
  const order = clues.map((_, i) => i);
  order.sort((a, b) => candidates[a].length - candidates[b].length);

  // Grid tracking: which clue owns each cell (-1 = unassigned)
  const grid: number[][] = Array.from({ length: rows }, () => Array(cols).fill(-1));
  const solution: (PatchRect | null)[] = Array(clues.length).fill(null);

  if (solve(0)) {
    return solution as PatchRect[];
  }
  return null;

  function solve(orderIdx: number): boolean {
    if (orderIdx === order.length) {
      // All clues placed — check no empty cells remain
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (grid[r][c] === -1) return false;
        }
      }
      return true;
    }

    const clueIdx = order[orderIdx];
    const clue = clues[clueIdx];

    for (const rect of candidates[clueIdx]) {
      if (canPlace(rect, clueIdx)) {
        place(rect, clueIdx);
        if (solve(orderIdx + 1)) return true;
        unplace(rect, clueIdx);
      }
    }

    return false;
  }

  function canPlace(rect: PatchRect, clueIdx: number): boolean {
    for (let r = rect.top; r <= rect.bottom; r++) {
      for (let c = rect.left; c <= rect.right; c++) {
        if (grid[r][c] !== -1) return false;
      }
    }
    // Make sure no OTHER clue is inside this rectangle
    for (let i = 0; i < clues.length; i++) {
      if (i === clueIdx) continue;
      const other = clues[i];
      if (other.row >= rect.top && other.row <= rect.bottom &&
          other.col >= rect.left && other.col <= rect.right) {
        return false;
      }
    }
    return true;
  }

  function place(rect: PatchRect, clueIdx: number): void {
    for (let r = rect.top; r <= rect.bottom; r++) {
      for (let c = rect.left; c <= rect.right; c++) {
        grid[r][c] = clueIdx;
      }
    }
    solution[clueIdx] = rect;
  }

  function unplace(rect: PatchRect, clueIdx: number): void {
    for (let r = rect.top; r <= rect.bottom; r++) {
      for (let c = rect.left; c <= rect.right; c++) {
        grid[r][c] = -1;
      }
    }
    solution[clueIdx] = null;
  }
}

/**
 * Generate all valid rectangle placements for a clue.
 */
function generateCandidates(clue: PatchClue, clueIdx: number, rows: number, cols: number): PatchRect[] {
  const results: PatchRect[] = [];
  const { row, col, shape, size } = clue;

  // Enumerate all possible rectangle dimensions
  for (let h = 1; h <= rows; h++) {
    for (let w = 1; w <= cols; w++) {
      const area = h * w;

      // Check size constraint
      if (size !== null && area !== size) continue;
      // Minimum size is 1
      if (area < 1) continue;

      // Check shape constraint
      if (!matchesShape(shape, h, w)) continue;

      // Enumerate all positions where this rectangle contains the clue cell
      // The clue must be inside the rectangle
      for (let top = Math.max(0, row - h + 1); top <= row; top++) {
        for (let left = Math.max(0, col - w + 1); left <= col; left++) {
          const bottom = top + h - 1;
          const right = left + w - 1;

          // Check bounds
          if (bottom >= rows || right >= cols) continue;

          // Verify clue is inside
          if (row >= top && row <= bottom && col >= left && col <= right) {
            results.push({ clueIdx, top, left, bottom, right });
          }
        }
      }
    }
  }

  return results;
}

function matchesShape(shape: PatchShape, height: number, width: number): boolean {
  switch (shape) {
    case 'wide_rectangle': return width > height;
    case 'tall_rectangle': return height > width;
    case 'square': return height === width;
    case 'freeform': return true; // any rectangle
  }
}

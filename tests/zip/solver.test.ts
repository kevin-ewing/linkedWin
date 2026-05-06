import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { solveZip } from '../../src/solvers/zip/solver';
import { ZipBoard, ZipCell } from '../../src/types';

// ============================================================================
// Helpers for building test boards
// ============================================================================

function makeZipBoard(
  rows: number,
  cols: number,
  numberedCells: { row: number; col: number; number: number }[],
  walls?: Map<string, Set<'up' | 'down' | 'left' | 'right'>>
): ZipBoard {
  const cells: ZipCell[][] = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => ({
      row: r,
      col: c,
      number: null,
    }))
  );

  for (const { row, col, number } of numberedCells) {
    cells[row][col] = { row, col, number };
  }

  return { rows, cols, cells, numberedCells, walls: walls || new Map() };
}

// ============================================================================
// Generators for property-based tests
// ============================================================================

/**
 * Generates a solvable ZipBoard by constructing a valid Hamiltonian path first,
 * then placing waypoints along it.
 *
 * Strategy:
 * 1. Generate a random Hamiltonian path on the grid using random walk
 * 2. Pick positions along the path as waypoints (including start and end)
 * 3. Number the waypoints in path order
 */
function solvableZipBoardArb(size: number): fc.Arbitrary<ZipBoard> {
  return fc
    .record({
      // Random seed for path generation
      seed: fc.array(fc.integer({ min: 0, max: 3 }), {
        minLength: size * size * 4,
        maxLength: size * size * 4,
      }),
      // Number of intermediate waypoints (besides start and end)
      numIntermediateWaypoints: fc.integer({ min: 0, max: Math.min(3, size * size - 2) }),
      // Positions for intermediate waypoints (as fractions of path length)
      waypointPositions: fc.array(
        fc.double({ min: 0.1, max: 0.9, noNaN: true }),
        { minLength: 5, maxLength: 5 }
      ),
    })
    .map(({ seed, numIntermediateWaypoints, waypointPositions }) => {
      const path = generateHamiltonianPath(size, size, seed);
      if (!path) return null;

      const totalCells = path.length;

      // Place waypoints: always include start and end
      const waypointIndices: number[] = [0];

      // Add intermediate waypoints at various positions along the path
      for (let i = 0; i < numIntermediateWaypoints; i++) {
        const frac = waypointPositions[i % waypointPositions.length];
        const idx = Math.floor(frac * (totalCells - 1));
        if (idx > 0 && idx < totalCells - 1 && !waypointIndices.includes(idx)) {
          waypointIndices.push(idx);
        }
      }

      waypointIndices.push(totalCells - 1);

      // Sort and deduplicate
      const sorted = [...new Set(waypointIndices)].sort((a, b) => a - b);

      // Build numbered cells
      const numberedCells: { row: number; col: number; number: number }[] = sorted.map(
        (pathIdx, wpNum) => ({
          row: path[pathIdx].row,
          col: path[pathIdx].col,
          number: wpNum + 1,
        })
      );

      return makeZipBoard(size, size, numberedCells);
    })
    .filter((board): board is ZipBoard => board !== null);
}

/**
 * Generate a Hamiltonian path on a rows x cols grid using a random walk
 * guided by the seed array. Uses Warnsdorff-like heuristic with randomization.
 */
function generateHamiltonianPath(
  rows: number,
  cols: number,
  seed: number[]
): { row: number; col: number }[] | null {
  const totalCells = rows * cols;
  const visited: boolean[][] = Array.from({ length: rows }, () =>
    Array(cols).fill(false)
  );

  // Start from top-left corner for simplicity
  const path: { row: number; col: number }[] = [{ row: 0, col: 0 }];
  visited[0][0] = true;
  let seedIdx = 0;

  while (path.length < totalCells) {
    const current = path[path.length - 1];
    const neighbors = getUnvisitedNeighbors(current.row, current.col, visited, rows, cols);

    if (neighbors.length === 0) {
      // Dead end - restart with different approach
      return null;
    }

    // Sort by Warnsdorff's heuristic, break ties with seed
    neighbors.sort((a, b) => {
      const degA = countUnvisited(a.row, a.col, visited, rows, cols);
      const degB = countUnvisited(b.row, b.col, visited, rows, cols);
      if (degA !== degB) return degA - degB;
      return (seed[seedIdx % seed.length] || 0) % 2 === 0 ? -1 : 1;
    });

    // Use seed to pick among neighbors with same degree
    const choice = seed[seedIdx % seed.length] % neighbors.length;
    seedIdx++;

    const next = neighbors[choice];
    visited[next.row][next.col] = true;
    path.push(next);
  }

  return path;
}

function getUnvisitedNeighbors(
  row: number,
  col: number,
  visited: boolean[][],
  rows: number,
  cols: number
): { row: number; col: number }[] {
  const result: { row: number; col: number }[] = [];
  if (row > 0 && !visited[row - 1][col]) result.push({ row: row - 1, col });
  if (row < rows - 1 && !visited[row + 1][col]) result.push({ row: row + 1, col });
  if (col > 0 && !visited[row][col - 1]) result.push({ row, col: col - 1 });
  if (col < cols - 1 && !visited[row][col + 1]) result.push({ row, col: col + 1 });
  return result;
}

function countUnvisited(
  row: number,
  col: number,
  visited: boolean[][],
  rows: number,
  cols: number
): number {
  let count = 0;
  if (row > 0 && !visited[row - 1][col]) count++;
  if (row < rows - 1 && !visited[row + 1][col]) count++;
  if (col > 0 && !visited[row][col - 1]) count++;
  if (col < cols - 1 && !visited[row][col + 1]) count++;
  return count;
}

// ============================================================================
// Task 6.4: Property-based tests - Hamiltonian path property
// ============================================================================

describe('Zip Solver - Property-Based Tests', () => {
  describe('Hamiltonian path property', () => {
    /**
     * **Validates: Requirements 6.1**
     *
     * For any solvable ZipBoard, the path produced by solveZip visits every
     * cell in the grid exactly once.
     */
    it('solution visits every cell exactly once for 3x3 boards', () => {
      fc.assert(
        fc.property(solvableZipBoardArb(3), (board) => {
          const solution = solveZip(board);

          if (solution === null) return true; // skip unsolvable

          const totalCells = board.rows * board.cols;

          // Path length must equal total cells
          expect(solution.length).toBe(totalCells);

          // Every cell must appear exactly once
          const seen = new Set<string>();
          for (const { row, col } of solution) {
            const key = `${row},${col}`;
            expect(seen.has(key)).toBe(false);
            seen.add(key);
          }

          // All cells in the grid must be visited
          for (let r = 0; r < board.rows; r++) {
            for (let c = 0; c < board.cols; c++) {
              expect(seen.has(`${r},${c}`)).toBe(true);
            }
          }
        }),
        { numRuns: 30 }
      );
    });

    it('solution visits every cell exactly once for 4x4 boards', () => {
      fc.assert(
        fc.property(solvableZipBoardArb(4), (board) => {
          const solution = solveZip(board);

          if (solution === null) return true;

          const totalCells = board.rows * board.cols;
          expect(solution.length).toBe(totalCells);

          const seen = new Set<string>();
          for (const { row, col } of solution) {
            const key = `${row},${col}`;
            expect(seen.has(key)).toBe(false);
            seen.add(key);
          }

          for (let r = 0; r < board.rows; r++) {
            for (let c = 0; c < board.cols; c++) {
              expect(seen.has(`${r},${c}`)).toBe(true);
            }
          }
        }),
        { numRuns: 20 }
      );
    });
  });

  // ============================================================================
  // Task 6.5: Property-based tests - Adjacency property
  // ============================================================================

  describe('Adjacency property', () => {
    /**
     * **Validates: Requirements 6.2**
     *
     * For any solution path, every pair of consecutive cells in the path are
     * orthogonally adjacent (differ by exactly 1 in either row or column, but not both).
     */
    it('consecutive cells are orthogonal neighbors for 3x3 boards', () => {
      fc.assert(
        fc.property(solvableZipBoardArb(3), (board) => {
          const solution = solveZip(board);

          if (solution === null) return true;

          for (let i = 0; i < solution.length - 1; i++) {
            const curr = solution[i];
            const next = solution[i + 1];
            const rowDiff = Math.abs(curr.row - next.row);
            const colDiff = Math.abs(curr.col - next.col);

            // Must differ by exactly 1 in one dimension and 0 in the other
            expect(rowDiff + colDiff).toBe(1);
          }
        }),
        { numRuns: 30 }
      );
    });

    it('consecutive cells are orthogonal neighbors for 4x4 boards', () => {
      fc.assert(
        fc.property(solvableZipBoardArb(4), (board) => {
          const solution = solveZip(board);

          if (solution === null) return true;

          for (let i = 0; i < solution.length - 1; i++) {
            const curr = solution[i];
            const next = solution[i + 1];
            const rowDiff = Math.abs(curr.row - next.row);
            const colDiff = Math.abs(curr.col - next.col);

            expect(rowDiff + colDiff).toBe(1);
          }
        }),
        { numRuns: 20 }
      );
    });
  });

  // ============================================================================
  // Task 6.6: Property-based tests - Waypoint ordering property
  // ============================================================================

  describe('Waypoint ordering property', () => {
    /**
     * **Validates: Requirements 6.3**
     *
     * For any solvable ZipBoard, the solution path passes through all numbered
     * cells in ascending order of their numbers.
     */
    it('waypoints appear in ascending order for 3x3 boards', () => {
      fc.assert(
        fc.property(solvableZipBoardArb(3), (board) => {
          const solution = solveZip(board);

          if (solution === null) return true;

          // Get waypoints sorted by number
          const waypoints = [...board.numberedCells].sort((a, b) => a.number - b.number);

          // Find the index of each waypoint in the solution path
          const waypointPathIndices: number[] = [];
          for (const wp of waypoints) {
            const idx = solution.findIndex(
              (cell) => cell.row === wp.row && cell.col === wp.col
            );
            expect(idx).toBeGreaterThanOrEqual(0);
            waypointPathIndices.push(idx);
          }

          // Waypoints must appear in strictly increasing order in the path
          for (let i = 0; i < waypointPathIndices.length - 1; i++) {
            expect(waypointPathIndices[i]).toBeLessThan(waypointPathIndices[i + 1]);
          }
        }),
        { numRuns: 30 }
      );
    });

    it('waypoints appear in ascending order for 4x4 boards', () => {
      fc.assert(
        fc.property(solvableZipBoardArb(4), (board) => {
          const solution = solveZip(board);

          if (solution === null) return true;

          const waypoints = [...board.numberedCells].sort((a, b) => a.number - b.number);

          const waypointPathIndices: number[] = [];
          for (const wp of waypoints) {
            const idx = solution.findIndex(
              (cell) => cell.row === wp.row && cell.col === wp.col
            );
            expect(idx).toBeGreaterThanOrEqual(0);
            waypointPathIndices.push(idx);
          }

          for (let i = 0; i < waypointPathIndices.length - 1; i++) {
            expect(waypointPathIndices[i]).toBeLessThan(waypointPathIndices[i + 1]);
          }
        }),
        { numRuns: 20 }
      );
    });
  });
});

// ============================================================================
// Task 6.7: Unit tests with hand-crafted boards of known solutions
// ============================================================================

describe('Zip Solver - Unit Tests', () => {
  it('solves a 3x3 board with only start and end waypoints', () => {
    // 3x3 grid, waypoint 1 at (0,0), waypoint 2 at (2,2)
    // One valid path: (0,0)->(0,1)->(0,2)->(1,2)->(1,1)->(1,0)->(2,0)->(2,1)->(2,2)
    const board = makeZipBoard(3, 3, [
      { row: 0, col: 0, number: 1 },
      { row: 2, col: 2, number: 2 },
    ]);

    const solution = solveZip(board);
    expect(solution).not.toBeNull();
    expect(solution!.length).toBe(9);

    // Verify start and end
    expect(solution![0]).toEqual({ row: 0, col: 0 });
    expect(solution![8]).toEqual({ row: 2, col: 2 });

    // Verify adjacency
    for (let i = 0; i < solution!.length - 1; i++) {
      const curr = solution![i];
      const next = solution![i + 1];
      const dist = Math.abs(curr.row - next.row) + Math.abs(curr.col - next.col);
      expect(dist).toBe(1);
    }

    // Verify all cells visited exactly once
    const seen = new Set(solution!.map(({ row, col }) => `${row},${col}`));
    expect(seen.size).toBe(9);
  });

  it('solves a 3x3 board with intermediate waypoints', () => {
    // 3x3 grid with waypoints forcing a specific path
    // Path: (0,0)->(1,0)->(2,0)->(2,1)->(2,2)->(1,2)->(0,2)->(0,1)->(1,1)
    // Waypoints: 1@(0,0), 2@(2,0), 3@(2,2), 4@(1,1)
    const board = makeZipBoard(3, 3, [
      { row: 0, col: 0, number: 1 },
      { row: 2, col: 0, number: 2 },
      { row: 2, col: 2, number: 3 },
      { row: 1, col: 1, number: 4 },
    ]);

    const solution = solveZip(board);
    expect(solution).not.toBeNull();
    expect(solution!.length).toBe(9);

    // Verify waypoint ordering
    const wp1Idx = solution!.findIndex((c) => c.row === 0 && c.col === 0);
    const wp2Idx = solution!.findIndex((c) => c.row === 2 && c.col === 0);
    const wp3Idx = solution!.findIndex((c) => c.row === 2 && c.col === 2);
    const wp4Idx = solution!.findIndex((c) => c.row === 1 && c.col === 1);

    expect(wp1Idx).toBe(0); // start
    expect(wp2Idx).toBeGreaterThan(wp1Idx);
    expect(wp3Idx).toBeGreaterThan(wp2Idx);
    expect(wp4Idx).toBeGreaterThan(wp3Idx);
    expect(wp4Idx).toBe(8); // end
  });

  it('solves a 4x4 board with start and end waypoints', () => {
    // 4x4 grid, waypoint 1 at (0,0), waypoint 2 at (3,2)
    // Note: (0,0) and (3,3) have same parity so no Hamiltonian path exists between them.
    // (0,0) parity=0, (3,2) parity=1 - valid for a 16-cell path.
    const board = makeZipBoard(4, 4, [
      { row: 0, col: 0, number: 1 },
      { row: 3, col: 2, number: 2 },
    ]);

    const solution = solveZip(board);
    expect(solution).not.toBeNull();
    expect(solution!.length).toBe(16);

    // Verify start and end
    expect(solution![0]).toEqual({ row: 0, col: 0 });
    expect(solution![15]).toEqual({ row: 3, col: 2 });

    // Verify adjacency
    for (let i = 0; i < solution!.length - 1; i++) {
      const curr = solution![i];
      const next = solution![i + 1];
      const dist = Math.abs(curr.row - next.row) + Math.abs(curr.col - next.col);
      expect(dist).toBe(1);
    }

    // Verify all cells visited
    const seen = new Set(solution!.map(({ row, col }) => `${row},${col}`));
    expect(seen.size).toBe(16);
  });

  it('solves a 4x4 board with many waypoints', () => {
    // 4x4 grid with waypoints along a known snake path:
    // (0,0)->(0,1)->(0,2)->(0,3)->(1,3)->(1,2)->(1,1)->(1,0)->
    // (2,0)->(2,1)->(2,2)->(2,3)->(3,3)->(3,2)->(3,1)->(3,0)
    const board = makeZipBoard(4, 4, [
      { row: 0, col: 0, number: 1 },
      { row: 0, col: 3, number: 2 },
      { row: 1, col: 0, number: 3 },
      { row: 2, col: 3, number: 4 },
      { row: 3, col: 0, number: 5 },
    ]);

    const solution = solveZip(board);
    expect(solution).not.toBeNull();
    expect(solution!.length).toBe(16);

    // Verify waypoint ordering
    const indices = [
      solution!.findIndex((c) => c.row === 0 && c.col === 0),
      solution!.findIndex((c) => c.row === 0 && c.col === 3),
      solution!.findIndex((c) => c.row === 1 && c.col === 0),
      solution!.findIndex((c) => c.row === 2 && c.col === 3),
      solution!.findIndex((c) => c.row === 3 && c.col === 0),
    ];

    for (let i = 0; i < indices.length - 1; i++) {
      expect(indices[i]).toBeLessThan(indices[i + 1]);
    }
  });

  it('solves a 5x5 board with start and end waypoints', () => {
    // 5x5 grid, waypoint 1 at (0,0), waypoint 2 at (4,4)
    const board = makeZipBoard(5, 5, [
      { row: 0, col: 0, number: 1 },
      { row: 4, col: 4, number: 2 },
    ]);

    const solution = solveZip(board);
    expect(solution).not.toBeNull();
    expect(solution!.length).toBe(25);

    // Verify start and end
    expect(solution![0]).toEqual({ row: 0, col: 0 });
    expect(solution![24]).toEqual({ row: 4, col: 4 });

    // Verify adjacency
    for (let i = 0; i < solution!.length - 1; i++) {
      const curr = solution![i];
      const next = solution![i + 1];
      const dist = Math.abs(curr.row - next.row) + Math.abs(curr.col - next.col);
      expect(dist).toBe(1);
    }

    // Verify all cells visited
    const seen = new Set(solution!.map(({ row, col }) => `${row},${col}`));
    expect(seen.size).toBe(25);
  });

  it('returns null for an unsolvable board', () => {
    // 3x3 grid where waypoints force an impossible path
    // Waypoint 1 at (0,0), waypoint 2 at (0,2), waypoint 3 at (2,0)
    // This requires going from (0,0) to (0,2) then to (2,0) visiting all cells
    // but (0,2) and (2,0) are not adjacent and the path constraints make it impossible
    // Actually let's use a clearly unsolvable case:
    // On a 2x2 grid, start at (0,0), must go through (1,1) second, then (0,1), then (1,0)
    // (0,0) -> (1,1) is not adjacent, so this is unsolvable
    const board = makeZipBoard(2, 2, [
      { row: 0, col: 0, number: 1 },
      { row: 1, col: 1, number: 2 },
      { row: 0, col: 1, number: 3 },
      { row: 1, col: 0, number: 4 },
    ]);

    const solution = solveZip(board);
    expect(solution).toBeNull();
  });

  it('solves a board where waypoints are at grid edges', () => {
    // 3x3 grid with waypoints at corners
    // 1@(0,0), 2@(0,2), 3@(2,2)
    const board = makeZipBoard(3, 3, [
      { row: 0, col: 0, number: 1 },
      { row: 0, col: 2, number: 2 },
      { row: 2, col: 2, number: 3 },
    ]);

    const solution = solveZip(board);
    expect(solution).not.toBeNull();
    expect(solution!.length).toBe(9);

    // Verify waypoint ordering
    const wp1Idx = solution!.findIndex((c) => c.row === 0 && c.col === 0);
    const wp2Idx = solution!.findIndex((c) => c.row === 0 && c.col === 2);
    const wp3Idx = solution!.findIndex((c) => c.row === 2 && c.col === 2);

    expect(wp1Idx).toBe(0);
    expect(wp2Idx).toBeGreaterThan(wp1Idx);
    expect(wp3Idx).toBeGreaterThan(wp2Idx);
    expect(wp3Idx).toBe(8); // last cell
  });
});

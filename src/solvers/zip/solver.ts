import { ZipBoard, ZipWalls } from '../../types';

/**
 * Solves a Zip puzzle board by finding a Hamiltonian path that visits every cell
 * exactly once, passes through numbered waypoints in order, only moves between
 * orthogonally adjacent cells, and respects wall barriers.
 *
 * Algorithm:
 * - DFS + Backtracking from first waypoint to last
 * - Warnsdorff's heuristic for neighbor ordering
 * - Connected components pruning (if unvisited cells become disconnected, prune)
 * - Waypoint order enforcement
 */
export function solveZip(board: ZipBoard): { row: number; col: number }[] | null {
  const { rows, cols, numberedCells, walls } = board;
  const totalCells = rows * cols;

  // Sort waypoints by their number
  const waypoints = [...numberedCells].sort((a, b) => a.number - b.number);

  if (waypoints.length < 2) {
    return null;
  }

  // Precompute adjacency: for each cell, store its valid neighbors (respecting walls)
  const adjacency: { row: number; col: number }[][][] = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => getNeighbors(r, c, rows, cols, walls))
  );

  // Build waypoint lookup: position -> waypoint index
  const waypointAt = new Map<string, number>();
  for (let i = 0; i < waypoints.length; i++) {
    waypointAt.set(`${waypoints[i].row},${waypoints[i].col}`, i);
  }

  // Visited grid
  const visited: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));

  // Path accumulator
  const path: { row: number; col: number }[] = [];

  // Start from the first waypoint
  const start = waypoints[0];
  path.push({ row: start.row, col: start.col });
  visited[start.row][start.col] = true;

  if (dfs(path, visited, 1, 1)) {
    return path;
  }

  return null;

  function dfs(
    path: { row: number; col: number }[],
    visited: boolean[][],
    nextWaypointIdx: number,
    visitedCount: number
  ): boolean {
    // All cells visited — check we've hit all waypoints
    if (visitedCount === totalCells) {
      return nextWaypointIdx === waypoints.length;
    }

    const current = path[path.length - 1];
    const lastWaypoint = waypoints[waypoints.length - 1];
    const remaining = totalCells - visitedCount;

    // Get valid unvisited neighbors
    const neighbors = adjacency[current.row][current.col]
      .filter(({ row, col }) => !visited[row][col]);

    // Sort by Warnsdorff's heuristic (fewest onward moves first)
    neighbors.sort((a, b) => {
      const degA = adjacency[a.row][a.col].filter(n => !visited[n.row][n.col]).length;
      const degB = adjacency[b.row][b.col].filter(n => !visited[n.row][n.col]).length;
      return degA - degB;
    });

    for (const next of neighbors) {
      const { row, col } = next;

      // Check waypoint constraints
      const wpIdx = waypointAt.get(`${row},${col}`);

      // If this is a waypoint, it must be the NEXT expected one
      if (wpIdx !== undefined && wpIdx !== nextWaypointIdx) {
        continue;
      }

      // The last waypoint must be the very last cell visited
      if (row === lastWaypoint.row && col === lastWaypoint.col && remaining > 1) {
        continue;
      }

      // Mark visited
      visited[row][col] = true;
      path.push({ row, col });
      const newNextWp = wpIdx === nextWaypointIdx ? nextWaypointIdx + 1 : nextWaypointIdx;

      // Connected components pruning: check remaining unvisited cells are connected
      if (remaining > 2 && !isConnected(visited, adjacency, rows, cols, path)) {
        visited[row][col] = false;
        path.pop();
        continue;
      }

      if (dfs(path, visited, newNextWp, visitedCount + 1)) {
        return true;
      }

      // Backtrack
      visited[row][col] = false;
      path.pop();
    }

    return false;
  }
}

/**
 * Get orthogonal neighbors of a cell, respecting walls/barriers.
 */
function getNeighbors(
  row: number,
  col: number,
  rows: number,
  cols: number,
  walls: ZipWalls
): { row: number; col: number }[] {
  const result: { row: number; col: number }[] = [];
  const cellWalls = walls.get(`${row},${col}`);

  // Up
  if (row > 0 && !cellWalls?.has('up')) {
    const aboveWalls = walls.get(`${row - 1},${col}`);
    if (!aboveWalls?.has('down')) {
      result.push({ row: row - 1, col });
    }
  }
  // Down
  if (row < rows - 1 && !cellWalls?.has('down')) {
    const belowWalls = walls.get(`${row + 1},${col}`);
    if (!belowWalls?.has('up')) {
      result.push({ row: row + 1, col });
    }
  }
  // Left
  if (col > 0 && !cellWalls?.has('left')) {
    const leftWalls = walls.get(`${row},${col - 1}`);
    if (!leftWalls?.has('right')) {
      result.push({ row, col: col - 1 });
    }
  }
  // Right
  if (col < cols - 1 && !cellWalls?.has('right')) {
    const rightWalls = walls.get(`${row},${col + 1}`);
    if (!rightWalls?.has('left')) {
      result.push({ row, col: col + 1 });
    }
  }
  return result;
}

/**
 * Check that all unvisited cells form a single connected component
 * reachable from the current path end.
 */
function isConnected(
  visited: boolean[][],
  adjacency: { row: number; col: number }[][][],
  rows: number,
  cols: number,
  path: { row: number; col: number }[]
): boolean {
  const current = path[path.length - 1];

  // Count total unvisited
  let totalUnvisited = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!visited[r][c]) totalUnvisited++;
    }
  }

  if (totalUnvisited === 0) return true;

  // Find an unvisited neighbor of current cell to start BFS
  const startNeighbors = adjacency[current.row][current.col]
    .filter(({ row, col }) => !visited[row][col]);

  if (startNeighbors.length === 0) return false;

  // BFS from first unvisited neighbor
  const seen: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));
  const queue: { row: number; col: number }[] = [startNeighbors[0]];
  seen[startNeighbors[0].row][startNeighbors[0].col] = true;
  let reachable = 1;

  while (queue.length > 0) {
    const cell = queue.shift()!;
    for (const { row, col } of adjacency[cell.row][cell.col]) {
      if (!visited[row][col] && !seen[row][col]) {
        seen[row][col] = true;
        reachable++;
        queue.push({ row, col });
      }
    }
  }

  return reachable === totalUnvisited;
}

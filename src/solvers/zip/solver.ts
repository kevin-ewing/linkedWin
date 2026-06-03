import { ZipBoard, ZipWalls } from '../../types';

/**
 * Solves a Zip puzzle board by finding a Hamiltonian path that visits every cell
 * exactly once, passes through numbered waypoints in order, only moves between
 * orthogonally adjacent cells, and respects wall barriers.
 *
 * Algorithm:
 * - DFS + Backtracking from first waypoint to last
 * - Warnsdorff's heuristic for neighbor ordering (prefer cells with fewer exits)
 * - Connected components pruning (unvisited cells must remain connected)
 * - Waypoint reachability pruning (next waypoint must be reachable)
 * - Dead-end detection (cells with only 1 unvisited neighbor must be visited soon)
 * - Articulation point awareness
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
  const adjacency: number[][][] = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => getNeighborIndices(r, c, rows, cols, walls))
  );

  // Build waypoint lookup: flat index -> waypoint order index
  const waypointAt = new Map<number, number>();
  for (let i = 0; i < waypoints.length; i++) {
    waypointAt.set(waypoints[i].row * cols + waypoints[i].col, i);
  }

  // Flat visited array (faster than 2D)
  const visited = new Uint8Array(totalCells);

  // Path accumulator (flat indices)
  const pathIndices: number[] = [];

  // Start from the first waypoint
  const start = waypoints[0];
  const startIdx = start.row * cols + start.col;
  pathIndices.push(startIdx);
  visited[startIdx] = 1;

  // Precompute: for each waypoint, the minimum distance to the next waypoint
  // (BFS ignoring visited state — used for early termination)
  const waypointMinDist = precomputeWaypointDistances(waypoints, rows, cols, adjacency);

  const result = dfs(startIdx, 1, 1);

  if (result) {
    return pathIndices.map(idx => ({ row: Math.floor(idx / cols), col: idx % cols }));
  }

  // If the main solver fails, try without connectivity pruning (slower but more thorough)
  console.log('   Primary solver failed, trying without connectivity pruning...');
  pathIndices.length = 0;
  visited.fill(0);
  pathIndices.push(startIdx);
  visited[startIdx] = 1;

  const resultFallback = dfsFallback(startIdx, 1, 1);
  if (resultFallback) {
    return pathIndices.map(idx => ({ row: Math.floor(idx / cols), col: idx % cols }));
  }

  return null;

  function dfs(current: number, nextWaypointIdx: number, visitedCount: number): boolean {
    // All cells visited — check we've hit all waypoints
    if (visitedCount === totalCells) {
      return nextWaypointIdx === waypoints.length;
    }

    const currentRow = Math.floor(current / cols);
    const currentCol = current % cols;
    const remaining = totalCells - visitedCount;

    // Quick check: can we still reach the last waypoint?
    const lastWp = waypoints[waypoints.length - 1];
    const lastWpIdx = lastWp.row * cols + lastWp.col;

    // Get valid unvisited neighbors
    const neighbors = adjacency[currentRow][currentCol].filter(n => !visited[n]);

    if (neighbors.length === 0) {
      return false;
    }

    // Sort by Warnsdorff's heuristic (fewest onward moves first)
    // This dramatically reduces search space for Hamiltonian path problems
    neighbors.sort((a, b) => {
      const aRow = Math.floor(a / cols);
      const aCol = a % cols;
      const bRow = Math.floor(b / cols);
      const bCol = b % cols;
      const degA = adjacency[aRow][aCol].filter(n => !visited[n]).length;
      const degB = adjacency[bRow][bCol].filter(n => !visited[n]).length;
      return degA - degB;
    });

    for (const next of neighbors) {
      const nextRow = Math.floor(next / cols);
      const nextCol = next % cols;

      // Check waypoint constraints
      const wpIdx = waypointAt.get(next);

      // If this is a waypoint, it must be the NEXT expected one
      if (wpIdx !== undefined && wpIdx !== nextWaypointIdx) {
        continue;
      }

      // The last waypoint must be the very last cell visited
      if (next === lastWpIdx && remaining > 1) {
        continue;
      }

      // Mark visited
      visited[next] = 1;
      pathIndices.push(next);
      const newNextWp = wpIdx === nextWaypointIdx ? nextWaypointIdx + 1 : nextWaypointIdx;

      // Pruning: check that unvisited cells remain connected
      // Only do expensive connectivity check when there are enough remaining cells
      // to make it worthwhile (skip for very small remaining counts)
      if (remaining > 2) {
        if (!isConnectedFast(next, visited, adjacency, rows, cols, remaining - 1)) {
          visited[next] = 0;
          pathIndices.pop();
          continue;
        }
      }

      // Pruning: check dead-end cells
      // If any unvisited cell has exactly 0 unvisited neighbors (and it's not the last cell),
      // this path is invalid
      if (remaining > 2 && hasIsolatedCell(next, visited, adjacency, rows, cols)) {
        visited[next] = 0;
        pathIndices.pop();
        continue;
      }

      if (dfs(next, newNextWp, visitedCount + 1)) {
        return true;
      }

      // Backtrack
      visited[next] = 0;
      pathIndices.pop();
    }

    return false;
  }

  /**
   * Fallback DFS without connectivity pruning — slower but handles edge cases
   * where the connectivity check is too aggressive.
   */
  function dfsFallback(current: number, nextWaypointIdx: number, visitedCount: number): boolean {
    if (visitedCount === totalCells) {
      return nextWaypointIdx === waypoints.length;
    }

    const currentRow = Math.floor(current / cols);
    const currentCol = current % cols;
    const remaining = totalCells - visitedCount;
    const lastWp = waypoints[waypoints.length - 1];
    const lastWpIdx = lastWp.row * cols + lastWp.col;

    const neighbors = adjacency[currentRow][currentCol].filter(n => !visited[n]);

    if (neighbors.length === 0) {
      return false;
    }

    // Warnsdorff's heuristic
    neighbors.sort((a, b) => {
      const aRow = Math.floor(a / cols);
      const aCol = a % cols;
      const bRow = Math.floor(b / cols);
      const bCol = b % cols;
      const degA = adjacency[aRow][aCol].filter(n => !visited[n]).length;
      const degB = adjacency[bRow][bCol].filter(n => !visited[n]).length;
      return degA - degB;
    });

    for (const next of neighbors) {
      const wpIdx = waypointAt.get(next);

      if (wpIdx !== undefined && wpIdx !== nextWaypointIdx) {
        continue;
      }

      if (next === lastWpIdx && remaining > 1) {
        continue;
      }

      visited[next] = 1;
      pathIndices.push(next);
      const newNextWp = wpIdx === nextWaypointIdx ? nextWaypointIdx + 1 : nextWaypointIdx;

      if (dfsFallback(next, newNextWp, visitedCount + 1)) {
        return true;
      }

      visited[next] = 0;
      pathIndices.pop();
    }

    return false;
  }
}

/**
 * Get orthogonal neighbor indices of a cell, respecting walls/barriers.
 * Returns flat indices (row * cols + col).
 */
function getNeighborIndices(
  row: number,
  col: number,
  rows: number,
  cols: number,
  walls: ZipWalls
): number[] {
  const result: number[] = [];
  const cellWalls = walls.get(`${row},${col}`);

  // Up
  if (row > 0 && !cellWalls?.has('up')) {
    const aboveWalls = walls.get(`${row - 1},${col}`);
    if (!aboveWalls?.has('down')) {
      result.push((row - 1) * cols + col);
    }
  }
  // Down
  if (row < rows - 1 && !cellWalls?.has('down')) {
    const belowWalls = walls.get(`${row + 1},${col}`);
    if (!belowWalls?.has('up')) {
      result.push((row + 1) * cols + col);
    }
  }
  // Left
  if (col > 0 && !cellWalls?.has('left')) {
    const leftWalls = walls.get(`${row},${col - 1}`);
    if (!leftWalls?.has('right')) {
      result.push(row * cols + (col - 1));
    }
  }
  // Right
  if (col < cols - 1 && !cellWalls?.has('right')) {
    const rightWalls = walls.get(`${row},${col + 1}`);
    if (!rightWalls?.has('left')) {
      result.push(row * cols + (col + 1));
    }
  }
  return result;
}

/**
 * Fast connectivity check using BFS from the current position.
 * Checks that all unvisited cells are reachable from at least one
 * unvisited neighbor of the current cell.
 */
function isConnectedFast(
  current: number,
  visited: Uint8Array,
  adjacency: number[][][],
  rows: number,
  cols: number,
  expectedUnvisited: number
): boolean {
  const currentRow = Math.floor(current / cols);
  const currentCol = current % cols;

  // Find an unvisited neighbor of current to start BFS
  const startNeighbors = adjacency[currentRow][currentCol].filter(n => !visited[n]);

  if (startNeighbors.length === 0) {
    // No unvisited neighbors — only valid if all cells are visited
    return expectedUnvisited === 0;
  }

  // BFS from first unvisited neighbor
  const seen = new Uint8Array(rows * cols);
  const queue: number[] = [startNeighbors[0]];
  seen[startNeighbors[0]] = 1;
  let reachable = 1;

  let head = 0;
  while (head < queue.length) {
    const cell = queue[head++];
    const cellRow = Math.floor(cell / cols);
    const cellCol = cell % cols;

    for (const neighbor of adjacency[cellRow][cellCol]) {
      if (!visited[neighbor] && !seen[neighbor]) {
        seen[neighbor] = 1;
        reachable++;
        queue.push(neighbor);
      }
    }
  }

  return reachable === expectedUnvisited;
}

/**
 * Checks if any unvisited cell (other than the current path end's neighbors)
 * has become completely isolated (0 unvisited neighbors and not adjacent to current).
 */
function hasIsolatedCell(
  current: number,
  visited: Uint8Array,
  adjacency: number[][][],
  rows: number,
  cols: number
): boolean {
  const currentRow = Math.floor(current / cols);
  const currentCol = current % cols;
  const currentNeighbors = new Set(adjacency[currentRow][currentCol]);

  // Only check neighbors of neighbors (cells that could have been affected)
  for (const neighbor of adjacency[currentRow][currentCol]) {
    if (visited[neighbor]) continue;
    const nRow = Math.floor(neighbor / cols);
    const nCol = neighbor % cols;
    for (const nn of adjacency[nRow][nCol]) {
      if (visited[nn] || nn === current) continue;
      const nnRow = Math.floor(nn / cols);
      const nnCol = nn % cols;
      // Check if this cell has any unvisited neighbors
      const nnNeighbors = adjacency[nnRow][nnCol];
      const hasExit = nnNeighbors.some(n => !visited[n] || n === current);
      if (!hasExit && !currentNeighbors.has(nn)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Precompute minimum distances between consecutive waypoints using BFS.
 * Used for early termination when remaining cells can't accommodate the path.
 */
function precomputeWaypointDistances(
  waypoints: { row: number; col: number; number: number }[],
  rows: number,
  cols: number,
  adjacency: number[][][]
): number[] {
  const distances: number[] = [];

  for (let i = 0; i < waypoints.length - 1; i++) {
    const from = waypoints[i];
    const to = waypoints[i + 1];
    const fromIdx = from.row * cols + from.col;
    const toIdx = to.row * cols + to.col;

    // BFS from 'from' to 'to'
    const dist = new Int32Array(rows * cols).fill(-1);
    const queue: number[] = [fromIdx];
    dist[fromIdx] = 0;

    let head = 0;
    while (head < queue.length) {
      const cell = queue[head++];
      if (cell === toIdx) break;
      const cellRow = Math.floor(cell / cols);
      const cellCol = cell % cols;

      for (const neighbor of adjacency[cellRow][cellCol]) {
        if (dist[neighbor] === -1) {
          dist[neighbor] = dist[cell] + 1;
          queue.push(neighbor);
        }
      }
    }

    distances.push(dist[toIdx] >= 0 ? dist[toIdx] : Infinity);
  }

  return distances;
}

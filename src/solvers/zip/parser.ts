import { Page, Frame } from 'playwright';
import { ZipCell, ZipBoard, ZipWalls } from '../../types';

/**
 * Parses the Zip game board from the LinkedIn Games DOM.
 * Does NOT interact with the game — only reads DOM state.
 */
export async function parseZipBoard(context: Page | Frame): Promise<ZipBoard> {
  const boardSelector = '.trail-grid, .grid-game-board, [data-trail-grid], [data-cell-idx]';

  try {
    await context.locator(boardSelector).first().waitFor({ state: 'visible', timeout: 8000 });
  } catch {
    throw new Error(
      'Could not find the Zip game board in the DOM. ' +
      'Expected an element matching: ' + boardSelector + '. ' +
      'Make sure the game is started and the board is visible.'
    );
  }

  // Allow board to fully render
  await new Promise(r => setTimeout(r, 500));

  // Extract everything in a single evaluate call — no further interaction needed
  const boardData = await context.evaluate(() => {
    let cells = document.querySelectorAll('[data-cell-idx]');
    if (cells.length === 0) {
      cells = document.querySelectorAll('.trail-cell');
    }

    if (cells.length === 0) {
      return { cells: [] as { idx: number; number: number | null }[], cols: 0, wallEdges: [] as { from: number; to: number }[], debug: '' };
    }

    // --- Determine grid columns ---
    const firstCell = cells[0];
    const parent = firstCell.parentElement;
    let cols = 0;

    if (parent) {
      const style = window.getComputedStyle(parent);
      const gridCols = style.getPropertyValue('grid-template-columns');
      if (gridCols) {
        cols = gridCols.split(/\s+/).filter((s: string) => s.trim().length > 0).length;
      }
    }

    if (cols === 0) {
      const rects: { idx: number; y: number }[] = [];
      for (let i = 0; i < cells.length; i++) {
        const rect = cells[i].getBoundingClientRect();
        const idx = parseInt(cells[i].getAttribute('data-cell-idx') || String(i), 10);
        rects.push({ idx, y: rect.y });
      }
      const firstY = rects[0].y;
      cols = rects.filter(r => Math.abs(r.y - firstY) < 5).length;
    }

    if (cols === 0) {
      cols = Math.round(Math.sqrt(cells.length));
    }

    const gridRows = Math.ceil(cells.length / cols);

    // --- Extract cell numbers ---
    const cellData: { idx: number; number: number | null }[] = [];
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const idx = parseInt(cell.getAttribute('data-cell-idx') ?? String(i), 10);
      cellData.push({ idx, number: getCellNumber(cell) });
    }

    // --- Detect walls ---
    // LinkedIn Zip renders walls via ::after pseudo-element on a nearly-full-size
    // (~57x57) absolutely-positioned child div. Thick borders on the pseudo = walls.
    const wallEdges: { from: number; to: number }[] = [];
    let wallsFound = 0;

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i] as HTMLElement;
      const idx = parseInt(cell.getAttribute('data-cell-idx') || String(i), 10);
      const row = Math.floor(idx / cols);
      const col = idx % cols;
      const cellRect = cell.getBoundingClientRect();

      // Find the wall container: absolute positioned, ~2px smaller than cell on each side
      for (let j = 0; j < cell.children.length; j++) {
        const child = cell.children[j] as HTMLElement;
        const rect = child.getBoundingClientRect();
        const style = window.getComputedStyle(child);

        if (style.position !== 'absolute') continue;
        // Wall container is inset ~1px from cell edges (57 vs 59)
        const widthDiff = cellRect.width - rect.width;
        if (widthDiff < 1 || widthDiff > 6) continue;
        const heightDiff = cellRect.height - rect.height;
        if (heightDiff < 1 || heightDiff > 6) continue;
        // Must not be the grid overlay (which has thin visible borders)
        const ownBorder = parseFloat(style.borderTopWidth) || 0;
        if (ownBorder > 0.5 && ownBorder <= 2) continue; // Grid overlay has 1px borders

        // Check ::after pseudo-element for wall borders
        const afterStyle = window.getComputedStyle(child, '::after');
        const bTop = parseFloat(afterStyle.borderTopWidth) || 0;
        const bRight = parseFloat(afterStyle.borderRightWidth) || 0;
        const bBottom = parseFloat(afterStyle.borderBottomWidth) || 0;
        const bLeft = parseFloat(afterStyle.borderLeftWidth) || 0;

        if (bTop > 2 && row > 0) {
          wallEdges.push({ from: idx, to: (row - 1) * cols + col });
          wallsFound++;
        }
        if (bBottom > 2 && row < gridRows - 1) {
          wallEdges.push({ from: idx, to: (row + 1) * cols + col });
          wallsFound++;
        }
        if (bLeft > 2 && col > 0) {
          wallEdges.push({ from: idx, to: row * cols + (col - 1) });
          wallsFound++;
        }
        if (bRight > 2 && col < cols - 1) {
          wallEdges.push({ from: idx, to: row * cols + (col + 1) });
          wallsFound++;
        }

        break; // One wall container per cell
      }
    }

    const debug = `walls=${wallsFound}`;
    return { cells: cellData, cols, wallEdges, debug };

    function getCellNumber(element: Element): number | null {
      const ariaLabel = element.getAttribute('aria-label') ?? '';
      const ariaMatch = ariaLabel.match(/Number\s+(\d+)/i);
      if (ariaMatch) return parseInt(ariaMatch[1], 10);
      // Fallback: any number in aria-label
      const numMatch = ariaLabel.match(/(\d+)/);
      if (numMatch) return parseInt(numMatch[1], 10);

      const dataValue = element.getAttribute('data-value') ?? element.getAttribute('data-number') ?? '';
      if (dataValue && /^\d+$/.test(dataValue.trim())) return parseInt(dataValue.trim(), 10);

      const contentEl = element.querySelector('[data-cell-content]');
      if (contentEl) {
        const text = (contentEl.textContent || '').trim();
        if (text && /^\d+$/.test(text)) return parseInt(text, 10);
      }

      const fullText = (element.textContent || '').trim();
      if (fullText && /^\d+$/.test(fullText)) return parseInt(fullText, 10);

      return null;
    }
  });

  if (!boardData || boardData.cells.length === 0) {
    throw new Error(
      'Could not find any cells in the Zip game board. ' +
      'No trail-cell elements found. The DOM structure may have changed.'
    );
  }

  const totalCells = boardData.cells.length;
  const cols = boardData.cols;
  const rows = Math.ceil(totalCells / cols);

  if (rows * cols !== totalCells) {
    throw new Error(
      `Inconsistent grid structure. Found ${totalCells} cells but grid is ${rows}x${cols} (${rows * cols} expected).`
    );
  }

  console.log(`   ${boardData.debug}`);

  // Build cells grid
  const sortedCells = [...boardData.cells].sort((a, b) => a.idx - b.idx);
  const cells: ZipCell[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: ZipCell[] = [];
    for (let c = 0; c < cols; c++) {
      const cellInfo = sortedCells[r * cols + c];
      row.push({ row: r, col: c, number: cellInfo ? cellInfo.number : null });
    }
    cells.push(row);
  }

  // Build numbered cells list
  const numberedCells: { row: number; col: number; number: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const num = cells[r][c].number;
      if (num !== null) {
        numberedCells.push({ row: r, col: c, number: num });
      }
    }
  }
  numberedCells.sort((a, b) => a.number - b.number);

  // Convert wall edges to ZipWalls map and ensure consistency
  const walls = edgesToWalls(boardData.wallEdges, cols);
  ensureWallConsistency(walls, rows, cols);

  return { rows, cols, cells, numberedCells, walls };
}

/**
 * Convert edge pairs to ZipWalls map.
 */
function edgesToWalls(edges: { from: number; to: number }[] | undefined | null, cols: number): ZipWalls {
  const walls: ZipWalls = new Map();
  if (!edges || !Array.isArray(edges)) return walls;

  for (const { from, to } of edges) {
    const fromRow = Math.floor(from / cols);
    const fromCol = from % cols;
    const toRow = Math.floor(to / cols);
    const toCol = to % cols;

    let dir: 'up' | 'down' | 'left' | 'right';
    if (toRow < fromRow) dir = 'up';
    else if (toRow > fromRow) dir = 'down';
    else if (toCol < fromCol) dir = 'left';
    else dir = 'right';

    const key = `${fromRow},${fromCol}`;
    if (!walls.has(key)) walls.set(key, new Set());
    walls.get(key)!.add(dir);
  }

  return walls;
}

/**
 * Ensures wall consistency: if A has wall toward B, B must have wall toward A.
 */
function ensureWallConsistency(walls: ZipWalls, rows: number, cols: number): void {
  const toAdd: [string, 'up' | 'down' | 'left' | 'right'][] = [];

  for (const [key, dirs] of walls) {
    const [r, c] = key.split(',').map(Number);
    for (const dir of dirs) {
      let nKey: string;
      let opp: 'up' | 'down' | 'left' | 'right';

      if (dir === 'right' && c < cols - 1) { nKey = `${r},${c + 1}`; opp = 'left'; }
      else if (dir === 'left' && c > 0) { nKey = `${r},${c - 1}`; opp = 'right'; }
      else if (dir === 'down' && r < rows - 1) { nKey = `${r + 1},${c}`; opp = 'up'; }
      else if (dir === 'up' && r > 0) { nKey = `${r - 1},${c}`; opp = 'down'; }
      else continue;

      toAdd.push([nKey!, opp!]);
    }
  }

  for (const [key, dir] of toAdd) {
    if (!walls.has(key)) walls.set(key, new Set());
    walls.get(key)!.add(dir);
  }
}

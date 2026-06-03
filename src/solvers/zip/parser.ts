import { Page, Frame } from 'playwright';
import { ZipCell, ZipBoard, ZipWalls } from '../../types';

/**
 * Parses the Zip game board from the LinkedIn Games DOM.
 * The game renders inside an iframe, so this accepts either a Page or Frame.
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

  // Extract grid dimensions, cell data, and wall data in a single evaluate call
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
      // Detect columns from bounding box positions
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
    // LinkedIn Zip renders walls via the ::after pseudo-element of a nearly-full-size
    // (57x57) absolutely-positioned div inside each cell. The pseudo-element has thick
    // borders (e.g., 12px) on the sides where walls exist.
    //
    // Cell DOM structure:
    // - child[0]: 59x59 grid overlay (thin 1px gray borders — NOT walls)
    // - child[?]: 36x36 static — number label (only on waypoint cells)
    // - child[?]: 37x37 absolute, data-testid="filled-cell" — path fill indicator
    // - child[?]: ~29x37 or 37x29 absolute — path connector (NOT a wall!)
    // - child[?]: 57x57 absolute — WALL CONTAINER (walls are on its ::after borders)

    const wallEdges: { from: number; to: number }[] = [];
    let debug = '';

    let wallsFound = 0;
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i] as HTMLElement;
      const idx = parseInt(cell.getAttribute('data-cell-idx') || String(i), 10);
      const row = Math.floor(idx / cols);
      const col = idx % cols;
      const cellRect = cell.getBoundingClientRect();

      // Find the wall container: ~57x57, absolute positioned, NOT the grid overlay
      for (let j = 0; j < cell.children.length; j++) {
        const child = cell.children[j] as HTMLElement;
        const rect = child.getBoundingClientRect();
        const style = window.getComputedStyle(child);
        
        if (style.position !== 'absolute') continue;
        // Wall container is slightly smaller than cell (57 vs 59), inset ~1px
        if (rect.width < cellRect.width - 5 || rect.width > cellRect.width - 1) continue;
        if (rect.height < cellRect.height - 5 || rect.height > cellRect.height - 1) continue;
        
        // Check the ::after pseudo-element for thick borders
        const afterStyle = window.getComputedStyle(child, '::after');
        if (afterStyle.content === 'none' && afterStyle.display === 'none') continue;
        
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
        
        break; // Only one wall container per cell
      }
    }

    debug += `pseudoWalls=${wallsFound}`;

    // Approach 2: If no walls from children, check cell borders for variation
    if (wallEdges.length === 0) {
      // Collect all border widths
      const borderData: { idx: number; t: number; r: number; b: number; l: number }[] = [];
      for (let i = 0; i < cells.length; i++) {
        const idx = parseInt(cells[i].getAttribute('data-cell-idx') || String(i), 10);
        const s = window.getComputedStyle(cells[i]);
        borderData.push({
          idx,
          t: parseFloat(s.borderTopWidth) || 0,
          r: parseFloat(s.borderRightWidth) || 0,
          b: parseFloat(s.borderBottomWidth) || 0,
          l: parseFloat(s.borderLeftWidth) || 0,
        });
      }

      // Find min border width (the "normal" grid line)
      const allW: number[] = [];
      for (const b of borderData) {
        if (b.t > 0) allW.push(b.t);
        if (b.r > 0) allW.push(b.r);
        if (b.b > 0) allW.push(b.b);
        if (b.l > 0) allW.push(b.l);
      }
      allW.sort((a, b) => a - b);
      const minWidth = allW.length > 0 ? allW[0] : 1;
      const maxWidth = allW.length > 0 ? allW[allW.length - 1] : 1;

      debug += `, borderRange=[${minWidth},${maxWidth}]`;

      // Only use border detection if there's meaningful variation (max > 1.8 * min)
      if (maxWidth > minWidth * 1.8 && minWidth > 0) {
        const threshold = minWidth * 1.8;
        for (const b of borderData) {
          const row = Math.floor(b.idx / cols);
          const col = b.idx % cols;
          if (b.t > threshold && row > 0) wallEdges.push({ from: b.idx, to: (row - 1) * cols + col });
          if (b.b > threshold && row < gridRows - 1) wallEdges.push({ from: b.idx, to: (row + 1) * cols + col });
          if (b.l > threshold && col > 0) wallEdges.push({ from: b.idx, to: row * cols + (col - 1) });
          if (b.r > threshold && col < cols - 1) wallEdges.push({ from: b.idx, to: row * cols + (col + 1) });
        }
        debug += `, borderWalls=${wallEdges.length}`;
      }
    }

    // Approach 3: Geometric gap detection
    if (wallEdges.length === 0) {
      // Build cellRects for geometric measurement
      const cellRects: (DOMRect | null)[] = new Array(cells.length).fill(null);
      for (let ci = 0; ci < cells.length; ci++) {
        const cidx = parseInt(cells[ci].getAttribute('data-cell-idx') || String(ci), 10);
        cellRects[cidx] = cells[ci].getBoundingClientRect();
      }

      const hGaps: number[] = [];
      const vGaps: number[] = [];
      const hGapData: { from: number; to: number; gap: number }[] = [];
      const vGapData: { from: number; to: number; gap: number }[] = [];

      for (let r = 0; r < gridRows; r++) {
        for (let c = 0; c < cols - 1; c++) {
          const leftIdx = r * cols + c;
          const rightIdx = r * cols + c + 1;
          const lr = cellRects[leftIdx];
          const rr = cellRects[rightIdx];
          if (lr && rr) {
            const gap = rr.left - lr.right;
            hGaps.push(gap);
            hGapData.push({ from: leftIdx, to: rightIdx, gap });
          }
        }
      }

      for (let r = 0; r < gridRows - 1; r++) {
        for (let c = 0; c < cols; c++) {
          const topIdx = r * cols + c;
          const botIdx = (r + 1) * cols + c;
          const tr = cellRects[topIdx];
          const br = cellRects[botIdx];
          if (tr && br) {
            const gap = br.top - tr.bottom;
            vGaps.push(gap);
            vGapData.push({ from: topIdx, to: botIdx, gap });
          }
        }
      }

      // Find walls: gaps significantly larger than the median
      const hMedian = median(hGaps);
      const vMedian = median(vGaps);
      const hThreshold = hMedian + Math.max(2, hMedian * 0.8);
      const vThreshold = vMedian + Math.max(2, vMedian * 0.8);

      for (const { from, to, gap } of hGapData) {
        if (gap > hThreshold) wallEdges.push({ from, to });
      }
      for (const { from, to, gap } of vGapData) {
        if (gap > vThreshold) wallEdges.push({ from, to });
      }

      debug += `, geoWalls=${wallEdges.length}(hMed=${hMedian.toFixed(1)},vMed=${vMedian.toFixed(1)})`;
    }

    return { cells: cellData, cols, wallEdges, debug };

    function getCellNumber(element: Element): number | null {
      const ariaLabel = element.getAttribute('aria-label') ?? '';
      const ariaMatch = ariaLabel.match(/(\d+)/);
      if (ariaMatch) return parseInt(ariaMatch[1], 10);

      const dataValue = element.getAttribute('data-value') ?? element.getAttribute('data-number') ?? '';
      if (dataValue && /^\d+$/.test(dataValue.trim())) return parseInt(dataValue.trim(), 10);

      // Check text content — but only direct text or dedicated content elements
      const contentEl = element.querySelector('[data-cell-content]');
      if (contentEl) {
        const text = (contentEl.textContent || '').trim();
        if (text && /^\d+$/.test(text)) return parseInt(text, 10);
      }

      const fullText = (element.textContent || '').trim();
      if (fullText && /^\d+$/.test(fullText)) return parseInt(fullText, 10);

      return null;
    }

    function isDark(color: string | null): boolean {
      if (!color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)') return false;
      const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!m) return false;
      return (0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3]) < 60;
    }

    function median(arr: number[]): number {
      if (arr.length === 0) return 0;
      const s = [...arr].sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
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
      `Inconsistent grid structure. Found ${totalCells} cells but grid is ${rows}x${cols} (${rows * cols} expected). ` +
      'The Zip board must have a consistent rectangular grid.'
    );
  }

  console.log(`   Wall detection: ${boardData.debug || 'n/a'}`);

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

  // Convert wall edges to ZipWalls map
  let walls = edgesToWalls(boardData.wallEdges, cols);

  // If no walls found from DOM, dump DOM for debugging then try pixel-sampling
  if (walls.size === 0) {
    // Dump DOM structure to understand what we're dealing with
    const domDebug = await context.evaluate(() => {
      const cells = document.querySelectorAll('[data-cell-idx]');
      if (cells.length === 0) return 'No cells';
      
      const cell = cells[0];
      const parent = cell.parentElement;
      let info = '';
      
      info += `Cell0 tag=${cell.tagName} class="${cell.className}"\n`;
      info += `Cell0 outerHTML (200 chars): ${cell.outerHTML.substring(0, 200)}\n`;
      info += `Cell0 children: ${cell.children.length}\n`;
      
      for (let i = 0; i < Math.min(cell.children.length, 5); i++) {
        const child = cell.children[i];
        const rect = child.getBoundingClientRect();
        const style = window.getComputedStyle(child);
        info += `  child[${i}]: tag=${child.tagName} class="${child.className}" `
          + `size=${rect.width.toFixed(0)}x${rect.height.toFixed(0)} `
          + `bg=${style.backgroundColor} pos=${style.position}\n`;
      }
      
      if (parent) {
        info += `Parent tag=${parent.tagName} class="${parent.className}"\n`;
        info += `Parent children: ${parent.children.length} (cells=${cells.length})\n`;
        
        // Show non-cell siblings
        let nonCellCount = 0;
        for (let i = 0; i < parent.children.length && nonCellCount < 5; i++) {
          const sib = parent.children[i];
          if (!sib.hasAttribute('data-cell-idx') && !sib.classList.contains('trail-cell')) {
            const rect = sib.getBoundingClientRect();
            const style = window.getComputedStyle(sib);
            info += `  sibling[${i}]: tag=${sib.tagName} class="${sib.className}" `
              + `size=${rect.width.toFixed(0)}x${rect.height.toFixed(0)} `
              + `bg=${style.backgroundColor} pos=${style.position}\n`;
            nonCellCount++;
          }
        }
      }

      // Check a cell that should have a wall (e.g., look for cells with more children)
      let maxChildren = 0;
      let maxChildCell = -1;
      for (let i = 0; i < cells.length; i++) {
        if (cells[i].children.length > maxChildren) {
          maxChildren = cells[i].children.length;
          maxChildCell = i;
        }
      }
      if (maxChildCell >= 0 && maxChildren > 0) {
        const mc = cells[maxChildCell];
        info += `\nCell with most children (idx=${mc.getAttribute('data-cell-idx')}, ${maxChildren} children):\n`;
        info += `  outerHTML (400 chars): ${mc.outerHTML.substring(0, 400)}\n`;
      }
      
      return info;
    });
    console.log('   DOM dump:\n' + domDebug);

    console.log('   No walls from DOM. Trying pixel sampling...');
    try {
      walls = await detectWallsByPixelSampling(context, rows, cols);
    } catch { /* ignore */ }
  }

  // Last resort: probe walls by gameplay
  if (walls.size === 0) {
    console.log('   No walls from pixels. Probing game...');
    try {
      walls = await probeWallsByGameplay(context, rows, cols);
    } catch { /* ignore */ }
  }

  // Ensure consistency
  ensureWallConsistency(walls, rows, cols);

  // Validate: no cell should be completely isolated (walls on all 4 sides)
  walls = validateAndFixWalls(walls, rows, cols);

  console.log(`   Parsed: ${rows}x${cols} grid, ${numberedCells.length} waypoints, ${walls.size} cells with walls`);

  return { rows, cols, cells, numberedCells, walls };
}

/**
 * Convert edge pairs {from, to} to the ZipWalls map format.
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
 * Validates walls and removes any that would make cells completely unreachable.
 * A cell surrounded on all 4 sides by walls is clearly a detection error.
 */
function validateAndFixWalls(walls: ZipWalls, rows: number, cols: number): ZipWalls {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const key = `${r},${c}`;
      const cellWalls = walls.get(key);
      if (!cellWalls) continue;

      // Count how many directions are actually possible (not at grid edge)
      let possibleDirs = 0;
      let blockedDirs = 0;
      
      if (r > 0) { possibleDirs++; if (cellWalls.has('up')) blockedDirs++; }
      if (r < rows - 1) { possibleDirs++; if (cellWalls.has('down')) blockedDirs++; }
      if (c > 0) { possibleDirs++; if (cellWalls.has('left')) blockedDirs++; }
      if (c < cols - 1) { possibleDirs++; if (cellWalls.has('right')) blockedDirs++; }

      // If all possible directions are blocked, this is clearly wrong
      // Remove all walls from this cell (it's a false positive)
      if (blockedDirs >= possibleDirs && possibleDirs > 0) {
        console.log(`   ⚠️  Removing invalid walls at (${r},${c}) — cell would be isolated`);
        walls.delete(key);
      }
    }
  }

  return walls;
}

/**
 * Detects walls by sampling rendered pixels between adjacent cells.
 */
async function detectWallsByPixelSampling(context: Page | Frame, rows: number, cols: number): Promise<ZipWalls> {
  const edges = await context.evaluate((params: { rows: number; cols: number }) => {
    const { rows: gridRows, cols: gridCols } = params;
    let cells = document.querySelectorAll('[data-cell-idx]');
    if (cells.length === 0) cells = document.querySelectorAll('.trail-cell');
    if (cells.length === 0) return [] as { from: number; to: number }[];

    const rects: (DOMRect | null)[] = new Array(cells.length).fill(null);
    for (let i = 0; i < cells.length; i++) {
      const idx = parseInt(cells[i].getAttribute('data-cell-idx') || String(i), 10);
      rects[idx] = cells[i].getBoundingClientRect();
    }

    const result: { from: number; to: number }[] = [];

    // Sample horizontal edges
    for (let r = 0; r < gridRows; r++) {
      for (let c = 0; c < gridCols - 1; c++) {
        const li = r * gridCols + c;
        const ri = r * gridCols + c + 1;
        const lr = rects[li];
        const rr = rects[ri];
        if (!lr || !rr) continue;

        const midX = (lr.right + rr.left) / 2;
        const midY = (lr.top + lr.bottom) / 2;
        const el = document.elementFromPoint(midX, midY);
        if (el && isWallElement(el)) {
          result.push({ from: li, to: ri });
        }
      }
    }

    // Sample vertical edges
    for (let r = 0; r < gridRows - 1; r++) {
      for (let c = 0; c < gridCols; c++) {
        const ti = r * gridCols + c;
        const bi = (r + 1) * gridCols + c;
        const tr = rects[ti];
        const br = rects[bi];
        if (!tr || !br) continue;

        const midX = (tr.left + tr.right) / 2;
        const midY = (tr.bottom + br.top) / 2;
        const el = document.elementFromPoint(midX, midY);
        if (el && isWallElement(el)) {
          result.push({ from: ti, to: bi });
        }
      }
    }

    return result;

    function isWallElement(el: Element): boolean {
      const style = window.getComputedStyle(el);
      const bg = style.backgroundColor;
      if (!bg || bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') return false;
      const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!m) return false;
      const lum = 0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3];
      return lum < 60;
    }
  }, { rows, cols });

  if (!edges || !Array.isArray(edges)) return new Map();
  const walls = edgesToWalls(edges, cols);
  ensureWallConsistency(walls, rows, cols);
  return walls;
}

/**
 * Probes walls by pressing arrow keys from each cell and checking if movement occurs.
 * Most reliable but slowest approach.
 */
async function probeWallsByGameplay(context: Page | Frame, rows: number, cols: number): Promise<ZipWalls> {
  const walls: ZipWalls = new Map();
  const probed = new Set<string>();

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cellIdx = r * cols + c;
      const cellSelector = `[data-cell-idx="${cellIdx}"]`;

      try {
        await context.locator(cellSelector).first().click();
        await new Promise(resolve => setTimeout(resolve, 80));
      } catch { continue; }

      const directions: [string, number, number, string][] = [
        ['ArrowRight', 0, 1, 'right'],
        ['ArrowDown', 1, 0, 'down'],
      ];

      for (const [key, dr, dc, dirName] of directions) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= rows || nc >= cols) continue;

        const edgeKey = `${r},${c}->${nr},${nc}`;
        if (probed.has(edgeKey)) continue;
        probed.add(edgeKey);

        const expectedIdx = nr * cols + nc;

        await context.locator(cellSelector).first().press(key);
        await new Promise(resolve => setTimeout(resolve, 80));

        const activeIdx = await context.evaluate(() => {
          const active = document.querySelector(
            '[data-cell-idx].trail-cell--active, [data-cell-idx][aria-selected="true"], [data-cell-idx]:focus'
          );
          if (active) return parseInt(active.getAttribute('data-cell-idx') || '-1', 10);
          const cells = document.querySelectorAll('[data-cell-idx]');
          for (const cell of cells) {
            const cls = cell.getAttribute('class') || '';
            if (cls.includes('active') || cls.includes('selected') || cls.includes('current')) {
              return parseInt(cell.getAttribute('data-cell-idx') || '-1', 10);
            }
          }
          return -1;
        });

        if (activeIdx !== expectedIdx) {
          // Wall found
          const k1 = `${r},${c}`;
          if (!walls.has(k1)) walls.set(k1, new Set());
          walls.get(k1)!.add(dirName as 'right' | 'down');

          const opposites: Record<string, 'up' | 'left'> = { 'right': 'left', 'down': 'up' };
          const k2 = `${nr},${nc}`;
          if (!walls.has(k2)) walls.set(k2, new Set());
          walls.get(k2)!.add(opposites[dirName]);
        } else {
          // Move was accepted — undo it
          try {
            await context.locator(cellSelector).first().press('Control+z');
            await new Promise(resolve => setTimeout(resolve, 50));
          } catch { /* continue */ }
        }
      }
    }
  }

  // Reset board
  try {
    const undoBtn = context.locator('button:has-text("Undo"), [aria-label="Undo"]').first();
    for (let i = 0; i < rows * cols; i++) {
      try { await undoBtn.click(); await new Promise(r => setTimeout(r, 20)); } catch { break; }
    }
  } catch { /* ignore */ }

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

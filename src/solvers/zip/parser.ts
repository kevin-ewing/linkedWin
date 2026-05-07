import { Page, Frame } from 'playwright';
import { ZipCell, ZipBoard, ZipWalls } from '../../types';

/**
 * Parses the Zip game board from the LinkedIn Games DOM.
 * The game renders inside an iframe, so this accepts either a Page or Frame.
 *
 * LinkedIn Zip DOM structure:
 * - Board container: .trail-grid or .grid-game-board
 * - Cells: .trail-cell with data-cell-idx attribute
 * - Numbered cells contain a span/div with the number text
 * - Grid dimensions determined from CSS grid or cell count
 */
export async function parseZipBoard(context: Page | Frame): Promise<ZipBoard> {
  // Wait for the board to be visible
  const boardSelector = '.trail-grid, .grid-game-board, [data-trail-grid], [data-cell-idx]';

  try {
    await context.locator(boardSelector).first().waitFor({ state: 'visible', timeout: 5000 });
  } catch {
    throw new Error(
      'Could not find the Zip game board in the DOM. ' +
      'Expected an element matching: ' + boardSelector + '. ' +
      'Make sure the game is started and the board is visible.'
    );
  }

  // Extract grid dimensions and cell data from the DOM
  const cellData = await context.evaluate(() => {
    // Find cells by data-cell-idx (works for both iframe and direct-render DOM)
    let cells = document.querySelectorAll('[data-cell-idx]');
    
    // Fallback to .trail-cell if data-cell-idx not found
    if (cells.length === 0) {
      cells = document.querySelectorAll('.trail-cell');
    }

    if (cells.length === 0) {
      return { cells: [] as { idx: number; number: number | null }[], cols: 0 };
    }

    // Determine grid columns from CSS grid on the parent
    const firstCell = cells[0];
    const parent = firstCell.parentElement;
    let cols = 0;

    if (parent) {
      const style = window.getComputedStyle(parent);
      const gridCols = style.getPropertyValue('grid-template-columns');
      if (gridCols) {
        // Count the number of column tracks
        cols = gridCols.split(/\s+/).filter((s: string) => s.trim().length > 0).length;
      }
    }

    // Fallback: assume square grid
    if (cols === 0) {
      cols = Math.round(Math.sqrt(cells.length));
    }

    // Extract cell data
    const result: { idx: number; number: number | null }[] = [];

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const idx = parseInt(cell.getAttribute('data-cell-idx') ?? String(i), 10);
      const num = getCellNumber(cell);
      result.push({ idx, number: num });
    }

    return { cells: result, cols };

    function getCellNumber(element: Element): number | null {
      // The simplest approach: get the full text content of the cell
      // and check if it's a number. LinkedIn Zip cells contain just the number
      // or are empty. Border child elements don't have text content.
      const fullText = (element.textContent || '').trim();
      if (fullText && /^\d+$/.test(fullText)) {
        return parseInt(fullText, 10);
      }

      // Check aria-label
      const ariaLabel = element.getAttribute('aria-label') ?? '';
      const ariaMatch = ariaLabel.match(/(\d+)/);
      if (ariaMatch) return parseInt(ariaMatch[1], 10);

      // Check data attributes
      const dataValue = element.getAttribute('data-value') ??
        element.getAttribute('data-number') ?? '';
      if (dataValue && /^\d+$/.test(dataValue.trim())) {
        return parseInt(dataValue.trim(), 10);
      }

      return null;
    }
  });

  if (!cellData || cellData.cells.length === 0) {
    throw new Error(
      'Could not find any cells in the Zip game board. ' +
      'No trail-cell elements found. The DOM structure may have changed.'
    );
  }

  const totalCells = cellData.cells.length;
  const cols = cellData.cols;
  const rows = Math.ceil(totalCells / cols);

  if (rows * cols !== totalCells) {
    throw new Error(
      `Inconsistent grid structure. Found ${totalCells} cells but grid is ${rows}x${cols} (${rows * cols} expected). ` +
      'The Zip board must have a consistent rectangular grid.'
    );
  }

  // Sort cells by their index and build the grid
  const sortedCells = [...cellData.cells].sort((a, b) => a.idx - b.idx);

  const cells: ZipCell[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: ZipCell[] = [];
    for (let c = 0; c < cols; c++) {
      const cellInfo = sortedCells[r * cols + c];
      row.push({
        row: r,
        col: c,
        number: cellInfo ? cellInfo.number : null,
      });
    }
    cells.push(row);
  }

  // Build the numbered cells list sorted by number
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

  // Extract walls/barriers between cells
  const walls = await extractWalls(context, cols);

  return { rows, cols, cells, numberedCells, walls };
}

/**
 * Extracts wall/barrier data from the DOM.
 * Supports both old DOM (.trail-cell-wall with direction classes) and
 * new DOM (overlay divs that come in pairs on adjacent cells).
 */
async function extractWalls(context: Page | Frame, cols: number): Promise<ZipWalls> {
  const wallData = await context.evaluate((gridCols: number) => {
    let cells = document.querySelectorAll('[data-cell-idx]');
    if (cells.length === 0) {
      cells = document.querySelectorAll('.trail-cell');
    }
    const result: { cellIdx: number; directions: string[] }[] = [];

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const idx = parseInt(cell.getAttribute('data-cell-idx') || String(i), 10);
      const directions: string[] = [];

      // Strategy 1: Old DOM — .trail-cell-wall elements with direction classes
      const wallEls = cell.querySelectorAll('[class*="wall"]');
      for (const w of wallEls) {
        const cls = w.getAttribute('class') || '';
        if (cls.includes('--down') && !cls.includes('down-right') && !cls.includes('down-left')) directions.push('down');
        if (cls.includes('--right') && !cls.includes('down-right') && !cls.includes('top-right')) directions.push('right');
        if (cls.includes('--left') && !cls.includes('down-left') && !cls.includes('top-left')) directions.push('left');
        if (cls.includes('--up') && !cls.includes('up-right') && !cls.includes('up-left')) directions.push('up');
      }

      // Strategy 2: New DOM — overlay divs (non-content, absolute positioned)
      // These are wall indicators. We detect them by finding divs that are NOT
      // the content div and NOT the border div, and are absolutely positioned.
      if (directions.length === 0) {
        const childDivs = cell.querySelectorAll(':scope > div:not([data-cell-content])');
        for (const div of childDivs) {
          const style = window.getComputedStyle(div);
          if (style.position === 'absolute') {
            // This is a wall overlay. Determine direction by checking
            // which border is thick/visible (the wall side)
            const borderRight = parseFloat(style.borderRightWidth) || 0;
            const borderLeft = parseFloat(style.borderLeftWidth) || 0;
            const borderTop = parseFloat(style.borderTopWidth) || 0;
            const borderBottom = parseFloat(style.borderBottomWidth) || 0;

            if (borderRight > 2) directions.push('right');
            if (borderLeft > 2) directions.push('left');
            if (borderTop > 2) directions.push('up');
            if (borderBottom > 2) directions.push('down');
          }
        }
      }

      if (directions.length > 0) {
        result.push({ cellIdx: idx, directions });
      }
    }

    return result;
  }, cols);

  // Convert to ZipWalls map
  const walls: ZipWalls = new Map();

  for (const { cellIdx, directions } of wallData) {
    const row = Math.floor(cellIdx / cols);
    const col = cellIdx % cols;
    const key = `${row},${col}`;

    if (!walls.has(key)) {
      walls.set(key, new Set());
    }
    const dirSet = walls.get(key)!;
    for (const d of directions) {
      dirSet.add(d as 'up' | 'down' | 'left' | 'right');
    }
  }

  return walls;
}

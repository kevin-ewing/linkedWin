import { Page, Frame } from 'playwright';
import { TangoCell, TangoConstraint, TangoBoard } from '../../types';

/**
 * Parses the Tango game board from the LinkedIn Games DOM.
 * The game renders inside an iframe with class "lotka-board".
 *
 * LinkedIn Tango DOM structure:
 * - Board: .lotka-board > .lotka-grid
 * - Cells: .lotka-cell with data-cell-idx, aria-describedby for position
 * - Cell values: SVG inside cell with aria-label="Empty"|"Sun"|"Moon"
 * - Pre-filled: .lotka-cell--locked class
 * - Constraints: SVG elements with aria-label="Equal"|"Cross" positioned
 *   inside cells, indicating a constraint with an adjacent cell
 */
export async function parseTangoBoard(page: Page | Frame): Promise<TangoBoard> {
  // Wait for the board to be visible
  const boardSelector = '.lotka-board, .lotka-grid';
  try {
    await page.locator(boardSelector).first().waitFor({ state: 'visible', timeout: 5000 });
  } catch {
    throw new Error(
      'Could not find the Tango game board in the DOM. ' +
      'Expected an element matching: ' + boardSelector + '. ' +
      'Make sure the game is started and the board is visible.'
    );
  }

  // Extract all cell and constraint data in a single evaluate call
  const boardData = await page.evaluate(() => {
    const cells = document.querySelectorAll('.lotka-cell');
    if (cells.length === 0) {
      return { cells: [] as any[], constraints: [] as any[], size: 0 };
    }

    // Determine grid size (always square)
    const size = Math.round(Math.sqrt(cells.length));

    const cellData: { idx: number; value: 'sun' | 'moon' | null; locked: boolean }[] = [];
    const constraints: { cellIdx: number; type: 'equal' | 'opposite'; direction: 'right' | 'down' }[] = [];

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const idx = parseInt(cell.getAttribute('data-cell-idx') || String(i), 10);
      const cls = cell.getAttribute('class') || '';
      const locked = cls.includes('--locked');

      // Get cell value from SVG aria-label
      const contentSvg = cell.querySelector('svg.lotka-cell-content-img, svg[aria-label="Sun"], svg[aria-label="Moon"], svg[aria-label="Empty"]');
      let value: 'sun' | 'moon' | null = null;
      if (contentSvg) {
        const aria = contentSvg.getAttribute('aria-label') || '';
        if (aria === 'Sun') value = 'sun';
        else if (aria === 'Moon') value = 'moon';
      }

      cellData.push({ idx, value, locked });

      // Look for constraint SVGs inside this cell
      // Constraints are SVGs with aria-label="Equal" or "Cross" that indicate
      // a relationship with an adjacent cell
      const constraintSvgs = cell.querySelectorAll('svg[aria-label="Equal"], svg[aria-label="Cross"]');
      for (const svg of constraintSvgs) {
        const aria = svg.getAttribute('aria-label') || '';
        const type: 'equal' | 'opposite' = aria === 'Equal' ? 'equal' : 'opposite';

        // Determine direction based on the constraint SVG's position/class
        // The constraint is between this cell and an adjacent one.
        // We need to figure out if it's to the right or below.
        // Check the parent wrapper's class for direction hints
        const parent = svg.parentElement;
        const parentCls = parent?.getAttribute('class') || '';

        let direction: 'right' | 'down' = 'right'; // default

        if (parentCls.includes('bottom') || parentCls.includes('down') || parentCls.includes('vertical')) {
          direction = 'down';
        } else if (parentCls.includes('right') || parentCls.includes('horizontal')) {
          direction = 'right';
        } else {
          // Heuristic: check SVG position relative to cell center
          const cellRect = cell.getBoundingClientRect();
          const svgRect = svg.getBoundingClientRect();
          const svgCenterX = svgRect.x + svgRect.width / 2;
          const svgCenterY = svgRect.y + svgRect.height / 2;
          const cellCenterX = cellRect.x + cellRect.width / 2;
          const cellCenterY = cellRect.y + cellRect.height / 2;

          // If SVG is more to the right of cell center, it's a right constraint
          // If SVG is more below cell center, it's a down constraint
          const dx = svgCenterX - cellCenterX;
          const dy = svgCenterY - cellCenterY;

          if (Math.abs(dy) > Math.abs(dx)) {
            direction = dy > 0 ? 'down' : 'down'; // below = down constraint
          } else {
            direction = 'right';
          }
        }

        constraints.push({ cellIdx: idx, type, direction });
      }
    }

    return { cells: cellData, constraints, size };
  });

  if (boardData.size === 0 || boardData.cells.length === 0) {
    throw new Error(
      'Could not determine grid dimensions. No cell elements found.'
    );
  }

  const size = boardData.size;

  // Validate square grid
  if (size * size !== boardData.cells.length) {
    throw new Error(
      `Grid is not square. Found ${boardData.cells.length} cells, expected ${size}x${size}=${size * size}.`
    );
  }

  // Build TangoCell grid
  const sortedCells = [...boardData.cells].sort((a, b) => a.idx - b.idx);
  const cells: TangoCell[][] = [];
  for (let r = 0; r < size; r++) {
    const row: TangoCell[] = [];
    for (let c = 0; c < size; c++) {
      const cellInfo = sortedCells[r * size + c];
      row.push({
        row: r,
        col: c,
        value: cellInfo.value,
      });
    }
    cells.push(row);
  }

  // Build constraints
  const tangoConstraints: TangoConstraint[] = [];
  for (const c of boardData.constraints) {
    const row = Math.floor(c.cellIdx / size);
    const col = c.cellIdx % size;

    let cell2Row = row;
    let cell2Col = col;
    if (c.direction === 'right' && col < size - 1) {
      cell2Col = col + 1;
    } else if (c.direction === 'down' && row < size - 1) {
      cell2Row = row + 1;
    } else {
      continue; // Skip invalid constraints at edges
    }

    tangoConstraints.push({
      cell1: { row, col },
      cell2: { row: cell2Row, col: cell2Col },
      type: c.type,
    });
  }

  return { size, cells, constraints: tangoConstraints };
}

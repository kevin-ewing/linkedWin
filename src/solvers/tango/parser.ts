import { Page, Frame } from 'playwright';
import { TangoCell, TangoConstraint, TangoBoard } from '../../types';

/**
 * Parses the Tango game board from the LinkedIn Games DOM.
 * Supports both:
 * - Old iframe DOM: .lotka-cell, SVG aria-labels for values/constraints
 * - New direct-render DOM: [data-cell-idx], data-cell-content, aria-label
 */
export async function parseTangoBoard(page: Page | Frame): Promise<TangoBoard> {
  // Wait for the board to be visible — try multiple selectors
  const boardSelector = '.lotka-board, .lotka-grid, [data-cell-idx]';
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
    // Try new DOM first ([data-cell-idx]), then old DOM (.lotka-cell)
    let cells = document.querySelectorAll('[data-cell-idx]');
    const isNewDom = cells.length > 0 && !cells[0].classList.contains('lotka-cell');

    if (cells.length === 0) {
      cells = document.querySelectorAll('.lotka-cell');
    }

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
      const locked = cls.includes('--locked') || cls.includes('locked');

      let value: 'sun' | 'moon' | null = null;

      if (isNewDom) {
        // New DOM: check aria-label on cell or child content elements
        const contentEl = cell.querySelector('[data-cell-content]');
        if (contentEl) {
          const aria = (contentEl.getAttribute('aria-label') || '').toLowerCase();
          const text = (contentEl.textContent || '').trim().toLowerCase();
          if (aria.includes('sun') || text.includes('sun') || text === '☀') value = 'sun';
          else if (aria.includes('moon') || text.includes('moon') || text === '🌙') value = 'moon';
        }
        // Also check SVGs with aria-label
        if (!value) {
          const svg = cell.querySelector('svg[aria-label]');
          if (svg) {
            const aria = svg.getAttribute('aria-label') || '';
            if (aria === 'Sun') value = 'sun';
            else if (aria === 'Moon') value = 'moon';
          }
        }
        // Check cell's own aria-label
        if (!value) {
          const cellAria = (cell.getAttribute('aria-label') || '').toLowerCase();
          if (cellAria.includes('sun')) value = 'sun';
          else if (cellAria.includes('moon')) value = 'moon';
        }
      } else {
        // Old DOM: SVG with aria-label inside .lotka-cell
        const contentSvg = cell.querySelector('svg[aria-label="Sun"], svg[aria-label="Moon"]');
        if (contentSvg) {
          const aria = contentSvg.getAttribute('aria-label') || '';
          if (aria === 'Sun') value = 'sun';
          else if (aria === 'Moon') value = 'moon';
        }
      }

      cellData.push({ idx, value, locked });

      // Look for constraint indicators
      if (isNewDom) {
        // New DOM: constraints may be SVGs or elements with aria-label "Equal"/"Cross"
        // or child elements with specific content
        const constraintEls = cell.querySelectorAll(
          'svg[aria-label="Equal"], svg[aria-label="Cross"], ' +
          '[aria-label="Equal"], [aria-label="Cross"], ' +
          '[data-constraint]'
        );
        for (const el of constraintEls) {
          const aria = (el.getAttribute('aria-label') || el.getAttribute('data-constraint') || '').toLowerCase();
          let type: 'equal' | 'opposite';
          if (aria.includes('equal') || aria.includes('same')) type = 'equal';
          else if (aria.includes('cross') || aria.includes('opposite') || aria.includes('x')) type = 'opposite';
          else continue;

          // Determine direction by position
          const cellRect = cell.getBoundingClientRect();
          const elRect = el.getBoundingClientRect();
          const dx = (elRect.x + elRect.width / 2) - (cellRect.x + cellRect.width / 2);
          const dy = (elRect.y + elRect.height / 2) - (cellRect.y + cellRect.height / 2);

          const direction: 'right' | 'down' = Math.abs(dy) > Math.abs(dx) ? 'down' : 'right';
          constraints.push({ cellIdx: idx, type, direction });
        }
      } else {
        // Old DOM: SVGs with aria-label="Equal" or "Cross"
        const constraintSvgs = cell.querySelectorAll('svg[aria-label="Equal"], svg[aria-label="Cross"]');
        for (const svg of constraintSvgs) {
          const aria = svg.getAttribute('aria-label') || '';
          const type: 'equal' | 'opposite' = aria === 'Equal' ? 'equal' : 'opposite';

          const cellRect = cell.getBoundingClientRect();
          const svgRect = svg.getBoundingClientRect();
          const dx = (svgRect.x + svgRect.width / 2) - (cellRect.x + cellRect.width / 2);
          const dy = (svgRect.y + svgRect.height / 2) - (cellRect.y + cellRect.height / 2);

          const direction: 'right' | 'down' = Math.abs(dy) > Math.abs(dx) ? 'down' : 'right';
          constraints.push({ cellIdx: idx, type, direction });
        }
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

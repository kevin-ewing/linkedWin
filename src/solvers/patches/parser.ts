import { Page, Frame } from 'playwright';
import { PatchesBoard, PatchClue, PatchShape } from '../../types';

/**
 * Parses the Patches game board from the LinkedIn DOM.
 * Cells use [data-cell-idx] with aria-labels describing clues.
 */
export async function parsePatchesBoard(page: Page | Frame): Promise<PatchesBoard> {
  const boardSelector = '[data-cell-idx]';
  try {
    await page.locator(boardSelector).first().waitFor({ state: 'visible', timeout: 5000 });
  } catch {
    throw new Error('Could not find the Patches game board. Make sure the game is started.');
  }

  const boardData = await page.evaluate(() => {
    const cells = document.querySelectorAll('[data-cell-idx]');
    if (cells.length === 0) return { totalCells: 0, cols: 0, clues: [] as any[] };

    // Determine grid columns
    const parent = cells[0].parentElement;
    let cols = 0;
    if (parent) {
      const style = window.getComputedStyle(parent);
      const gridCols = style.getPropertyValue('grid-template-columns');
      if (gridCols) {
        cols = gridCols.split(/\s+/).filter((s: string) => s.trim().length > 0).length;
      }
    }
    if (cols === 0) cols = Math.round(Math.sqrt(cells.length));

    const clues: { row: number; col: number; color: string; shape: string; size: number | null }[] = [];

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const aria = cell.getAttribute('aria-label') || '';
      if (!aria.includes('clue')) continue;

      const idx = parseInt(cell.getAttribute('data-cell-idx') || String(i), 10);
      const row = Math.floor(idx / cols);
      const col = idx % cols;

      // Extract color
      const style = cell.getAttribute('style') || '';
      const colorMatch = style.match(/--b4f45042:\s*([^;]+)/);
      const color = colorMatch ? colorMatch[1].trim() : '';

      // Extract shape
      let shape = 'freeform';
      if (aria.includes('wide rectangle')) shape = 'wide_rectangle';
      else if (aria.includes('tall rectangle')) shape = 'tall_rectangle';
      else if (aria.includes('square')) shape = 'square';

      // Extract size
      const sizeMatch = aria.match(/(\d+)\s*cells/);
      const size = sizeMatch ? parseInt(sizeMatch[1]) : null;

      clues.push({ row, col, color, shape, size });
    }

    return { totalCells: cells.length, cols, clues };
  });

  if (boardData.totalCells === 0) {
    throw new Error('No cells found in the Patches board.');
  }

  const cols = boardData.cols;
  const rows = Math.ceil(boardData.totalCells / cols);

  const clues: PatchClue[] = boardData.clues.map(c => ({
    row: c.row,
    col: c.col,
    color: c.color,
    shape: c.shape as PatchShape,
    size: c.size,
  }));

  return { rows, cols, clues };
}

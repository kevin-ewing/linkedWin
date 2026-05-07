import { Page, Frame } from 'playwright';
import { TangoCell, TangoBoard } from '../types';

/** Default delay between move actions in milliseconds */
const DEFAULT_MOVE_DELAY_MS = 50;

/** Maximum number of retry attempts per interaction */
const MAX_RETRIES = 3;

/**
 * Retries an async interaction up to MAX_RETRIES times.
 * Logs retry attempts and waits briefly between retries.
 */
async function withRetry<T>(
  action: () => Promise<T>,
  description: string,
  delayMs: number = DEFAULT_MOVE_DELAY_MS
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await action();
    } catch (error) {
      if (attempt < MAX_RETRIES) {
        console.log(`Retry attempt ${attempt} for ${description}`);
        await delay(delayMs);
      } else {
        throw new Error(
          `Failed after ${MAX_RETRIES} attempts for ${description}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }
  // Unreachable, but satisfies TypeScript
  throw new Error(`Failed after ${MAX_RETRIES} attempts for ${description}`);
}

/**
 * Waits for the specified number of milliseconds.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executes Tango moves by clicking empty cells to cycle them to the target symbol.
 *
 * Cell cycling order: empty → sun → moon → empty
 * - Click once for sun
 * - Click twice for moon
 *
 * @param page - Playwright page instance (or Frame for iframe games)
 * @param solution - The solved board with all cells filled
 * @param original - The original board (to identify which cells were empty)
 * @param context - Frame or Page where the game cells live
 * @param moveDelayMs - Delay between move actions (default 0 for max speed)
 */
export async function executeTangoMoves(
  page: Page,
  solution: TangoCell[][],
  original: TangoBoard,
  context?: Page | Frame,
  moveDelayMs: number = 0
): Promise<void> {
  const target = context || page;
  const size = original.size;

  // Build list of moves needed
  const moves: { cellIdx: number; clicks: number }[] = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (original.cells[row][col].value !== null) continue;
      const targetValue = solution[row][col].value;
      if (targetValue === null) continue;
      moves.push({
        cellIdx: row * size + col,
        clicks: targetValue === 'sun' ? 1 : 2,
      });
    }
  }

  console.log(`Executing ${moves.length} cell moves...`);

  if (moves.length === 0) {
    console.log(`Done: nothing to fill`);
    return;
  }

  // Wait once for the first cell to confirm board is ready
  const firstSelector = `[data-cell-idx="${moves[0].cellIdx}"]`;
  await target.locator(firstSelector).first().waitFor({ state: 'visible', timeout: 3000 });

  // Click all cells as fast as possible — no delays, no per-cell waitFor
  for (const move of moves) {
    const cellSelector = `[data-cell-idx="${move.cellIdx}"]`;
    const cell = target.locator(cellSelector).first();
    for (let i = 0; i < move.clicks; i++) {
      await cell.click();
    }
  }

  console.log(`Done: ${moves.length} cells filled`);
}

/**
 * Executes Zip moves using keyboard arrow keys via Playwright's locator.press().
 * This sends key events directly to the focused element in the correct frame.
 *
 * @param page - Playwright page instance
 * @param path - Ordered list of cells representing the solution path
 * @param cols - Number of columns in the grid (for computing cell index)
 * @param context - Frame or Page where the game cells live
 * @param moveDelayMs - Small delay every few keys for game to process (default 10ms)
 */
export async function executeZipMoves(
  page: Page,
  path: { row: number; col: number }[],
  cols: number = 7,
  context?: Page | Frame,
  moveDelayMs: number = 10
): Promise<void> {
  if (path.length === 0) {
    return;
  }

  const target = context || page;

  await withRetry(async () => {
    // Click the first cell to start the path
    const startCell = path[0];
    const startIdx = startCell.row * cols + startCell.col;
    const startSelector = `[data-cell-idx="${startIdx}"]`;
    const startEl = target.locator(startSelector).first();
    await startEl.waitFor({ state: 'visible', timeout: 3000 });
    await startEl.click();
    await delay(200); // Let the game fully register the starting cell

    console.log(`Started at cell (${startCell.row}, ${startCell.col}), sending ${path.length - 1} arrow keys...`);

    // Send arrow keys using locator.press() on the clicked cell
    // This ensures events go to the right element in the right frame
    for (let i = 1; i < path.length; i++) {
      const prev = path[i - 1];
      const curr = path[i];
      const dr = curr.row - prev.row;
      const dc = curr.col - prev.col;

      let key: string;
      if (dr === -1) key = 'ArrowUp';
      else if (dr === 1) key = 'ArrowDown';
      else if (dc === -1) key = 'ArrowLeft';
      else key = 'ArrowRight';

      await startEl.press(key);

      // Small delay every few keys to let the game process
      if (moveDelayMs > 0 && i % 5 === 0) {
        await delay(moveDelayMs);
      }
    }

    console.log(`Path complete: ${path.length} cells traced`);
  }, 'zip arrow key path', 100);
}

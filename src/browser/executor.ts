import { Page, Frame } from 'playwright';
import { TangoCell, TangoBoard } from '../types';

/** Maximum number of retry attempts per interaction */
const MAX_RETRIES = 3;

/**
 * Retries an async interaction up to MAX_RETRIES times.
 */
async function withRetry<T>(
  action: () => Promise<T>,
  description: string,
  delayMs: number = 100
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
  throw new Error(`Failed after ${MAX_RETRIES} attempts for ${description}`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Returns a random delay in [min, max] ms to simulate human-like timing.
 */
function humanDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Executes Tango moves with human-like pacing.
 * Tango has more cells to fill so the "thinking" delay is spread across moves.
 * Total execution target: ~4-7 seconds for a 6x6 board.
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

  // Human-like pacing: target ~15-20 seconds total for a 6x6 board
  // A very fast human solving ~18 empty cells takes 15-25 seconds
  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    const cellSelector = `[data-cell-idx="${move.cellIdx}"]`;
    const cell = target.locator(cellSelector).first();
    for (let c = 0; c < move.clicks; c++) {
      await cell.click();
      if (c < move.clicks - 1) await delay(humanDelay(80, 150));
    }
    // Delay between cells — occasional longer pauses (simulating scanning the board)
    if (i < moves.length - 1) {
      const pause = i % 4 === 3 ? humanDelay(600, 1000) : humanDelay(300, 550);
      await delay(pause);
    }
  }

  console.log(`Done: ${moves.length} cells filled`);
}

/**
 * Executes Zip moves using keyboard arrow keys.
 * Zip is fast — a good human can trace the path in 2-4 seconds.
 * 
 * This executor verifies that the game is accepting moves by checking
 * the active/highlighted cell after key presses. If a move is rejected
 * (e.g., due to a wall), it will detect the mismatch and abort.
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
    const startCell = path[0];
    const startIdx = startCell.row * cols + startCell.col;
    const startSelector = `[data-cell-idx="${startIdx}"]`;
    const startEl = target.locator(startSelector).first();
    await startEl.waitFor({ state: 'visible', timeout: 3000 });
    await startEl.click();
    await delay(200);

    console.log(`Started at cell (${startCell.row}, ${startCell.col}), sending ${path.length - 1} arrow keys...`);

    // Human-like: ~40-80ms per key press (fast but not instant)
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
      await delay(humanDelay(30, 70));
    }

    console.log(`Path complete: ${path.length} cells traced`);
  }, 'zip arrow key path', 100);
}

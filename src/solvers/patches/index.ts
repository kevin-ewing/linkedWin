import { connectToBrowser, findGameTab, clickStartGame, getGameFrame } from '../../browser/connect';
import { parsePatchesBoard } from './parser';
import { solvePatches } from './solver';
import { executePatchesMoves } from './executor';

async function main() {
  const startTime = Date.now();
  let stage = 'initialization';
  let browser: Awaited<ReturnType<typeof connectToBrowser>> | null = null;

  try {
    stage = 'connecting to browser';
    console.log('🔌 Connecting to browser...');
    browser = await connectToBrowser();
    const page = await findGameTab(browser, 'patches' as any);

    stage = 'starting game';
    console.log('▶️  Starting game...');
    await clickStartGame(page);

    const gameFrame = getGameFrame(page);
    const context = gameFrame || page;

    stage = 'parsing board';
    console.log('📋 Parsing board...');
    const board = await parsePatchesBoard(context);
    console.log(`   Board: ${board.rows}x${board.cols}, ${board.clues.length} clues`);
    for (const c of board.clues) {
      console.log(`   Clue (${c.row},${c.col}): ${c.shape}${c.size ? ' ' + c.size + ' cells' : ''} [${c.color}]`);
    }

    stage = 'solving';
    console.log('🧠 Solving...');
    const solution = solvePatches(board);
    if (!solution) {
      throw new Error('No solution found for the given Patches board');
    }
    console.log(`   Solution: ${solution.length} patches`);

    stage = 'executing moves';
    console.log('🎮 Executing moves...');
    await executePatchesMoves(page, solution, board.cols, gameFrame || undefined);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Done! Completed in ${elapsed}s`);
  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ Failed during ${stage} (${elapsed}s): ${message}`);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

main();

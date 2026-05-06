import { connectToBrowser, findGameTab, clickStartGame, getGameFrame } from '../../browser/connect';
import { executeTangoMoves } from '../../browser/executor';
import { parseTangoBoard } from './parser';
import { solveTango } from './solver';

async function main() {
  const startTime = Date.now();
  let stage = 'initialization';
  let browser: Awaited<ReturnType<typeof connectToBrowser>> | null = null;

  try {
    stage = 'connecting to browser';
    console.log('🔌 Connecting to browser...');
    browser = await connectToBrowser();
    const page = await findGameTab(browser, 'tango');

    stage = 'starting game';
    console.log('▶️  Starting game...');
    await clickStartGame(page);

    // The game renders inside an iframe
    const gameFrame = getGameFrame(page);
    const context = gameFrame || page;

    stage = 'parsing board';
    console.log('📋 Parsing board...');
    const board = await parseTangoBoard(context);
    console.log(`   Board: ${board.size}x${board.size}, ${board.constraints.length} constraints`);

    stage = 'solving';
    console.log('🧠 Solving...');
    const solution = solveTango(board);
    if (!solution) {
      throw new Error('No solution found for the given Tango board');
    }

    stage = 'executing moves';
    console.log('🎮 Executing moves...');
    await executeTangoMoves(page, solution, board, gameFrame || undefined);

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

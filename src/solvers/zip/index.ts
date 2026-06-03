import { connectToBrowser, findGameTab, clickStartGame, getGameFrame } from '../../browser/connect';
import { executeZipMoves } from '../../browser/executor';
import { parseZipBoard } from './parser';
import { solveZip } from './solver';

async function main() {
  const startTime = Date.now();
  let stage = 'initialization';
  let browser: Awaited<ReturnType<typeof connectToBrowser>> | null = null;

  try {
    stage = 'connecting to browser';
    console.log('🔌 Connecting to browser...');
    browser = await connectToBrowser();
    const page = await findGameTab(browser, 'zip');

    stage = 'starting game';
    console.log('▶️  Starting game...');
    await clickStartGame(page);

    // The game renders inside an iframe
    const gameFrame = getGameFrame(page);
    const context = gameFrame || page;

    stage = 'parsing board';
    console.log('📋 Parsing board...');
    const board = await parseZipBoard(context);
    console.log(`   Board: ${board.rows}x${board.cols}, ${board.numberedCells.length} waypoints, ${board.walls.size} cells with walls`);

    for (const wp of board.numberedCells) {
      console.log(`   Waypoint ${wp.number}: (${wp.row}, ${wp.col})`);
    }

    stage = 'solving';
    console.log('🧠 Solving...');
    const path = solveZip(board);
    if (!path) {
      throw new Error('No solution found for the given Zip board');
    }
    console.log(`   Solution: ${path.length} cells`);

    // Validate: print solution path with waypoint verification
    const waypointPositions = new Map(board.numberedCells.map(w => [`${w.row},${w.col}`, w.number]));
    let lastWp = 0;
    for (let i = 0; i < path.length; i++) {
      const key = `${path[i].row},${path[i].col}`;
      const wp = waypointPositions.get(key);
      if (wp !== undefined) {
        if (wp !== lastWp + 1) {
          console.error(`   ❌ INVALID: Hit waypoint ${wp} at step ${i} but expected ${lastWp + 1}`);
        }
        lastWp = wp;
        console.log(`   Step ${i}: (${path[i].row},${path[i].col}) = waypoint ${wp} ✓`);
      }
    }

    stage = 'executing moves';
    console.log('🎮 Executing moves...');
    await executeZipMoves(page, path, board.cols, gameFrame || undefined);

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

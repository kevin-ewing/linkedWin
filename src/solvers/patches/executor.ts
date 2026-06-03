import { Page, Frame } from 'playwright';
import { PatchRect } from '../../types';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function humanDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Executes Patches moves by dragging from one corner of each rectangle
 * to the opposite corner. Human-like pacing: ~300-600ms per patch.
 * A fast human solving 8 patches takes 3-5 seconds.
 */
export async function executePatchesMoves(
  page: Page,
  solution: PatchRect[],
  cols: number,
  context?: Page | Frame
): Promise<void> {
  const target = context || page;

  console.log(`Executing ${solution.length} patch placements...`);

  // Wait for board to be ready
  await target.locator('[data-cell-idx="0"]').first().waitFor({ state: 'visible', timeout: 3000 });

  for (let i = 0; i < solution.length; i++) {
    const rect = solution[i];

    const topLeftIdx = rect.top * cols + rect.left;
    const bottomRightIdx = rect.bottom * cols + rect.right;

    const topLeftEl = target.locator(`[data-cell-idx="${topLeftIdx}"]`).first();
    const bottomRightEl = target.locator(`[data-cell-idx="${bottomRightIdx}"]`).first();

    const tlBox = await topLeftEl.boundingBox();
    const brBox = await bottomRightEl.boundingBox();

    if (!tlBox || !brBox) {
      throw new Error(`Could not get bounding box for patch (${rect.top},${rect.left})-(${rect.bottom},${rect.right})`);
    }

    const startX = tlBox.x + tlBox.width / 2;
    const startY = tlBox.y + tlBox.height / 2;
    const endX = brBox.x + brBox.width / 2;
    const endY = brBox.y + brBox.height / 2;

    await page.mouse.move(startX, startY);
    await delay(humanDelay(50, 100));
    await page.mouse.down();
    await page.mouse.move(endX, endY, { steps: 8 });
    await delay(humanDelay(30, 60));
    await page.mouse.up();

    // Pause between patches — simulates looking at the next one
    if (i < solution.length - 1) {
      await delay(humanDelay(250, 500));
    }
  }

  console.log(`Done: ${solution.length} patches placed`);
}

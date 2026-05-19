import { Page, Frame } from 'playwright';
import { PatchRect } from '../../types';

/**
 * Executes Patches moves by dragging from one corner of each rectangle
 * to the opposite corner, covering the clue cell.
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

  for (const rect of solution) {
    // Get bounding boxes of the top-left and bottom-right cells
    const topLeftIdx = rect.top * cols + rect.left;
    const bottomRightIdx = rect.bottom * cols + rect.right;

    const topLeftEl = target.locator(`[data-cell-idx="${topLeftIdx}"]`).first();
    const bottomRightEl = target.locator(`[data-cell-idx="${bottomRightIdx}"]`).first();

    const tlBox = await topLeftEl.boundingBox();
    const brBox = await bottomRightEl.boundingBox();

    if (!tlBox || !brBox) {
      throw new Error(`Could not get bounding box for patch (${rect.top},${rect.left})-(${rect.bottom},${rect.right})`);
    }

    // Drag from top-left corner to bottom-right corner
    const startX = tlBox.x + tlBox.width / 2;
    const startY = tlBox.y + tlBox.height / 2;
    const endX = brBox.x + brBox.width / 2;
    const endY = brBox.y + brBox.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY, { steps: 10 });
    await page.mouse.up();

    // Small delay between patches
    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`Done: ${solution.length} patches placed`);
}

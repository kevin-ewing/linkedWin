import { chromium, Browser, Page, Frame } from 'playwright';

const CDP_ENDPOINT = 'http://localhost:9222';

/**
 * Connects to an existing Chrome instance via CDP (Chrome DevTools Protocol).
 * Chrome must be launched with --remote-debugging-port=9222.
 */
export async function connectToBrowser(): Promise<Browser> {
  try {
    const browser = await chromium.connectOverCDP(CDP_ENDPOINT);
    return browser;
  } catch (error) {
    throw new Error(
      'Could not connect to Chrome. Please launch Chrome with remote debugging enabled:\n\n' +
      'On macOS:\n' +
      '  /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug\n\n' +
      'On Linux:\n' +
      '  google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug\n\n' +
      'Notes:\n' +
      '  - --user-data-dir is required (Chrome won\'t enable debugging with the default profile)\n' +
      '  - Close all other Chrome instances first, or use a unique data dir\n' +
      '  - You\'ll need to log into LinkedIn in this session'
    );
  }
}

/**
 * Finds the browser tab containing the LinkedIn game by URL pattern.
 * For Tango: URL contains 'linkedin.com' and 'tango'
 * For Zip: URL contains 'linkedin.com' and 'zip'
 */
export async function findGameTab(browser: Browser, gameType: 'tango' | 'zip'): Promise<Page> {
  const contexts = browser.contexts();

  for (const context of contexts) {
    const pages = context.pages();
    for (const page of pages) {
      const url = page.url().toLowerCase();
      if (url.includes('linkedin.com') && url.includes(gameType)) {
        return page;
      }
    }
  }

  throw new Error(
    `Could not find a LinkedIn ${gameType} game tab.\n` +
    `Please navigate to the LinkedIn ${gameType.charAt(0).toUpperCase() + gameType.slice(1)} game page in Chrome before running the solver.`
  );
}

/**
 * Clicks the "Start Game" button if visible, then waits for the game board to appear.
 * If no start button is found, assumes the game is already in progress.
 * Searches both the main page and the game iframe.
 */
export async function clickStartGame(page: Page): Promise<void> {
  const frame = getGameFrame(page);
  const target = frame || page;

  try {
    const startButton = target.locator('button:has-text("Start"), [role="button"]:has-text("Start")').first();
    await startButton.waitFor({ state: 'visible', timeout: 3000 });
    await startButton.click();

    // Wait for the game board to become visible after clicking start
    await target.locator('[class*="board"], [class*="grid"], [class*="trail-grid"]').first().waitFor({
      state: 'visible',
      timeout: 5000,
    });
  } catch {
    // If start button not found or already clicked, assume game is already started
  }
}

/**
 * Gets the game iframe Frame from the page.
 * LinkedIn games render inside an iframe with URL containing 'games/view'.
 * Returns the Frame if found, or null if the game is rendered directly on the page.
 */
export function getGameFrame(page: Page): Frame | null {
  const frames = page.frames();
  const gameFrame = frames.find(f => f.url().includes('games/view'));
  return gameFrame || null;
}

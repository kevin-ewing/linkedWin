import { describe, it, expect, vi, beforeEach } from 'vitest';
import { connectToBrowser, findGameTab, clickStartGame } from './connect';

// Mock playwright
vi.mock('playwright', () => ({
  chromium: {
    connectOverCDP: vi.fn(),
  },
}));

import { chromium } from 'playwright';

describe('connectToBrowser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return a browser instance on successful connection', async () => {
    const mockBrowser = { contexts: vi.fn() };
    vi.mocked(chromium.connectOverCDP).mockResolvedValue(mockBrowser as any);

    const browser = await connectToBrowser();
    expect(browser).toBe(mockBrowser);
    expect(chromium.connectOverCDP).toHaveBeenCalledWith('http://localhost:9222');
  });

  it('should throw a user-friendly error when connection fails', async () => {
    vi.mocked(chromium.connectOverCDP).mockRejectedValue(new Error('Connection refused'));

    await expect(connectToBrowser()).rejects.toThrow('Could not connect to Chrome');
    await expect(connectToBrowser()).rejects.toThrow('--remote-debugging-port=9222');
  });
});

describe('findGameTab', () => {
  it('should find a tango game tab by URL', async () => {
    const mockPage = { url: () => 'https://www.linkedin.com/games/tango' };
    const mockBrowser = {
      contexts: () => [
        {
          pages: () => [mockPage],
        },
      ],
    };

    const page = await findGameTab(mockBrowser as any, 'tango');
    expect(page).toBe(mockPage);
  });

  it('should find a zip game tab by URL', async () => {
    const mockPage = { url: () => 'https://www.linkedin.com/games/zip' };
    const mockBrowser = {
      contexts: () => [
        {
          pages: () => [mockPage],
        },
      ],
    };

    const page = await findGameTab(mockBrowser as any, 'zip');
    expect(page).toBe(mockPage);
  });

  it('should search across multiple contexts and pages', async () => {
    const otherPage = { url: () => 'https://www.google.com' };
    const gamePage = { url: () => 'https://www.linkedin.com/games/tango' };
    const mockBrowser = {
      contexts: () => [
        { pages: () => [otherPage] },
        { pages: () => [gamePage] },
      ],
    };

    const page = await findGameTab(mockBrowser as any, 'tango');
    expect(page).toBe(gamePage);
  });

  it('should throw an error when no matching tab is found', async () => {
    const mockBrowser = {
      contexts: () => [
        {
          pages: () => [{ url: () => 'https://www.google.com' }],
        },
      ],
    };

    await expect(findGameTab(mockBrowser as any, 'tango')).rejects.toThrow(
      'Could not find a LinkedIn tango game tab'
    );
  });

  it('should throw an error with instructions when no tab found', async () => {
    const mockBrowser = {
      contexts: () => [],
    };

    await expect(findGameTab(mockBrowser as any, 'zip')).rejects.toThrow(
      'Please navigate to the LinkedIn Zip game page'
    );
  });

  it('should match URLs case-insensitively', async () => {
    const mockPage = { url: () => 'https://www.LinkedIn.com/games/Tango' };
    const mockBrowser = {
      contexts: () => [
        { pages: () => [mockPage] },
      ],
    };

    const page = await findGameTab(mockBrowser as any, 'tango');
    expect(page).toBe(mockPage);
  });
});

describe('clickStartGame', () => {
  it('should click the start button when visible', async () => {
    const mockClick = vi.fn();
    const mockWaitFor = vi.fn().mockResolvedValue(undefined);
    const mockLocator = {
      first: () => ({
        waitFor: mockWaitFor,
        click: mockClick,
      }),
    };
    const mockPage = {
      locator: vi.fn().mockReturnValue(mockLocator),
      waitForSelector: vi.fn().mockResolvedValue(undefined),
      frames: () => [],
    };

    await clickStartGame(mockPage as any);
    expect(mockClick).toHaveBeenCalled();
  });

  it('should not throw when start button is not found (game already started)', async () => {
    const mockWaitFor = vi.fn().mockRejectedValue(new Error('Timeout'));
    const mockLocator = {
      first: () => ({
        waitFor: mockWaitFor,
        click: vi.fn(),
      }),
    };
    const mockPage = {
      locator: vi.fn().mockReturnValue(mockLocator),
      waitForSelector: vi.fn().mockResolvedValue(undefined),
      frames: () => [],
    };

    // Should not throw - assumes game is already started
    await expect(clickStartGame(mockPage as any)).resolves.toBeUndefined();
  });
});

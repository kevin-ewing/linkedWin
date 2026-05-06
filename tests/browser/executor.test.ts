import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeTangoMoves, executeZipMoves } from '../../src/browser/executor';
import { TangoBoard, TangoCell } from '../../src/types';

// Mock Playwright Page
function createMockPage() {
  const clickFn = vi.fn().mockResolvedValue(undefined);
  const waitForFn = vi.fn().mockResolvedValue(undefined);
  const boundingBoxFn = vi.fn().mockResolvedValue({ x: 0, y: 0, width: 50, height: 50 });

  const locatorMock = {
    first: vi.fn().mockReturnThis(),
    click: clickFn,
    waitFor: waitForFn,
    boundingBox: boundingBoxFn,
  };

  const page = {
    locator: vi.fn().mockReturnValue(locatorMock),
    mouse: {
      move: vi.fn().mockResolvedValue(undefined),
      down: vi.fn().mockResolvedValue(undefined),
      up: vi.fn().mockResolvedValue(undefined),
    },
  };

  return { page, locatorMock, clickFn, waitForFn, boundingBoxFn };
}

describe('executeTangoMoves', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should click empty cells the correct number of times for sun (1 click)', async () => {
    const { page, clickFn } = createMockPage();

    const original: TangoBoard = {
      size: 2,
      cells: [
        [{ row: 0, col: 0, value: null }, { row: 0, col: 1, value: 'moon' }],
        [{ row: 1, col: 0, value: 'sun' }, { row: 1, col: 1, value: null }],
      ],
      constraints: [],
    };

    const solution: TangoCell[][] = [
      [{ row: 0, col: 0, value: 'sun' }, { row: 0, col: 1, value: 'moon' }],
      [{ row: 1, col: 0, value: 'sun' }, { row: 1, col: 1, value: 'moon' }],
    ];

    await executeTangoMoves(page as any, solution, original, undefined, 0);

    // Cell (0,0) needs sun = 1 click, cell (1,1) needs moon = 2 clicks
    // Total clicks: 1 + 2 = 3
    expect(clickFn).toHaveBeenCalledTimes(3);
  });

  it('should click empty cells twice for moon', async () => {
    const { page, clickFn } = createMockPage();

    const original: TangoBoard = {
      size: 1,
      cells: [[{ row: 0, col: 0, value: null }]],
      constraints: [],
    };

    const solution: TangoCell[][] = [
      [{ row: 0, col: 0, value: 'moon' }],
    ];

    await executeTangoMoves(page as any, solution, original, undefined, 0);

    // Moon requires 2 clicks
    expect(clickFn).toHaveBeenCalledTimes(2);
  });

  it('should skip pre-filled cells', async () => {
    const { page, clickFn } = createMockPage();

    const original: TangoBoard = {
      size: 2,
      cells: [
        [{ row: 0, col: 0, value: 'sun' }, { row: 0, col: 1, value: 'moon' }],
        [{ row: 1, col: 0, value: 'moon' }, { row: 1, col: 1, value: 'sun' }],
      ],
      constraints: [],
    };

    const solution: TangoCell[][] = [
      [{ row: 0, col: 0, value: 'sun' }, { row: 0, col: 1, value: 'moon' }],
      [{ row: 1, col: 0, value: 'moon' }, { row: 1, col: 1, value: 'sun' }],
    ];

    await executeTangoMoves(page as any, solution, original, undefined, 0);

    // All cells are pre-filled, no clicks needed
    expect(clickFn).not.toHaveBeenCalled();
  });

  it('should log execution summary', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { page } = createMockPage();

    const original: TangoBoard = {
      size: 2,
      cells: [
        [{ row: 0, col: 0, value: null }, { row: 0, col: 1, value: 'moon' }],
        [{ row: 1, col: 0, value: 'sun' }, { row: 1, col: 1, value: null }],
      ],
      constraints: [],
    };

    const solution: TangoCell[][] = [
      [{ row: 0, col: 0, value: 'sun' }, { row: 0, col: 1, value: 'moon' }],
      [{ row: 1, col: 0, value: 'sun' }, { row: 1, col: 1, value: 'moon' }],
    ];

    await executeTangoMoves(page as any, solution, original, undefined, 0);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Executing 2 cell moves')
    );

    consoleSpy.mockRestore();
  });
});

describe('executeZipMoves', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should click start cell and send arrow keys', async () => {
    const pressFn = vi.fn().mockResolvedValue(undefined);
    const clickFn = vi.fn().mockResolvedValue(undefined);
    const waitForFn = vi.fn().mockResolvedValue(undefined);

    const locatorMock = {
      first: vi.fn().mockReturnThis(),
      click: clickFn,
      waitFor: waitForFn,
      press: pressFn,
    };

    const page = {
      locator: vi.fn().mockReturnValue(locatorMock),
      keyboard: { press: vi.fn().mockResolvedValue(undefined) },
    };

    const path = [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 1 },
    ];

    await executeZipMoves(page as any, path, 3, undefined, 0);

    // Start cell clicked
    expect(clickFn).toHaveBeenCalledTimes(1);
    // 2 arrow keys sent via press
    expect(pressFn).toHaveBeenCalledTimes(2);
    expect(pressFn).toHaveBeenCalledWith('ArrowRight');
    expect(pressFn).toHaveBeenCalledWith('ArrowDown');
  });

  it('should handle empty path gracefully', async () => {
    const { page } = createMockPage();

    await executeZipMoves(page as any, [], 7, undefined, 0);

    expect(page.mouse.down).not.toHaveBeenCalled();
  });

  it('should log start message', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const pressFn = vi.fn().mockResolvedValue(undefined);
    const clickFn = vi.fn().mockResolvedValue(undefined);
    const waitForFn = vi.fn().mockResolvedValue(undefined);

    const locatorMock = {
      first: vi.fn().mockReturnThis(),
      click: clickFn,
      waitFor: waitForFn,
      press: pressFn,
    };

    const page = {
      locator: vi.fn().mockReturnValue(locatorMock),
      keyboard: { press: vi.fn().mockResolvedValue(undefined) },
    };

    const path = [
      { row: 0, col: 0 },
      { row: 1, col: 0 },
    ];

    await executeZipMoves(page as any, path, 3, undefined, 0);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Started at cell (0, 0)')
    );

    consoleSpy.mockRestore();
  });

  it('should retry on failure and succeed', async () => {
    const waitForFn = vi.fn()
      .mockRejectedValueOnce(new Error('Element not visible'))
      .mockResolvedValue(undefined);
    const clickFn = vi.fn().mockResolvedValue(undefined);
    const pressFn = vi.fn().mockResolvedValue(undefined);

    const locatorMock = {
      first: vi.fn().mockReturnThis(),
      click: clickFn,
      waitFor: waitForFn,
      press: pressFn,
    };

    const page = {
      locator: vi.fn().mockReturnValue(locatorMock),
      keyboard: { press: vi.fn().mockResolvedValue(undefined) },
    };

    const path = [{ row: 0, col: 0 }, { row: 0, col: 1 }];

    await executeZipMoves(page as any, path, 3, undefined, 0);

    expect(clickFn).toHaveBeenCalled();
  });

  it('should throw after 3 failed attempts', async () => {
    const waitForFn = vi.fn().mockRejectedValue(new Error('Element not visible'));

    const locatorMock = {
      first: vi.fn().mockReturnThis(),
      click: vi.fn().mockResolvedValue(undefined),
      waitFor: waitForFn,
      press: vi.fn().mockResolvedValue(undefined),
    };

    const page = {
      locator: vi.fn().mockReturnValue(locatorMock),
      keyboard: { press: vi.fn().mockResolvedValue(undefined) },
    };

    const path = [{ row: 0, col: 0 }, { row: 0, col: 1 }];

    await expect(executeZipMoves(page as any, path, 3, undefined, 0))
      .rejects.toThrow('Failed after 3 attempts');
  });
});

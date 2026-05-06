import { describe, it, expect, vi } from 'vitest';
import { parseZipBoard } from '../../src/solvers/zip/parser';
import type { Page, Frame } from 'playwright';

/**
 * Creates a mock Playwright Page/Frame object that simulates the LinkedIn Zip DOM.
 * The new parser uses:
 * - context.locator(selector).first().waitFor() to find the board
 * - context.evaluate() to extract cell data from .trail-cell elements
 */
function createMockContext(options: {
  boardExists?: boolean;
  cells?: { number: number | null }[][];
}): Page | Frame {
  const { boardExists = true, cells = [] } = options;

  const rows = cells.length;
  const cols = rows > 0 ? cells[0].length : 0;
  const totalCells = rows * cols;

  // Build flat cell data as the parser expects from evaluate()
  const flatCells: { idx: number; number: number | null }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      flatCells.push({ idx: r * cols + c, number: cells[r][c].number });
    }
  }

  const waitForMock = boardExists
    ? vi.fn().mockResolvedValue(undefined)
    : vi.fn().mockRejectedValue(new Error('Timeout'));

  const locatorMock = {
    first: vi.fn().mockReturnValue({
      waitFor: waitForMock,
    }),
  };

  let evaluateCallCount = 0;
  const mockContext = {
    locator: vi.fn().mockReturnValue(locatorMock),
    evaluate: vi.fn().mockImplementation(async (fn: Function, ...args: any[]) => {
      evaluateCallCount++;
      // First call: extractCells, Second call: extractWalls
      if (evaluateCallCount % 2 === 1) {
        if (totalCells === 0) {
          return { cells: [], cols: 0 };
        }
        return { cells: flatCells, cols };
      } else {
        // Return empty walls
        return [];
      }
    }),
  } as unknown as Page;

  return mockContext;
}

/**
 * Creates a mock that returns inconsistent row lengths (for error testing).
 */
function createInconsistentMock(): Page | Frame {
  const waitForMock = vi.fn().mockResolvedValue(undefined);
  const locatorMock = {
    first: vi.fn().mockReturnValue({ waitFor: waitForMock }),
  };

  let callCount = 0;
  // 7 cells with cols=3 -> 3*3=9 != 7, so it should error
  const mockContext = {
    locator: vi.fn().mockReturnValue(locatorMock),
    evaluate: vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          cells: [
            { idx: 0, number: null },
            { idx: 1, number: null },
            { idx: 2, number: null },
            { idx: 3, number: null },
            { idx: 4, number: null },
            { idx: 5, number: null },
            { idx: 6, number: null },
          ],
          cols: 3,
        };
      }
      return [];
    }),
  } as unknown as Page;

  return mockContext;
}

describe('parseZipBoard', () => {
  describe('5.1 - Grid dimensions extraction', () => {
    it('should extract a 5x5 grid', async () => {
      const cells = Array.from({ length: 5 }, () =>
        Array.from({ length: 5 }, () => ({ number: null as number | null }))
      );

      const ctx = createMockContext({ boardExists: true, cells });
      const board = await parseZipBoard(ctx);

      expect(board.rows).toBe(5);
      expect(board.cols).toBe(5);
      expect(board.cells.length).toBe(5);
      expect(board.cells[0].length).toBe(5);
    });

    it('should extract a 7x7 grid', async () => {
      const cells = Array.from({ length: 7 }, () =>
        Array.from({ length: 7 }, () => ({ number: null as number | null }))
      );

      const ctx = createMockContext({ boardExists: true, cells });
      const board = await parseZipBoard(ctx);

      expect(board.rows).toBe(7);
      expect(board.cols).toBe(7);
    });

    it('should extract a non-square 4x6 grid', async () => {
      const cells = Array.from({ length: 4 }, () =>
        Array.from({ length: 6 }, () => ({ number: null as number | null }))
      );

      const ctx = createMockContext({ boardExists: true, cells });
      const board = await parseZipBoard(ctx);

      expect(board.rows).toBe(4);
      expect(board.cols).toBe(6);
    });
  });

  describe('5.2 - Numbered cells parsing', () => {
    it('should parse numbered cells from a grid', async () => {
      const cells: { number: number | null }[][] = [
        [{ number: 1 }, { number: null }, { number: null }],
        [{ number: null }, { number: null }, { number: null }],
        [{ number: null }, { number: null }, { number: 9 }],
      ];

      const ctx = createMockContext({ boardExists: true, cells });
      const board = await parseZipBoard(ctx);

      expect(board.cells[0][0].number).toBe(1);
      expect(board.cells[2][2].number).toBe(9);
    });

    it('should parse multiple numbered cells', async () => {
      const cells: { number: number | null }[][] = [
        [{ number: 1 }, { number: null }, { number: 5 }, { number: null }],
        [{ number: null }, { number: 3 }, { number: null }, { number: null }],
        [{ number: null }, { number: null }, { number: null }, { number: 12 }],
        [{ number: 8 }, { number: null }, { number: null }, { number: 16 }],
      ];

      const ctx = createMockContext({ boardExists: true, cells });
      const board = await parseZipBoard(ctx);

      expect(board.cells[0][0].number).toBe(1);
      expect(board.cells[0][2].number).toBe(5);
      expect(board.cells[1][1].number).toBe(3);
      expect(board.cells[2][3].number).toBe(12);
      expect(board.cells[3][0].number).toBe(8);
      expect(board.cells[3][3].number).toBe(16);
    });

    it('should correctly identify cell positions (row, col)', async () => {
      const cells: { number: number | null }[][] = [
        [{ number: null }, { number: 2 }, { number: null }],
        [{ number: 4 }, { number: null }, { number: null }],
        [{ number: null }, { number: null }, { number: 6 }],
      ];

      const ctx = createMockContext({ boardExists: true, cells });
      const board = await parseZipBoard(ctx);

      const numbered = board.numberedCells;
      expect(numbered).toContainEqual({ row: 0, col: 1, number: 2 });
      expect(numbered).toContainEqual({ row: 1, col: 0, number: 4 });
      expect(numbered).toContainEqual({ row: 2, col: 2, number: 6 });
    });
  });

  describe('5.3 - Empty cells identification', () => {
    it('should identify empty cells with null number', async () => {
      const cells: { number: number | null }[][] = [
        [{ number: 1 }, { number: null }, { number: null }],
        [{ number: null }, { number: null }, { number: null }],
        [{ number: null }, { number: null }, { number: 9 }],
      ];

      const ctx = createMockContext({ boardExists: true, cells });
      const board = await parseZipBoard(ctx);

      expect(board.cells[0][1].number).toBeNull();
      expect(board.cells[1][0].number).toBeNull();
      expect(board.cells[1][1].number).toBeNull();
      expect(board.cells[1][2].number).toBeNull();
      expect(board.cells[2][0].number).toBeNull();
      expect(board.cells[2][1].number).toBeNull();
    });

    it('should build complete grid with all cells having row and col', async () => {
      const cells = Array.from({ length: 4 }, (_, r) =>
        Array.from({ length: 4 }, (_, c) => ({ number: null as number | null }))
      );
      cells[0][0].number = 1;
      cells[3][3].number = 16;

      const ctx = createMockContext({ boardExists: true, cells });
      const board = await parseZipBoard(ctx);

      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          expect(board.cells[r][c].row).toBe(r);
          expect(board.cells[r][c].col).toBe(c);
          expect(board.cells[r][c]).toHaveProperty('number');
        }
      }
    });

    it('should handle a grid with mostly empty cells', async () => {
      const cells: { number: number | null }[][] = Array.from({ length: 5 }, () =>
        Array.from({ length: 5 }, () => ({ number: null as number | null }))
      );
      cells[0][0].number = 1;
      cells[4][4].number = 25;

      const ctx = createMockContext({ boardExists: true, cells });
      const board = await parseZipBoard(ctx);

      let emptyCount = 0;
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          if (board.cells[r][c].number === null) emptyCount++;
        }
      }
      expect(emptyCount).toBe(23);
    });
  });

  describe('5.4 - Structured ZipBoard with ordered numbered cells', () => {
    it('should return numberedCells sorted by number in ascending order', async () => {
      const cells: { number: number | null }[][] = [
        [{ number: 5 }, { number: null }, { number: 1 }],
        [{ number: null }, { number: 9 }, { number: null }],
        [{ number: 3 }, { number: null }, { number: 7 }],
      ];

      const ctx = createMockContext({ boardExists: true, cells });
      const board = await parseZipBoard(ctx);

      expect(board.numberedCells).toHaveLength(5);
      expect(board.numberedCells[0].number).toBe(1);
      expect(board.numberedCells[1].number).toBe(3);
      expect(board.numberedCells[2].number).toBe(5);
      expect(board.numberedCells[3].number).toBe(7);
      expect(board.numberedCells[4].number).toBe(9);
    });

    it('should include correct positions in numberedCells', async () => {
      const cells: { number: number | null }[][] = [
        [{ number: 10 }, { number: null }, { number: null }, { number: null }],
        [{ number: null }, { number: null }, { number: 5 }, { number: null }],
        [{ number: null }, { number: 1 }, { number: null }, { number: null }],
        [{ number: null }, { number: null }, { number: null }, { number: 16 }],
      ];

      const ctx = createMockContext({ boardExists: true, cells });
      const board = await parseZipBoard(ctx);

      expect(board.numberedCells[0]).toEqual({ row: 2, col: 1, number: 1 });
      expect(board.numberedCells[1]).toEqual({ row: 1, col: 2, number: 5 });
      expect(board.numberedCells[2]).toEqual({ row: 0, col: 0, number: 10 });
      expect(board.numberedCells[3]).toEqual({ row: 3, col: 3, number: 16 });
    });

    it('should return a complete ZipBoard with all required fields', async () => {
      const cells: { number: number | null }[][] = [
        [{ number: 1 }, { number: null }, { number: null }],
        [{ number: null }, { number: 5 }, { number: null }],
        [{ number: null }, { number: null }, { number: 9 }],
      ];

      const ctx = createMockContext({ boardExists: true, cells });
      const board = await parseZipBoard(ctx);

      expect(board).toHaveProperty('rows');
      expect(board).toHaveProperty('cols');
      expect(board).toHaveProperty('cells');
      expect(board).toHaveProperty('numberedCells');

      expect(board.rows).toBe(3);
      expect(board.cols).toBe(3);
      expect(board.cells).toHaveLength(3);
      expect(board.cells[0]).toHaveLength(3);
      expect(board.numberedCells).toHaveLength(3);
    });

    it('should return empty numberedCells when no cells have numbers', async () => {
      const cells = Array.from({ length: 3 }, () =>
        Array.from({ length: 3 }, () => ({ number: null as number | null }))
      );

      const ctx = createMockContext({ boardExists: true, cells });
      const board = await parseZipBoard(ctx);

      expect(board.numberedCells).toEqual([]);
    });
  });

  describe('5.5 - Error handling', () => {
    it('should throw when the game board element is not found', async () => {
      const ctx = createMockContext({ boardExists: false, cells: [] });

      await expect(parseZipBoard(ctx)).rejects.toThrow(
        /Could not find the Zip game board/
      );
    });

    it('should throw when no cells are found in the board', async () => {
      const ctx = createMockContext({ boardExists: true, cells: [] });

      await expect(parseZipBoard(ctx)).rejects.toThrow(
        /Could not find any cells/
      );
    });

    it('should throw when grid has inconsistent dimensions', async () => {
      const ctx = createInconsistentMock();

      await expect(parseZipBoard(ctx)).rejects.toThrow(
        /Inconsistent grid structure/
      );
    });
  });
});

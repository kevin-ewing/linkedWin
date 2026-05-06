import { describe, it, expect, vi } from 'vitest';
import { parseTangoBoard } from '../../src/solvers/tango/parser';
import type { Page, Frame } from 'playwright';

/**
 * Creates a mock context that simulates the LinkedIn Tango DOM.
 * The parser uses:
 * - context.locator(selector).first().waitFor() to find the board
 * - context.evaluate() to extract cell and constraint data
 */
function createMockContext(options: {
  boardExists?: boolean;
  cells?: { value: 'sun' | 'moon' | null; locked?: boolean }[][];
  constraints?: { cellIdx: number; type: 'equal' | 'opposite'; direction: 'right' | 'down' }[];
}): Page | Frame {
  const { boardExists = true, cells = [], constraints = [] } = options;

  const size = cells.length;
  const flatCells: { idx: number; value: 'sun' | 'moon' | null; locked: boolean }[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      flatCells.push({
        idx: r * size + c,
        value: cells[r][c].value,
        locked: cells[r][c].locked || false,
      });
    }
  }

  const waitForMock = boardExists
    ? vi.fn().mockResolvedValue(undefined)
    : vi.fn().mockRejectedValue(new Error('Timeout'));

  const locatorMock = {
    first: vi.fn().mockReturnValue({ waitFor: waitForMock }),
  };

  const mockContext = {
    locator: vi.fn().mockReturnValue(locatorMock),
    evaluate: vi.fn().mockImplementation(async () => {
      if (flatCells.length === 0) {
        return { cells: [], constraints: [], size: 0 };
      }
      return { cells: flatCells, constraints, size };
    }),
  } as unknown as Page;

  return mockContext;
}

describe('parseTangoBoard', () => {
  describe('Grid dimensions', () => {
    it('should extract a 6x6 grid', async () => {
      const cells = Array.from({ length: 6 }, () =>
        Array.from({ length: 6 }, () => ({ value: null as 'sun' | 'moon' | null }))
      );
      const ctx = createMockContext({ boardExists: true, cells });
      const board = await parseTangoBoard(ctx);
      expect(board.size).toBe(6);
      expect(board.cells.length).toBe(6);
      expect(board.cells[0].length).toBe(6);
    });

    it('should extract a 4x4 grid', async () => {
      const cells = Array.from({ length: 4 }, () =>
        Array.from({ length: 4 }, () => ({ value: null as 'sun' | 'moon' | null }))
      );
      const ctx = createMockContext({ boardExists: true, cells });
      const board = await parseTangoBoard(ctx);
      expect(board.size).toBe(4);
    });
  });

  describe('Cell values', () => {
    it('should parse sun values', async () => {
      const cells: { value: 'sun' | 'moon' | null }[][] = [
        [{ value: 'sun' }, { value: null }, { value: null }, { value: null }],
        [{ value: null }, { value: null }, { value: null }, { value: null }],
        [{ value: null }, { value: null }, { value: null }, { value: null }],
        [{ value: null }, { value: null }, { value: null }, { value: null }],
      ];
      const ctx = createMockContext({ boardExists: true, cells });
      const board = await parseTangoBoard(ctx);
      expect(board.cells[0][0].value).toBe('sun');
      expect(board.cells[0][1].value).toBeNull();
    });

    it('should parse moon values', async () => {
      const cells: { value: 'sun' | 'moon' | null }[][] = [
        [{ value: null }, { value: 'moon' }, { value: null }, { value: null }],
        [{ value: null }, { value: null }, { value: null }, { value: 'moon' }],
        [{ value: null }, { value: null }, { value: null }, { value: null }],
        [{ value: null }, { value: null }, { value: null }, { value: null }],
      ];
      const ctx = createMockContext({ boardExists: true, cells });
      const board = await parseTangoBoard(ctx);
      expect(board.cells[0][1].value).toBe('moon');
      expect(board.cells[1][3].value).toBe('moon');
    });

    it('should assign correct row and col indices', async () => {
      const cells = Array.from({ length: 4 }, () =>
        Array.from({ length: 4 }, () => ({ value: null as 'sun' | 'moon' | null }))
      );
      const ctx = createMockContext({ boardExists: true, cells });
      const board = await parseTangoBoard(ctx);
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          expect(board.cells[r][c].row).toBe(r);
          expect(board.cells[r][c].col).toBe(c);
        }
      }
    });
  });

  describe('Constraints', () => {
    it('should parse equal constraints', async () => {
      const cells = Array.from({ length: 4 }, () =>
        Array.from({ length: 4 }, () => ({ value: null as 'sun' | 'moon' | null }))
      );
      const constraints = [
        { cellIdx: 0, type: 'equal' as const, direction: 'right' as const },
      ];
      const ctx = createMockContext({ boardExists: true, cells, constraints });
      const board = await parseTangoBoard(ctx);
      expect(board.constraints).toHaveLength(1);
      expect(board.constraints[0].type).toBe('equal');
      expect(board.constraints[0].cell1).toEqual({ row: 0, col: 0 });
      expect(board.constraints[0].cell2).toEqual({ row: 0, col: 1 });
    });

    it('should parse opposite (cross) constraints', async () => {
      const cells = Array.from({ length: 4 }, () =>
        Array.from({ length: 4 }, () => ({ value: null as 'sun' | 'moon' | null }))
      );
      const constraints = [
        { cellIdx: 5, type: 'opposite' as const, direction: 'down' as const },
      ];
      const ctx = createMockContext({ boardExists: true, cells, constraints });
      const board = await parseTangoBoard(ctx);
      expect(board.constraints).toHaveLength(1);
      expect(board.constraints[0].type).toBe('opposite');
      expect(board.constraints[0].cell1).toEqual({ row: 1, col: 1 });
      expect(board.constraints[0].cell2).toEqual({ row: 2, col: 1 });
    });

    it('should parse multiple constraints', async () => {
      const cells = Array.from({ length: 6 }, () =>
        Array.from({ length: 6 }, () => ({ value: null as 'sun' | 'moon' | null }))
      );
      const constraints = [
        { cellIdx: 0, type: 'equal' as const, direction: 'right' as const },
        { cellIdx: 2, type: 'opposite' as const, direction: 'down' as const },
        { cellIdx: 7, type: 'equal' as const, direction: 'right' as const },
      ];
      const ctx = createMockContext({ boardExists: true, cells, constraints });
      const board = await parseTangoBoard(ctx);
      expect(board.constraints).toHaveLength(3);
    });

    it('should return empty constraints when none exist', async () => {
      const cells = Array.from({ length: 4 }, () =>
        Array.from({ length: 4 }, () => ({ value: null as 'sun' | 'moon' | null }))
      );
      const ctx = createMockContext({ boardExists: true, cells, constraints: [] });
      const board = await parseTangoBoard(ctx);
      expect(board.constraints).toEqual([]);
    });
  });

  describe('Error handling', () => {
    it('should throw when board is not found', async () => {
      const ctx = createMockContext({ boardExists: false, cells: [] });
      await expect(parseTangoBoard(ctx)).rejects.toThrow(/Could not find the Tango game board/);
    });

    it('should throw when no cells found', async () => {
      const ctx = createMockContext({ boardExists: true, cells: [] });
      await expect(parseTangoBoard(ctx)).rejects.toThrow(/Could not determine grid dimensions/);
    });
  });
});

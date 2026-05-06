# Design Document

## Overview

The LinkedIn Game Solvers system automates solving Tango and Zip puzzles on LinkedIn Games. It uses Playwright to connect to an existing Chrome browser session via CDP (Chrome DevTools Protocol), parses the game board from the DOM, solves the puzzle algorithmically, and executes moves back through the browser.

The project uses TypeScript with Node.js for the solver logic and browser automation, invoked via simple shell scripts.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    CLI Layer                          │
│  scripts/solve-tango.sh    scripts/solve-zip.sh      │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│                 Orchestrator                          │
│  src/solvers/tango/index.ts  src/solvers/zip/index.ts│
└──┬───────────────┬───────────────┬──────────────────┘
   │               │               │
┌──▼──┐      ┌────▼────┐     ┌───▼────┐
│Conn.│      │  Parser  │     │ Solver │
│Layer│      │  Layer   │     │ Layer  │
└──┬──┘      └────┬────┘     └───┬────┘
   │               │               │
   │          ┌────▼────┐     ┌───▼────┐
   │          │Board Rep│     │Solution│
   │          └─────────┘     └───┬────┘
   │                               │
┌──▼───────────────────────────────▼──┐
│          Move Executor               │
│  Translates solution → browser clicks│
└─────────────────────────────────────┘
```

## Technology Choices

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Browser Automation | Playwright | First-class CDP support, fast, TypeScript-native |
| Language | TypeScript | Type safety for board representations, good Playwright integration |
| Runtime | Node.js | Required by Playwright |
| Package Manager | npm | Standard for Node.js projects |
| CLI Scripts | Bash | Thin wrappers that invoke `npx ts-node` |
| Test Framework | Vitest | Fast, TypeScript-native, good for property-based testing |
| Property Testing | fast-check | Standard PBT library for TypeScript/JavaScript |

## Component Design

### 1. Browser Connection (`src/browser/connect.ts`)

Connects to an existing Chrome instance via CDP.

```typescript
interface BrowserConnection {
  connect(): Promise<Page>;
  findGameTab(gameType: 'tango' | 'zip'): Promise<Page>;
}
```

- User launches Chrome with `--remote-debugging-port=9222`
- Playwright connects via `chromium.connectOverCDP('http://localhost:9222')`
- Finds the tab containing the LinkedIn game URL

### 2. Tango Board Parser (`src/solvers/tango/parser.ts`)

Reads the Tango game board from the DOM.

```typescript
interface TangoCell {
  row: number;
  col: number;
  value: 'sun' | 'moon' | null;  // null = empty
}

interface TangoConstraint {
  cell1: { row: number; col: number };
  cell2: { row: number; col: number };
  type: 'equal' | 'opposite';
}

interface TangoBoard {
  size: number;  // grid is always square (e.g., 6x6)
  cells: TangoCell[][];
  constraints: TangoConstraint[];
}
```

Parsing strategy:
- Query the game grid container element
- Iterate over cell elements, reading aria-labels or data attributes for pre-filled values
- Identify constraint markers (= and x) between cells from adjacent indicator elements

### 3. Tango Solver (`src/solvers/tango/solver.ts`)

Constraint-satisfaction solver using backtracking with constraint propagation.

```typescript
function solveTango(board: TangoBoard): TangoCell[][] | null;
```

Algorithm:
1. Apply constraint propagation to reduce search space
2. Use backtracking to fill remaining cells
3. At each step, validate:
   - No three consecutive identical symbols in any row/column
   - Row/column symbol counts don't exceed half the grid size
   - Equality/inequality constraints between adjacent cells are satisfied
4. Return completed grid or null if unsolvable

Optimizations:
- Process most-constrained cells first (MRV heuristic)
- Propagate constraints after each assignment
- Early termination when a constraint is violated

### 4. Zip Board Parser (`src/solvers/zip/parser.ts`)

Reads the Zip game board from the DOM.

```typescript
interface ZipCell {
  row: number;
  col: number;
  number: number | null;  // null = empty cell
}

interface ZipBoard {
  rows: number;
  cols: number;
  cells: ZipCell[][];
  numberedCells: { row: number; col: number; number: number }[];
}
```

Parsing strategy:
- Query the game grid container
- Iterate over cells, reading number labels from text content or aria-labels
- Build ordered list of numbered waypoints

### 5. Zip Solver (`src/solvers/zip/solver.ts`)

Hamiltonian path solver with waypoint constraints.

```typescript
function solveZip(board: ZipBoard): { row: number; col: number }[] | null;
```

Algorithm:
1. Sort numbered cells by their number to get waypoint order
2. Find a Hamiltonian path from the first waypoint to the last
3. The path must pass through intermediate waypoints in order
4. Use backtracking with pruning:
   - At each step, only move to orthogonally adjacent unvisited cells
   - If the next waypoint is reachable, prioritize paths toward it
   - Prune if remaining unvisited cells are disconnected
5. Return ordered list of cells in path order, or null if unsolvable

Optimizations:
- Warnsdorff's heuristic (prefer cells with fewer unvisited neighbors)
- Connectivity check to prune dead-end branches early
- Segment-based solving: solve path between consecutive waypoints independently when possible

### 6. Move Executor (`src/browser/executor.ts`)

Translates solutions into browser interactions.

```typescript
interface MoveExecutor {
  executeTangoMoves(page: Page, solution: TangoCell[][], original: TangoBoard): Promise<void>;
  executeZipMoves(page: Page, path: { row: number; col: number }[]): Promise<void>;
}
```

Tango execution:
- For each empty cell in the original board, click it to cycle to the target symbol
- Cells cycle: empty → sun → moon → empty (click once for sun, twice for moon)

Zip execution:
- Click and drag from the first cell through each subsequent cell in the path
- Use Playwright's `page.mouse.move()` with steps to simulate drag

### 7. CLI Orchestrator (`src/solvers/tango/index.ts`, `src/solvers/zip/index.ts`)

Coordinates the full flow for each game:

```typescript
async function main() {
  console.log('🔌 Connecting to browser...');
  const page = await connectAndFindTab('tango');
  
  console.log('▶️  Starting game...');
  await clickStartGame(page);
  
  console.log('📋 Parsing board...');
  const board = await parseTangoBoard(page);
  
  console.log('🧠 Solving...');
  const solution = solveTango(board);
  if (!solution) throw new Error('No solution found');
  
  console.log('🎮 Executing moves...');
  await executeTangoMoves(page, solution, board);
  
  console.log('✅ Done!');
}
```

## File Structure

```
linkedWin/
├── package.json
├── tsconfig.json
├── scripts/
│   ├── solve-tango.sh      # bash wrapper
│   ├── solve-zip.sh        # bash wrapper
│   └── screenshot_playlist.sh  # existing
├── src/
│   ├── browser/
│   │   ├── connect.ts      # CDP connection logic
│   │   └── executor.ts     # Move execution
│   ├── solvers/
│   │   ├── tango/
│   │   │   ├── index.ts    # Tango orchestrator
│   │   │   ├── parser.ts   # DOM → TangoBoard
│   │   │   └── solver.ts   # Constraint satisfaction
│   │   └── zip/
│   │       ├── index.ts    # Zip orchestrator
│   │       ├── parser.ts   # DOM → ZipBoard
│   │       └── solver.ts   # Hamiltonian path
│   └── types.ts            # Shared type definitions
├── tests/
│   ├── tango/
│   │   ├── solver.test.ts  # Tango solver unit + property tests
│   │   └── parser.test.ts  # Parser tests with mock DOM
│   └── zip/
│       ├── solver.test.ts  # Zip solver unit + property tests
│       └── parser.test.ts  # Parser tests with mock DOM
├── data/                   # existing screenshot data
└── Makefile                # existing + new targets
```

## Correctness Properties

### Tango Solver Properties (Property-Based Tests)

1. **Solution validity invariant**: For any solvable TangoBoard, the solution produced by `solveTango` satisfies all Tango constraints simultaneously:
   - No three consecutive identical symbols in any row or column
   - Each row has exactly `size/2` suns and `size/2` moons
   - Each column has exactly `size/2` suns and `size/2` moons
   - All equality constraints are satisfied
   - All inequality constraints are satisfied

2. **Pre-filled preservation invariant**: For any TangoBoard with pre-filled cells, `solveTango` produces a solution where every pre-filled cell retains its original value.

3. **Completeness invariant**: For any solvable TangoBoard, `solveTango` produces a solution where every cell contains either 'sun' or 'moon' (no null values remain).

### Zip Solver Properties (Property-Based Tests)

4. **Hamiltonian path property**: For any solvable ZipBoard, the path produced by `solveZip` visits every cell in the grid exactly once.

5. **Adjacency property**: For any solution path, every pair of consecutive cells in the path are orthogonally adjacent (differ by exactly 1 in either row or column, but not both).

6. **Waypoint ordering property**: For any solvable ZipBoard, the solution path passes through all numbered cells in ascending order of their numbers.

## Testing Strategy

- **Unit tests**: Solver algorithms tested with hand-crafted boards of known solutions
- **Property-based tests**: fast-check generates random valid boards, verifies solution properties
- **Integration tests**: Full flow tested against mock DOM structures (jsdom)
- **Manual testing**: End-to-end against live LinkedIn games

## Edge Cases

- Tango boards with many pre-filled cells (nearly solved)
- Tango boards with no pre-filled cells (maximum search space)
- Zip boards with waypoints at grid edges/corners
- Zip boards where the path must spiral or zigzag
- Network latency causing DOM elements to load slowly (handled by Playwright's auto-waiting)
- Game UI changes between versions (parser may need updates)

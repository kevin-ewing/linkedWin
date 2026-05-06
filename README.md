# linkedWin

Automated solvers for LinkedIn puzzle games — Tango and Zip. The system connects to your browser via Chrome DevTools Protocol, reads the game board from the live DOM, solves the puzzle algorithmically, and plays the solution moves automatically.

## Games Supported

**Tango** — A logic puzzle where you fill a grid with Sun and Moon symbols following adjacency and balance constraints (no three in a row, equal symbols per row/column, equality/inequality markers between cells).

**Zip** — A path puzzle where you draw a continuous path through numbered waypoints, visiting every cell exactly once using only orthogonal moves.

## Prerequisites

- Node.js (v18+)
- Google Chrome
- npm

## Installation

```bash
npm install
```

## Usage

### 1. Launch Chrome with Remote Debugging

```bash
make chrome-zip    # Opens Chrome to the Zip game
make chrome-tango  # Opens Chrome to the Tango game
```

This launches Chrome with a persistent profile at `~/.linkedwin-chrome`. **You only need to log into LinkedIn once** — your session is saved between runs.

> On first run, log into LinkedIn when the browser opens. After that, it remembers you.

### 2. Run the Solver

In a separate terminal:

```bash
make solve-zip     # Solve the Zip puzzle
make solve-tango   # Solve the Tango puzzle
```

The solver will:
1. Connect to Chrome on `localhost:9222`
2. Find the LinkedIn game tab
3. Click "Start Game" (if visible)
4. Parse the board from the DOM
5. Compute the solution
6. Execute moves automatically
7. Print elapsed time on completion

## Development

### Running Tests

```bash
# Run all tests once
make test

# Or with npm
npm test

# Watch mode
npm run test:watch
```

The test suite includes:
- Unit tests with hand-crafted boards of known solutions
- Property-based tests (via fast-check) verifying solver correctness invariants

### Project Structure

```
├── src/
│   ├── types.ts                  # Shared type definitions
│   ├── browser/
│   │   ├── connect.ts            # CDP connection, tab discovery, start game
│   │   └── executor.ts           # Move execution (clicks, drag)
│   └── solvers/
│       ├── tango/
│       │   ├── index.ts          # Tango orchestrator
│       │   ├── parser.ts         # DOM → TangoBoard
│       │   └── solver.ts         # Constraint satisfaction solver
│       └── zip/
│           ├── index.ts          # Zip orchestrator
│           ├── parser.ts         # DOM → ZipBoard
│           └── solver.ts         # Hamiltonian path solver
├── tests/
│   ├── tango/
│   │   ├── parser.test.ts
│   │   └── solver.test.ts
│   ├── zip/
│   │   ├── parser.test.ts
│   │   └── solver.test.ts
│   └── browser/
│       └── executor.test.ts
├── scripts/
│   ├── solve-tango.sh            # Bash wrapper for Tango solver
│   ├── solve-zip.sh              # Bash wrapper for Zip solver
│   └── screenshot_playlist.sh    # Screenshot scraping utility
├── data/                         # Scraped game screenshots
├── package.json
├── tsconfig.json
└── Makefile
```

### Makefile Targets

| Target | Description |
|--------|-------------|
| `make help` | Show all available targets |
| `make chrome-zip` | Launch Chrome and open the Zip game |
| `make chrome-tango` | Launch Chrome and open the Tango game |
| `make solve-zip` | Solve a LinkedIn Zip puzzle |
| `make solve-tango` | Solve a LinkedIn Tango puzzle |
| `make test` | Run the test suite |
| `make tango` | Scrape Tango screenshots from YouTube |
| `make zip` | Scrape Zip screenshots from YouTube |

## How It Works

### Tango Solver

Uses constraint propagation combined with backtracking search:
- Eliminates impossible values based on row/column balance and no-three-in-a-row rules
- Applies equality/inequality constraint markers between adjacent cells
- Selects the most constrained cell first (MRV heuristic)
- Backtracks when contradictions are detected

### Zip Solver

Uses Hamiltonian path search with pruning:
- Finds a path visiting every cell exactly once, passing through numbered waypoints in order
- Applies Warnsdorff's heuristic (prefer cells with fewer unvisited neighbors)
- Prunes branches where remaining unvisited cells become disconnected
- Backtracks between waypoints when no valid continuation exists

## Troubleshooting

**"Could not connect to Chrome"** — Run `make chrome-zip` (or `make chrome-tango`) first in a separate terminal. Close any other Chrome instances beforehand.

**"Could not find a LinkedIn game tab"** — Navigate to the game page in Chrome before running the solver.

**"No solution found"** — The board may have been parsed incorrectly (LinkedIn DOM changes can break the parser). Check the console output for parsing details.

**Solver is slow** — Both solvers are designed to complete within 5 seconds for standard board sizes. If it's taking longer, the board may be unusually difficult or the parser may have misread a constraint.

## License

MIT

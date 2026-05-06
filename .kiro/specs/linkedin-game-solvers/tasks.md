# Implementation Tasks

## Task 1: Project Setup and Configuration

- [x] 1.1 Initialize Node.js project with package.json (dependencies: playwright, typescript, ts-node, vitest, fast-check)
- [x] 1.2 Create tsconfig.json with strict mode and appropriate module settings
- [x] 1.3 Create shared type definitions in src/types.ts (TangoCell, TangoConstraint, TangoBoard, ZipCell, ZipBoard)
- [x] 1.4 Add solver targets to Makefile (solve-tango, solve-zip, test)

## Task 2: Browser Connection Layer

- [x] 2.1 Implement CDP connection logic in src/browser/connect.ts (connect to Chrome on localhost:9222)
- [x] 2.2 Implement tab discovery to find the LinkedIn game tab by URL pattern
- [x] 2.3 Implement "Start Game" button click with wait-for-visible logic
- [x] 2.4 Add error handling with user-friendly messages and instructions for launching Chrome with --remote-debugging-port=9222

## Task 3: Tango Board Parser

- [x] 3.1 Implement src/solvers/tango/parser.ts to extract grid dimensions from the DOM
- [x] 3.2 Parse pre-filled cell values (sun/moon) from cell elements using aria-labels or data attributes
- [x] 3.3 Parse constraint markers (equal/opposite) between adjacent cells
- [x] 3.4 Return structured TangoBoard object
- [x] 3.5 Add error handling for missing or unexpected DOM structure

## Task 4: Tango Solver Algorithm

- [x] 4.1 Implement constraint propagation logic (eliminate impossible values based on row/column counts and adjacency)
- [x] 4.2 Implement backtracking search with MRV (Most Restrained Variable) heuristic
- [x] 4.3 Implement constraint validation (no-three-in-a-row, balance, equality/inequality markers)
- [x] 4.4 Write property-based tests verifying solution validity invariant (all constraints satisfied simultaneously)
- [x] 4.5 Write property-based tests verifying pre-filled preservation invariant
- [x] 4.6 Write unit tests with hand-crafted boards of known solutions

## Task 5: Zip Board Parser

- [x] 5.1 Implement src/solvers/zip/parser.ts to extract grid dimensions from the DOM
- [x] 5.2 Parse numbered cells and their grid positions from cell text content or aria-labels
- [x] 5.3 Identify empty cells and build complete grid representation
- [x] 5.4 Return structured ZipBoard object with ordered numbered cells list
- [x] 5.5 Add error handling for missing or unexpected DOM structure

## Task 6: Zip Solver Algorithm

- [x] 6.1 Implement Hamiltonian path search with backtracking between waypoints
- [x] 6.2 Implement Warnsdorff's heuristic for neighbor selection ordering
- [x] 6.3 Implement connectivity pruning (check remaining cells are reachable)
- [x] 6.4 Write property-based tests verifying Hamiltonian path property (visits every cell exactly once)
- [x] 6.5 Write property-based tests verifying adjacency property (consecutive cells are orthogonal neighbors)
- [x] 6.6 Write property-based tests verifying waypoint ordering property
- [x] 6.7 Write unit tests with hand-crafted boards of known solutions

## Task 7: Move Executor

- [x] 7.1 Implement Tango move execution in src/browser/executor.ts (click cells to cycle to target symbol)
- [x] 7.2 Implement Zip move execution (click-and-drag path through cells in order)
- [x] 7.3 Add retry logic (up to 3 attempts per interaction) with configurable delay between moves
- [x] 7.4 Add move execution logging (which cell, what action)

## Task 8: CLI Orchestrators and Shell Scripts

- [x] 8.1 Implement src/solvers/tango/index.ts orchestrator (connect → start → parse → solve → execute)
- [x] 8.2 Implement src/solvers/zip/index.ts orchestrator (connect → start → parse → solve → execute)
- [x] 8.3 Create scripts/solve-tango.sh bash wrapper that invokes the TypeScript orchestrator
- [x] 8.4 Create scripts/solve-zip.sh bash wrapper that invokes the TypeScript orchestrator
- [x] 8.5 Add status messages and elapsed time reporting to both orchestrators

# Requirements Document

## Introduction

Automated solvers for two LinkedIn puzzle games: Tango and Zip. The system uses browser automation to interact with the LinkedIn Games page, reads the game board state from the live DOM, solves the puzzle algorithmically, and plays the solution moves automatically. The user navigates to the game page (showing the "Start Game" button), runs a shell command, and the solver handles everything from that point.

## Glossary

- **Tango_Solver**: The subsystem responsible for parsing and solving Tango puzzle boards
- **Zip_Solver**: The subsystem responsible for parsing and solving Zip puzzle boards
- **Browser_Automation**: The subsystem that controls the user's browser to interact with the LinkedIn Games page (e.g., Playwright)
- **Board_Parser**: The component that reads the game board state from the browser DOM
- **Game_Board**: The grid of cells displayed in the LinkedIn game interface
- **Tango**: A LinkedIn logic puzzle where the player fills a grid with Sun and Moon symbols following adjacency and balance constraints
- **Zip**: A LinkedIn path puzzle where the player draws a continuous path through numbered cells, visiting every cell exactly once
- **CLI**: The command-line interface scripts the user invokes to start a solver
- **Move_Executor**: The component that translates a computed solution into browser interactions (clicks/drags)
- **Constraint**: A rule that must be satisfied for a valid Tango solution (no three-in-a-row, equal symbols per row/column, equality/inequality markers between adjacent cells)

## Requirements

### Requirement 1: Tango Solver CLI Entry Point

**User Story:** As a user, I want to run a single shell command to solve a Tango puzzle, so that I can automate gameplay without manual interaction.

#### Acceptance Criteria

1. WHEN the user executes the Tango solver CLI command, THE Browser_Automation SHALL connect to the user's existing browser session on the LinkedIn Tango game page.
2. WHEN the Browser_Automation detects a "Start Game" button on the page, THE Browser_Automation SHALL click the button to begin the game.
3. WHEN the game board becomes visible after starting, THE Board_Parser SHALL extract the complete Tango game state from the DOM within 2 seconds.
4. WHEN the Board_Parser has extracted the game state, THE Tango_Solver SHALL compute a valid solution.
5. WHEN the Tango_Solver has computed a solution, THE Move_Executor SHALL play all moves on the board by clicking the appropriate cells.

### Requirement 2: Zip Solver CLI Entry Point

**User Story:** As a user, I want to run a single shell command to solve a Zip puzzle, so that I can automate gameplay without manual interaction.

#### Acceptance Criteria

1. WHEN the user executes the Zip solver CLI command, THE Browser_Automation SHALL connect to the user's existing browser session on the LinkedIn Zip game page.
2. WHEN the Browser_Automation detects a "Start Game" button on the page, THE Browser_Automation SHALL click the button to begin the game.
3. WHEN the game board becomes visible after starting, THE Board_Parser SHALL extract the complete Zip game state from the DOM within 2 seconds.
4. WHEN the Board_Parser has extracted the game state, THE Zip_Solver SHALL compute a valid path solution.
5. WHEN the Zip_Solver has computed a solution, THE Move_Executor SHALL play the path on the board by performing drag or click interactions on cells in sequence.

### Requirement 3: Tango Board Parsing

**User Story:** As a developer, I want the system to accurately read the Tango board state from the live DOM, so that the solver receives correct input.

#### Acceptance Criteria

1. THE Board_Parser SHALL identify the grid dimensions (number of rows and columns) from the DOM.
2. THE Board_Parser SHALL identify pre-filled cells (cells already containing a Sun or Moon symbol).
3. THE Board_Parser SHALL identify constraint markers between adjacent cells (equality "=" and inequality "x" indicators).
4. THE Board_Parser SHALL represent the parsed board as a structured data object containing dimensions, pre-filled values, and constraints.
5. IF the Board_Parser cannot locate the game board element in the DOM, THEN THE Board_Parser SHALL report a descriptive error message and exit gracefully.

### Requirement 4: Zip Board Parsing

**User Story:** As a developer, I want the system to accurately read the Zip board state from the live DOM, so that the solver receives correct input.

#### Acceptance Criteria

1. THE Board_Parser SHALL identify the grid dimensions (number of rows and columns) from the DOM.
2. THE Board_Parser SHALL identify numbered cells and their positions on the grid.
3. THE Board_Parser SHALL identify empty cells that must be part of the path.
4. THE Board_Parser SHALL represent the parsed board as a structured data object containing dimensions, numbered cell positions, and empty cell positions.
5. IF the Board_Parser cannot locate the game board element in the DOM, THEN THE Board_Parser SHALL report a descriptive error message and exit gracefully.

### Requirement 5: Tango Puzzle Solving Algorithm

**User Story:** As a developer, I want a correct and fast Tango solver, so that puzzles are solved reliably.

#### Acceptance Criteria

1. THE Tango_Solver SHALL produce a solution where no row or column contains more than two consecutive identical symbols.
2. THE Tango_Solver SHALL produce a solution where each row contains an equal number of Sun and Moon symbols.
3. THE Tango_Solver SHALL produce a solution where each column contains an equal number of Sun and Moon symbols.
4. THE Tango_Solver SHALL produce a solution that respects all equality constraints (adjacent cells marked "=" contain the same symbol).
5. THE Tango_Solver SHALL produce a solution that respects all inequality constraints (adjacent cells marked "x" contain different symbols).
6. THE Tango_Solver SHALL preserve all pre-filled cell values in the solution.
7. WHEN given a valid Tango board, THE Tango_Solver SHALL find a solution within 5 seconds.
8. IF no valid solution exists for the given board, THEN THE Tango_Solver SHALL report that no solution was found.

### Requirement 6: Zip Puzzle Solving Algorithm

**User Story:** As a developer, I want a correct and fast Zip solver, so that puzzles are solved reliably.

#### Acceptance Criteria

1. THE Zip_Solver SHALL produce a path that visits every cell in the grid exactly once.
2. THE Zip_Solver SHALL produce a path where consecutive cells are orthogonally adjacent (up, down, left, right).
3. THE Zip_Solver SHALL produce a path that passes through all numbered cells in ascending numerical order.
4. THE Zip_Solver SHALL use the lowest-numbered cell as the path start and the highest-numbered cell as the path end.
5. WHEN given a valid Zip board, THE Zip_Solver SHALL find a solution within 5 seconds.
6. IF no valid solution exists for the given board, THEN THE Zip_Solver SHALL report that no solution was found.

### Requirement 7: Move Execution

**User Story:** As a user, I want the solver to play moves quickly and accurately on the game board, so that the puzzle is completed automatically.

#### Acceptance Criteria

1. WHEN executing Tango moves, THE Move_Executor SHALL click each empty cell the correct number of times to cycle to the target symbol (Sun or Moon).
2. WHEN executing Zip moves, THE Move_Executor SHALL perform a click-and-drag interaction from the path start cell through each subsequent cell in path order.
3. THE Move_Executor SHALL introduce a delay of no more than 50 milliseconds between individual move actions to ensure the game UI registers each interaction.
4. IF a move interaction fails (element not found or not clickable), THEN THE Move_Executor SHALL retry the interaction up to 3 times before reporting an error.

### Requirement 8: Browser Connection

**User Story:** As a user, I want the solver to connect to my existing browser session, so that I do not need to log in again or manage separate browser windows.

#### Acceptance Criteria

1. THE Browser_Automation SHALL connect to a running browser instance via a remote debugging protocol.
2. THE CLI SHALL provide instructions for launching the browser with remote debugging enabled if a connection cannot be established.
3. IF the Browser_Automation cannot connect to a browser instance, THEN THE Browser_Automation SHALL display an error message with instructions for enabling remote debugging.
4. WHEN connected, THE Browser_Automation SHALL identify and attach to the browser tab containing the LinkedIn game page.

### Requirement 9: Error Handling and User Feedback

**User Story:** As a user, I want clear feedback on what the solver is doing and what went wrong if it fails, so that I can troubleshoot issues.

#### Acceptance Criteria

1. THE CLI SHALL print a status message at each stage: connecting to browser, starting game, parsing board, solving, and executing moves.
2. IF any stage fails, THEN THE CLI SHALL print a descriptive error message indicating which stage failed and the reason.
3. WHEN the solver completes successfully, THE CLI SHALL print a success message with the total elapsed time.

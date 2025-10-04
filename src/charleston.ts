// path: mahjong-ts/src/charleston.ts
import { GameState, PlayerId, Tile } from './types';

export type CharlestonDirection = 'right' | 'across' | 'left';


export type CharlestonPhase = 'first' | 'second' | 'courtesy';

export type CharlestonOptions = {
  secondCharlestonEnabled: boolean;
  enableCourtesyPass: boolean; // optional across pass 0-3 tiles
  enableBlindPass: boolean; // allow blind pass 0-3 tiles (server still validates ownership)
  enableTileStealing: boolean; // allow stealing 1-3 tiles on last pass of each Charleston
};

export type CharlestonState = {
  phase: CharlestonPhase;
  direction: CharlestonDirection;
  passes: Map<PlayerId, Tile[]>;
  isLastPass: boolean; // for tile stealing
  completed: boolean;
  stopped: boolean;
};

const DEFAULT_OPTIONS: CharlestonOptions = {
  secondCharlestonEnabled: true,
  enableCourtesyPass: true,
  enableBlindPass: false,
  enableTileStealing: true
};

function seatTo(seat: PlayerId, dir: CharlestonDirection): PlayerId {
  const offset = dir === 'right' ? 1 : dir === 'across' ? 2 : 3;
  return (((seat + offset) % 4) as PlayerId);
}

function assertNoJokers(tiles: Tile[]) {
  for (const t of tiles) if (t === 'J') throw new Error('Jokers may not be passed');
}

function removeTilesFromHand(hand: Tile[], tiles: Tile[]) {
  for (const t of tiles) {
    const idx = hand.indexOf(t);
    if (idx < 0) throw new Error('Tile not in hand for pass');
    hand.splice(idx, 1);
  }
}

export function validatePass(
  tiles: Tile[],
  hand: Tile[],
  phase: CharlestonPhase,
  isLastPass: boolean,
  enableTileStealing: boolean,
  incomingTiles?: Tile[] // Tiles being received in this pass for stealing
): { valid: boolean; error?: string } {
  // Check for jokers - NEVER allowed to be passed
  if (tiles.some(t => t === 'J')) {
    return { valid: false, error: 'Jokers may never be passed' };
  }

  // Validate pass count based on phase and stealing rules
  if (phase === 'first' || phase === 'second') {
    // Standard Charleston passes
    if (isLastPass && enableTileStealing) {
      // On last pass of Charleston, can "steal" tiles
      // Can pass 1-3 tiles (keeping some incoming tiles for self)
      if (tiles.length < 1 || tiles.length > 3) {
        return { valid: false, error: 'Must pass 1-3 tiles on last pass (can steal)' };
      }
      
      // If stealing, must validate that we have the tiles to pass
      // (either from hand or from incoming tiles)
      const availableTiles = [...hand];
      if (incomingTiles) {
        availableTiles.push(...incomingTiles);
      }
      
      for (const tile of tiles) {
        const idx = availableTiles.indexOf(tile);
        if (idx === -1) {
          return { valid: false, error: `Tile ${tile} not available to pass` };
        }
        availableTiles.splice(idx, 1); // Remove so we can't count it twice
      }
    } else {
      // Non-stealing passes must be exactly 3 tiles
      if (tiles.length !== 3) {
        return { valid: false, error: 'Must pass exactly 3 tiles' };
      }
      
      // Validate tile ownership from hand only
      for (const tile of tiles) {
        if (!hand.includes(tile)) {
          return { valid: false, error: `Tile ${tile} not in hand` };
        }
      }
    }
  } else if (phase === 'courtesy') {
    // Optional final pass across - can be 0-3 tiles
    if (tiles.length > 3) {
      return { valid: false, error: 'Cannot pass more than 3 tiles in optional pass' };
    }
    
    // Validate ownership
    for (const tile of tiles) {
      if (!hand.includes(tile)) {
        return { valid: false, error: `Tile ${tile} not in hand` };
      }
    }
  }

  return { valid: true };
}

export function executeCharlestonPass(state: GameState, options: CharlestonOptions) {
  const { charleston } = state;
  if (!charleston || charleston.passes.size !== 4) return;

  // Execute the pass
  const recipients = new Map<PlayerId, PlayerId>();
  for (let seat = 0; seat < 4; seat++) {
    recipients.set(seat as PlayerId, seatTo(seat as PlayerId, charleston.direction));
  }

  // Process passes
  for (const [from, tiles] of charleston.passes.entries()) {
    const to = recipients.get(from)!;
    removeTilesFromHand(state.players[from].hand, tiles);
    state.players[to].hand.push(...tiles);
  }

  // Clear passes
  charleston.passes.clear();

  // Update charleston state
  updateCharlestonState(charleston, options);
}

function updateCharlestonState(charleston: CharlestonState, options: CharlestonOptions) {
  const { direction, phase } = charleston;

  if (direction === 'left' && phase === 'first') {
    // End of first Charleston - either stop or start second
    if (options.secondCharlestonEnabled && !charleston.stopped) {
      charleston.phase = 'second';
      charleston.direction = 'left';
      charleston.isLastPass = false;
    } else {
      charleston.phase = 'courtesy';
      charleston.direction = 'across';
    }
  } else if (direction === 'right' && phase === 'second') {
    // End of second Charleston
    if (options.enableCourtesyPass) {
      charleston.phase = 'courtesy';
      charleston.direction = 'across';
    } else {
      charleston.completed = true;
    }
  } else if (phase === 'courtesy') {
    // End of Charleston
    charleston.completed = true;
  } else {
    // Move to next direction
    if (direction === 'right') {
      charleston.direction = 'across';
    } else if (direction === 'across') {
      charleston.direction = 'left';
    } else {
      charleston.direction = 'right';
      charleston.isLastPass = true;
    }
  }
}
/**
 * Apply a single Charleston leg (Right/Across/Left).
 * Each player selects exactly 3 tiles to pass (unless special modes permit variations).
 * The server removes the selected tiles from each player, then delivers them to the target seat.
 */
export function applyCharlestonLeg(
  state: GameState,
  selections: Record<PlayerId, Tile[]>,
  direction: CharlestonDirection,
  allowZeroToThree: boolean = false,
  allowStealing: boolean = false
): GameState {
  const s: GameState = JSON.parse(JSON.stringify(state));
  
  // Validate sizes and jokers
  for (const pid of [0, 1, 2, 3] as PlayerId[]) {
    const tiles = selections[pid] || [];
    if (!allowZeroToThree && !allowStealing && tiles.length !== 3) {
      throw new Error('Must pass exactly 3 tiles');
    }
    if (allowZeroToThree && (tiles.length < 0 || tiles.length > 3)) {
      throw new Error('Must pass 0 to 3 tiles');
    }
    if (allowStealing && (tiles.length < 1 || tiles.length > 3)) {
      throw new Error('Must pass 1 to 3 tiles when stealing allowed');
    }
    assertNoJokers(tiles);
  }

  if (allowStealing) {
    // Handle stealing pass: players can keep some incoming tiles
    return applyStealingPass(s, selections, direction);
  } else {
    // Regular pass: remove from hands first, then deliver
    for (const pid of [0, 1, 2, 3] as PlayerId[]) {
      removeTilesFromHand(s.players[pid].hand, selections[pid] || []);
    }

    // Deliver to targets
    for (const pid of [0, 1, 2, 3] as PlayerId[]) {
      const to = seatTo(pid, direction);
      s.players[to].hand.push(...(selections[pid] || []));
    }
  }

  return s;
}

/**
 * Handle a stealing pass where players can keep some incoming tiles
 * This is used on the last pass of each Charleston (First LEFT and Last RIGHT)
 */
function applyStealingPass(
  state: GameState,
  selections: Record<PlayerId, Tile[]>,
  direction: CharlestonDirection
): GameState {
  const s: GameState = JSON.parse(JSON.stringify(state));
  
  // First, determine what each player will receive
  const incoming: Record<PlayerId, Tile[]> = { 0: [], 1: [], 2: [], 3: [] };
  for (const pid of [0, 1, 2, 3] as PlayerId[]) {
    const from = seatTo(pid, direction === 'right' ? 'left' : direction === 'left' ? 'right' : 'across');
    incoming[pid] = selections[from] || [];
  }
  
  // Now handle each player's decision
  for (const pid of [0, 1, 2, 3] as PlayerId[]) {
    const tilesToPass = selections[pid] || [];
    const receivingTiles = incoming[pid];
    
    // Player can choose to pass some of their own tiles or some incoming tiles
    // Remove tiles from their hand first
    const tilesFromHand = tilesToPass.filter(t => s.players[pid].hand.includes(t));
    const tilesFromIncoming = tilesToPass.filter(t => !s.players[pid].hand.includes(t));
    
    // Remove tiles from hand
    removeTilesFromHand(s.players[pid].hand, tilesFromHand);
    
    // Add all incoming tiles to hand first
    s.players[pid].hand.push(...receivingTiles);
    
    // Then remove any incoming tiles they chose to pass along
    removeTilesFromHand(s.players[pid].hand, tilesFromIncoming);
  }
  
  // Finally deliver the passed tiles
  for (const pid of [0, 1, 2, 3] as PlayerId[]) {
    const to = seatTo(pid, direction);
    const tilesToPass = selections[pid] || [];
    s.players[to].hand.push(...tilesToPass);
  }

  return s;
}

export function runFirstCharleston(
  state: GameState,
  picksRight: Record<PlayerId, Tile[]>,
  picksAcross: Record<PlayerId, Tile[]>,
  picksLeft: Record<PlayerId, Tile[]>,
  enableStealing: boolean = true
): GameState {
  let s = applyCharlestonLeg(state, picksRight, 'right');
  s = applyCharlestonLeg(s, picksAcross, 'across');
  // Last pass of first Charleston allows stealing
  s = applyCharlestonLeg(s, picksLeft, 'left', false, enableStealing);
  return s;
}

export function runSecondCharleston(
  state: GameState,
  picksLeft: Record<PlayerId, Tile[]>,
  picksAcross: Record<PlayerId, Tile[]>,
  picksRight: Record<PlayerId, Tile[]>,
  enableStealing: boolean = true
): GameState {
  let s = applyCharlestonLeg(state, picksLeft, 'left');
  s = applyCharlestonLeg(s, picksAcross, 'across');
  // Last pass of second Charleston allows stealing  
  s = applyCharlestonLeg(s, picksRight, 'right', false, enableStealing);
  return s;
}

/**
 * Courtesy pass: optional, typically across. Allows 0-3 tiles.
 */
export function runCourtesyPass(
  state: GameState,
  selectionsAcross: Record<PlayerId, Tile[]>
): GameState {
  return applyCharlestonLeg(state, selectionsAcross, 'across', true);
}

/**
 * Blind pass: optional; allows 0-3 tiles in a specific direction (usually left).
 */
export function runBlindPass(
  state: GameState,
  direction: CharlestonDirection,
  selections: Record<PlayerId, Tile[]>
): GameState {
  return applyCharlestonLeg(state, selections, direction, true);
}

/**
 * High-level helper to execute configured Charleston sequence.
 */
export function executeCharleston(
  initial: GameState,
  opts: Partial<CharlestonOptions>,
  legs: {
    first: {
      right: Record<PlayerId, Tile[]>;
      across: Record<PlayerId, Tile[]>;
      left: Record<PlayerId, Tile[]>;
    };
    second?: {
      left: Record<PlayerId, Tile[]>;
      across: Record<PlayerId, Tile[]>;
      right: Record<PlayerId, Tile[]>;
    };
    courtesyAcross?: Record<PlayerId, Tile[]>;
    blind?: { direction: CharlestonDirection; selections: Record<PlayerId, Tile[]> };
  }
): GameState {
  const options = { ...DEFAULT_OPTIONS, ...opts };
  let s = runFirstCharleston(initial, legs.first.right, legs.first.across, legs.first.left);
  if (options.secondCharlestonEnabled && legs.second) {
    s = runSecondCharleston(s, legs.second.left, legs.second.across, legs.second.right);
  }
  if (options.enableCourtesyPass && legs.courtesyAcross) {
    s = runCourtesyPass(s, legs.courtesyAcross);
  }
  if (options.enableBlindPass && legs.blind) {
    s = runBlindPass(s, legs.blind.direction, legs.blind.selections);
  }
  return s;
}



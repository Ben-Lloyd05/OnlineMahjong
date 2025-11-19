// New Charleston management system
// This file contains the logic for the step-by-step Charleston implementation

import { GameState, PlayerId, Tile } from './types';
import { CharlestonState, CharlestonPlayerState, CharlestonPhase } from './charleston';

/**
 * Initialize Charleston at the start of the game
 */
export function initializeCharleston(state: GameState): GameState {
  const newState = { ...state };
  
  const playerStates: Record<PlayerId, CharlestonPlayerState> = {
    0: { selectedTiles: [], ready: false },
    1: { selectedTiles: [], ready: false },
    2: { selectedTiles: [], ready: false },
    3: { selectedTiles: [], ready: false }
  };
  
  newState.charleston = {
    phase: 'pass-right',
    passNumber: 1,
    playerStates,
    completed: false
  };
  
  newState.phase = 'charleston';
  
  return newState;
}

/**
 * Get the target player for a given direction from a source player
 */
export function getPassTarget(fromPlayer: PlayerId, phase: CharlestonPhase): PlayerId {
  const directions: Record<CharlestonPhase, number> = {
    'pass-right': 1,      // P0→P1, P1→P2, P2→P3, P3→P0
    'pass-across': 2,     // P0→P2, P1→P3, P2→P0, P3→P1
    'pass-left': 3,       // P0→P3, P1→P0, P2→P1, P3→P2
    'pass-left-2': 3,     // Same as pass-left
    'pass-across-2': 2,   // Same as pass-across
    'pass-right-2': 1,    // Same as pass-right
    'vote': 0,            // Not applicable
    'courtesy': 0,        // Directed by player
    'complete': 0         // Not applicable
  };
  
  const offset = directions[phase];
  return ((fromPlayer + offset) % 4) as PlayerId;
}

/**
 * Get the source player for incoming tiles (reverse of getPassTarget)
 */
export function getPassSource(toPlayer: PlayerId, phase: CharlestonPhase): PlayerId {
  const reverseDirections: Record<CharlestonPhase, number> = {
    'pass-right': 3,      // Receive from left (P0←P3)
    'pass-across': 2,     // Receive from across (P0←P2)
    'pass-left': 1,       // Receive from right (P0←P1)
    'pass-left-2': 1,
    'pass-across-2': 2,
    'pass-right-2': 3,
    'vote': 0,
    'courtesy': 0,
    'complete': 0
  };
  
  const offset = reverseDirections[phase];
  return ((toPlayer + offset) % 4) as PlayerId;
}

/**
 * Handle a player's tile selection
 */
export function handleCharlestonSelection(
  state: GameState,
  playerId: PlayerId,
  tiles: Tile[],
  blindPass?: { enabled: boolean; count: 0 | 1 | 2 }
): { success: boolean; error?: string } {
  if (!state.charleston || state.charleston.completed) {
    return { success: false, error: 'Charleston is not active' };
  }
  
  const charleston = state.charleston;
  const phase = charleston.phase;
  
  // Check if in a pass phase
  if (phase === 'vote' || phase === 'courtesy' || phase === 'complete') {
    return { success: false, error: 'Not in a pass phase' };
  }
  
  // Validate jokers
  if (tiles.some(t => t === 'J')) {
    return { success: false, error: 'Jokers cannot be passed' };
  }
  
  // Check if blind pass is allowed
  // Test override: allow blind pass on every pass when BLIND_PASS_ALL is set
  const blindAll = process.env.BLIND_PASS_ALL === '1' || process.env.BLIND_PASS_ALL === 'true';
  const canBlindPass = blindAll || phase === 'pass-left' || phase === 'pass-right-2';
  if (blindPass && !canBlindPass) {
    return { success: false, error: 'Blind pass only allowed on pass 3 and 6' };
  }
  
  // Validate tile count
  if (blindPass && blindPass.enabled) {
    // blindPass.count now means: select X tiles from hand, keep X tiles from incoming
    if (tiles.length !== blindPass.count) {
      return { success: false, error: `Must select ${blindPass.count} tiles when blind passing` };
    }
  } else {
    if (tiles.length !== 3) {
      return { success: false, error: 'Must select exactly 3 tiles' };
    }
  }
  
  // Validate tile ownership
  const playerHand = state.players[playerId].hand;
  for (const tile of tiles) {
    if (!playerHand.includes(tile)) {
      return { success: false, error: `Tile ${tile} not in hand` };
    }
  }
  
  // Update player state
  charleston.playerStates[playerId] = {
    selectedTiles: tiles,
    ready: false,
    blindPass: blindPass && blindPass.enabled ? blindPass : undefined
  };
  
  return { success: true };
}

/**
 * Mark a player as ready
 */
export function handleCharlestonReady(
  state: GameState,
  playerId: PlayerId
): { success: boolean; error?: string } {
  if (!state.charleston || state.charleston.completed) {
    return { success: false, error: 'Charleston is not active' };
  }
  
  const playerState = state.charleston.playerStates[playerId];
  
  // Validate they have selected tiles
  const phase = state.charleston.phase;
  if (phase !== 'vote' && phase !== 'courtesy' && phase !== 'complete') {
    if (playerState.selectedTiles.length === 0 && !playerState.blindPass?.enabled) {
      return { success: false, error: 'Must select tiles before marking ready' };
    }
  }
  
  playerState.ready = true;
  
  return { success: true };
}

/**
 * Check if all players are ready
 */
export function allPlayersReady(charleston: CharlestonState): boolean {
  return Object.values(charleston.playerStates).every(ps => ps.ready);
}

/**
 * Execute the current pass
 */
export function executeCharlestonPass(state: GameState): GameState {
  if (!state.charleston || state.charleston.completed) {
    return state;
  }
  
  const charleston = state.charleston;
  const phase = charleston.phase;
  
  if (phase === 'vote' || phase === 'courtesy' || phase === 'complete') {
    return state;
  }
  
  const newState = JSON.parse(JSON.stringify(state)) as GameState;
  const newCharleston = newState.charleston!;
  
  console.log('[Charleston] Starting pass execution');
  console.log('[Charleston] Phase:', phase);
  
  // Log initial hand counts and store them for comparison
  const initialCounts: Record<PlayerId, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  for (let pid = 0; pid < 4; pid++) {
    const playerId = pid as PlayerId;
    initialCounts[playerId] = newState.players[playerId].hand.length;
    console.log(`[Charleston] Player ${pid} initial hand count: ${initialCounts[playerId]}`);
  }
  
  // BLIND PASS LOGIC (CORRECTED):
  // The fundamental rule: Blind pass should result in NO NET CHANGE in tile count
  //
  // New semantics: blindPass.count means "select X tiles from hand, keep X tiles from incoming"
  // Example: Player 0 does blind pass with count=1 (select 1, keep 1)
  //   - Player 0 selects 1 tile from hand to pass
  //   - Player 3 (source) sends 3 tiles to Player 0
  //   - Player 0 randomly keeps 1 of those 3 tiles
  //   - Player 0 forwards the other 2 tiles to Player 1 (target)
  //   - Total sent by Player 0: 1 selected tile (to target)
  //   - Total received by Player 0: 1 kept tile
  //   - Net change for Player 0: -1 + 1 = 0 tiles ✓
  //   - Player 1 receives: 3 tiles (from Player 0) + 2 forwarded tiles = 5 tiles total
  //
  // Wait, that's wrong! If Player 0 only sends 1 selected tile to Player 1, then Player 1 only gets 1 tile from Player 0's "selected"
  // But Player 1 should get Player 0's selected tiles (1) plus any tiles that Player 3 forwarded through Player 0 (2)
  //
  // Let me re-think this:
  // - Player 0 selects X tiles → these go to Player 1
  // - Player 3 sends 3 tiles to Player 0
  // - Player 0 keeps X of those 3, forwards (3-X) to Player 1
  // - Player 1 receives: X (from P0 selected) + (3-X) (forwarded from P3) = 3 tiles total ✓
  // - Player 0 net: -X (selected) + X (kept) = 0 ✓
  //
  // The algorithm:
  // 1. Everyone passes their selected tiles to a staging area
  // 2. Process blind passes: determine what to keep vs forward
  // 3. Distribute final tiles to everyone
  
  // Step 1: Collect everyone's selected tiles (staged for passing)
  const staged: Record<PlayerId, Tile[]> = {
    0: [], 1: [], 2: [], 3: []
  };
  
  for (let pid = 0; pid < 4; pid++) {
    const playerId = pid as PlayerId;
    const playerState = newCharleston.playerStates[playerId];
    staged[playerId] = [...playerState.selectedTiles];
    console.log(`[Charleston] Player ${pid} selected ${staged[playerId].length} tiles:`, staged[playerId]);
  }
  
  // Step 2: Determine blind pass decisions (what to keep vs forward)
  // Resolve circular dependencies by iterating until forwarded tiles stabilize.
  console.log('[Charleston] === STEP 2: Processing blind pass decisions (iterative) ===');
  const keptTiles: Record<PlayerId, Tile[]> = { 0: [], 1: [], 2: [], 3: [] };
  let forwardedTiles: Record<PlayerId, Tile[]> = { 0: [], 1: [], 2: [], 3: [] };

  // Helper to stringify forwarded state for comparison
  const fwdState = (f: Record<PlayerId, Tile[]>) => JSON.stringify({
    0: f[0], 1: f[1], 2: f[2], 3: f[3]
  });

  // We use deterministic selection: keep first N tiles from incoming (staged first, then forwarded)
  // This guarantees convergence and zero net change while respecting counts.
  const maxIterations = 8;
  for (let iter = 0; iter < maxIterations; iter++) {
    const prev = fwdState(forwardedTiles);
    // Reset kept and next-forwarded each iteration
    keptTiles[0] = []; keptTiles[1] = []; keptTiles[2] = []; keptTiles[3] = [];
    const nextForwarded: Record<PlayerId, Tile[]> = { 0: [], 1: [], 2: [], 3: [] };

    for (let pid = 0; pid < 4; pid++) {
      const playerId = pid as PlayerId;
      const playerState = newCharleston.playerStates[playerId];
      const sourcePlayer = getPassSource(playerId, phase);
      const incomingTiles: Tile[] = [...staged[sourcePlayer], ...forwardedTiles[sourcePlayer]];

      const keepCount = (playerState.blindPass?.enabled)
        ? (playerState.blindPass.count)
        : 3;

      // Deterministically keep the first keepCount tiles (staged-first ordering)
      const keep = incomingTiles.slice(0, Math.min(keepCount, incomingTiles.length));
      const forward = incomingTiles.slice(keep.length);
      keptTiles[playerId].push(...keep);
      nextForwarded[playerId].push(...forward);

      console.log(`[Charleston][it${iter}] P${pid} incoming=${incomingTiles.length} keep=${keep.length} fwd=${forward.length}`);
    }

    forwardedTiles = nextForwarded;
    const curr = fwdState(forwardedTiles);
    if (curr === prev) {
      console.log('[Charleston] Forwarded tiles stabilized after', iter + 1, 'iterations');
      break;
    }
    if (iter === maxIterations - 1) {
      console.warn('[Charleston] Forwarded tiles did not fully stabilize, proceeding with last state');
    }
  }
  
  // Step 2b: Final receiving is simply what each player kept
  // (keptTiles already includes both selected tiles from source AND any forwarded tiles from source)
  console.log('[Charleston] === STEP 2b: Final receiving (what each player kept) ===');
  const finalReceiving: Record<PlayerId, Tile[]> = {
    0: [...keptTiles[0]],
    1: [...keptTiles[1]],
    2: [...keptTiles[2]],
    3: [...keptTiles[3]]
  };
  
  for (let pid = 0; pid < 4; pid++) {
    const playerId = pid as PlayerId;
    const sourcePlayer = getPassSource(playerId, phase);
    const sourcePlayerState = newCharleston.playerStates[sourcePlayer];
    
    console.log(`[Charleston] Player ${pid} FINAL RECEIVING: ${finalReceiving[playerId].length} tiles total:`, finalReceiving[playerId]);
    
    if (sourcePlayerState.blindPass?.enabled) {
      console.log(`[Charleston] Player ${pid} receives from BLIND-PASS source ${sourcePlayer}:`);
      console.log(`  - Source selected: ${sourcePlayerState.selectedTiles.length} tiles`);
      console.log(`  - Source forwarded: ${forwardedTiles[sourcePlayer].length} tiles`);
      console.log(`  - This player receives: ${finalReceiving[playerId].length} tiles`);
    }
  }


  
  // Step 3: Remove selected tiles from hands
  console.log('[Charleston] === STEP 3: Removing selected tiles from hands ===');
  for (let pid = 0; pid < 4; pid++) {
    const playerId = pid as PlayerId;
    const playerState = newCharleston.playerStates[playerId];
    const hand = newState.players[playerId].hand;
    const initialCount = hand.length;
    
    console.log(`[Charleston] Player ${pid} removing ${playerState.selectedTiles.length} selected tiles from hand of ${initialCount}`);
    
    for (const tile of playerState.selectedTiles) {
      const idx = hand.indexOf(tile);
      if (idx >= 0) {
        hand.splice(idx, 1);
      } else {
        console.error(`[Charleston] Player ${playerId} tried to pass tile ${tile} but doesn't have it in hand!`);
      }
    }
    console.log(`[Charleston] Player ${pid} after removing selected tiles: ${hand.length} tiles (removed ${initialCount - hand.length})`);
  }
  
  // Step 4: Add final receiving tiles to hands
  console.log('[Charleston] === STEP 4: Adding final receiving tiles to hands ===');
  for (let pid = 0; pid < 4; pid++) {
    const playerId = pid as PlayerId;
    const beforeAdd = newState.players[playerId].hand.length;
    newState.players[playerId].hand.push(...finalReceiving[playerId]);
    const afterAdd = newState.players[playerId].hand.length;
    const netChange = afterAdd - initialCounts[playerId];
    console.log(`[Charleston] Player ${pid} final hand count: ${afterAdd} tiles`);
    console.log(`[Charleston] Player ${pid} journey: ${initialCounts[playerId]} initial -> ${beforeAdd} after removal -> ${afterAdd} after receiving`);
    console.log(`[Charleston] Player ${pid} net change from initial: ${netChange} (should be 0)`);
    
    if (netChange !== 0) {
      console.error(`[Charleston] *** ERROR: Player ${pid} has net change of ${netChange} tiles! ***`);
    }
  }
  
  // Final validation summary
  console.log('[Charleston] === PASS EXECUTION COMPLETE ===');
  console.log(`[Charleston] Phase: ${phase} -> ${getNextPhase(phase)}`);
  const totalTilesBefore = Object.values(initialCounts).reduce((sum, count) => sum + count, 0);
  const totalTilesAfter = [0, 1, 2, 3].reduce((sum, pid) => sum + newState.players[pid as PlayerId].hand.length, 0);
  console.log(`[Charleston] Total tiles in game: ${totalTilesBefore} -> ${totalTilesAfter} (should be unchanged)`);
  if (totalTilesBefore !== totalTilesAfter) {
    console.error(`[Charleston] *** CRITICAL ERROR: Total tiles changed from ${totalTilesBefore} to ${totalTilesAfter}! ***`);
  }
  
  // Track incoming tiles for each player (what they actually received)
  newCharleston.incomingTiles = finalReceiving;
  
  // Reset player states for next pass
  for (let pid = 0; pid < 4; pid++) {
    const playerId = pid as PlayerId;
    newCharleston.playerStates[playerId] = {
      selectedTiles: [],
      ready: false
    };
  }
  
  // Move to next phase
  newCharleston.passNumber++;
  newCharleston.phase = getNextPhase(phase);
  
  return newState;
}

/**
 * Get the next Charleston phase
 */
function getNextPhase(currentPhase: CharlestonPhase): CharlestonPhase {
  const sequence: CharlestonPhase[] = [
    'pass-right',
    'pass-across',
    'pass-left',
    'vote',
    'pass-left-2',
    'pass-across-2',
    'pass-right-2',
    'courtesy',
    'complete'
  ];
  
  const currentIndex = sequence.indexOf(currentPhase);
  if (currentIndex === -1 || currentIndex === sequence.length - 1) {
    return 'complete';
  }
  
  return sequence[currentIndex + 1];
}

/**
 * Handle a player's vote
 */
export function handleCharlestonVote(
  state: GameState,
  playerId: PlayerId,
  vote: 'yes' | 'no'
): { success: boolean; error?: string } {
  if (!state.charleston || state.charleston.phase !== 'vote') {
    return { success: false, error: 'Not in voting phase' };
  }
  
  const playerState = state.charleston.playerStates[playerId];
  playerState.vote = vote;
  playerState.voteSubmitted = false; // Vote is live, can be changed
  
  return { success: true };
}

/**
 * Submit (lock in) a player's vote
 */
export function handleCharlestonVoteSubmit(
  state: GameState,
  playerId: PlayerId
): { success: boolean; error?: string } {
  if (!state.charleston || state.charleston.phase !== 'vote') {
    return { success: false, error: 'Not in voting phase' };
  }
  
  const playerState = state.charleston.playerStates[playerId];
  if (!playerState.vote) {
    return { success: false, error: 'Must select a vote before submitting' };
  }
  
  playerState.voteSubmitted = true;
  playerState.ready = true;
  
  return { success: true };
}

/**
 * Check if voting is complete and tally results
 */
export function tallyVotes(charleston: CharlestonState): { yes: number; no: number; complete: boolean } {
  let yes = 0;
  let no = 0;
  let submitted = 0;
  
  for (const playerState of Object.values(charleston.playerStates)) {
    if (playerState.voteSubmitted && playerState.vote) {
      submitted++;
      if (playerState.vote === 'yes') yes++;
      if (playerState.vote === 'no') no++;
    }
  }
  
  return { yes, no, complete: submitted === 4 };
}

/**
 * Process vote results and determine next phase
 */
export function processVoteResults(state: GameState): GameState {
  if (!state.charleston || state.charleston.phase !== 'vote') {
    return state;
  }
  
  const { yes, no } = tallyVotes(state.charleston);
  
  // Store vote results
  state.charleston.votes = { yes, no };
  
  // If 3+ players vote NO (don't want second Charleston), skip to courtesy pass
  // Otherwise (3+ want it or split vote), proceed with second Charleston
  if (no >= 1) {
    state.charleston.phase = 'courtesy';
  } else {
    state.charleston.phase = 'pass-left-2';
  }
  
  // Reset player states
  for (let pid = 0; pid < 4; pid++) {
    const playerId = pid as PlayerId;
    state.charleston.playerStates[playerId] = {
      selectedTiles: [],
      ready: false
    };
  }
  
  return state;
}

/**
 * Handle courtesy pass proposal
 */
export function handleCourtesyProposal(
  state: GameState,
  playerId: PlayerId,
  tiles: Tile[],
  targetPlayer: PlayerId
): { success: boolean; error?: string } {
  if (!state.charleston || state.charleston.phase !== 'courtesy') {
    return { success: false, error: 'Not in courtesy pass phase' };
  }
  
  if (tiles.length > 3) {
    return { success: false, error: 'Cannot offer more than 3 tiles' };
  }
  
  // Validate jokers
  if (tiles.some(t => t === 'J')) {
    return { success: false, error: 'Jokers cannot be passed' };
  }
  
  // Validate tile ownership
  const playerHand = state.players[playerId].hand;
  for (const tile of tiles) {
    if (!playerHand.includes(tile)) {
      return { success: false, error: `Tile ${tile} not in hand` };
    }
  }
  
  // Update player state
  state.charleston.playerStates[playerId].courtesyOffer = {
    tiles,
    targetPlayer
  };
  state.charleston.playerStates[playerId].selectedTiles = tiles;
  
  return { success: true };
}

/**
 * Execute courtesy pass
 */
export function executeCourtesyPass(state: GameState): GameState {
  if (!state.charleston || state.charleston.phase !== 'courtesy') {
    return state;
  }
  
  const newState = JSON.parse(JSON.stringify(state)) as GameState;
  const charleston = newState.charleston!;
  
  // Find mutual trade agreements
  const trades: Array<{ player1: PlayerId; player2: PlayerId }> = [];
  
  for (let pid = 0; pid < 4; pid++) {
    const p1 = pid as PlayerId;
    const offer1 = charleston.playerStates[p1].courtesyOffer;
    
    if (offer1 && offer1.tiles.length > 0) {
      const p2 = offer1.targetPlayer;
      const offer2 = charleston.playerStates[p2].courtesyOffer;
      
      // Check if it's a mutual trade
      if (offer2 && offer2.targetPlayer === p1 && offer2.tiles.length === offer1.tiles.length) {
        // Avoid duplicate trades
        const alreadyTraded = trades.some(t => 
          (t.player1 === p1 && t.player2 === p2) || 
          (t.player1 === p2 && t.player2 === p1)
        );
        
        if (!alreadyTraded) {
          trades.push({ player1: p1, player2: p2 });
        }
      }
    }
  }
  
  // Execute trades
  for (const trade of trades) {
    const p1 = trade.player1;
    const p2 = trade.player2;
    
    const tiles1 = charleston.playerStates[p1].courtesyOffer!.tiles;
    const tiles2 = charleston.playerStates[p2].courtesyOffer!.tiles;
    
    // Remove tiles from hands
    for (const tile of tiles1) {
      const idx = newState.players[p1].hand.indexOf(tile);
      if (idx >= 0) newState.players[p1].hand.splice(idx, 1);
    }
    
    for (const tile of tiles2) {
      const idx = newState.players[p2].hand.indexOf(tile);
      if (idx >= 0) newState.players[p2].hand.splice(idx, 1);
    }
    
    // Add tiles to hands
    newState.players[p1].hand.push(...tiles2);
    newState.players[p2].hand.push(...tiles1);
  }
  
  // Mark Charleston as complete
  charleston.phase = 'complete';
  charleston.completed = true;
  newState.phase = 'play'; // Move to play phase
  
  return newState;
}

/**
 * Get instructions message for current phase
 */
export function getPhaseInstructions(phase: CharlestonPhase): string {
  const messages: Record<CharlestonPhase, string> = {
    'pass-right': 'Pass 1: Select 3 tiles to pass RIGHT',
    'pass-across': 'Pass 2: Select 3 tiles to pass ACROSS',
    'pass-left': 'Pass 3: Select 3 tiles to pass LEFT (Blind Pass available)',
    'vote': 'Vote: Do you want a second Charleston?',
    'pass-left-2': 'Pass 4: Select 3 tiles to pass LEFT',
    'pass-across-2': 'Pass 5: Select 3 tiles to pass ACROSS',
    'pass-right-2': 'Pass 6: Select 3 tiles to pass RIGHT (Blind Pass available)',
    'courtesy': 'Courtesy Pass: Offer 0-3 tiles to trade with another player',
    'complete': 'Charleston complete!'
  };
  
  return messages[phase] || '';
}

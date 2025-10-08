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
  blindPass?: { enabled: boolean; count: 1 | 2 | 3 }
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
  const canBlindPass = phase === 'pass-left' || phase === 'pass-right-2';
  if (blindPass && !canBlindPass) {
    return { success: false, error: 'Blind pass only allowed on pass 3 and 6' };
  }
  
  // Validate tile count
  if (blindPass && blindPass.enabled) {
    const ownTilesCount = 3 - blindPass.count;
    if (tiles.length !== ownTilesCount) {
      return { success: false, error: `Must select ${ownTilesCount} tiles when blind passing ${blindPass.count}` };
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
  
  // First, collect what each player is sending
  const outgoing: Record<PlayerId, Tile[]> = {
    0: [], 1: [], 2: [], 3: []
  };
  
  for (let pid = 0; pid < 4; pid++) {
    const playerId = pid as PlayerId;
    const playerState = newCharleston.playerStates[playerId];
    outgoing[playerId] = [...playerState.selectedTiles];
  }
  
  // Handle blind passes - collect incoming tiles first
  const incoming: Record<PlayerId, Tile[]> = {
    0: [], 1: [], 2: [], 3: []
  };
  
  for (let pid = 0; pid < 4; pid++) {
    const playerId = pid as PlayerId;
    const sourcePlayer = getPassSource(playerId, phase);
    incoming[playerId] = [...outgoing[sourcePlayer]];
  }
  
  // Now process each player's pass
  for (let pid = 0; pid < 4; pid++) {
    const playerId = pid as PlayerId;
    const playerState = newCharleston.playerStates[playerId];
    const targetPlayer = getPassTarget(playerId, phase);
    
    // Remove selected tiles from hand
    const hand = newState.players[playerId].hand;
    for (const tile of playerState.selectedTiles) {
      const idx = hand.indexOf(tile);
      if (idx >= 0) {
        hand.splice(idx, 1);
      }
    }
    
    // Handle blind pass
    if (playerState.blindPass?.enabled && playerState.blindPass.count) {
      const blindCount = playerState.blindPass.count;
      const incomingTiles = incoming[playerId];
      
      // Randomly select tiles from incoming to keep
      const tilesToKeep: Tile[] = [];
      const availableIncoming = [...incomingTiles];
      
      for (let i = 0; i < blindCount; i++) {
        if (availableIncoming.length > 0) {
          const randomIdx = Math.floor(Math.random() * availableIncoming.length);
          tilesToKeep.push(availableIncoming[randomIdx]);
          availableIncoming.splice(randomIdx, 1);
        }
      }
      
      // Add kept tiles to hand
      newState.players[playerId].hand.push(...tilesToKeep);
      
      // Pass remaining incoming tiles + selected tiles to target
      const tilesToPass = [...availableIncoming, ...playerState.selectedTiles];
      newState.players[targetPlayer].hand.push(...tilesToPass);
    } else {
      // Normal pass - just add outgoing tiles to target
      newState.players[targetPlayer].hand.push(...playerState.selectedTiles);
    }
  }
  
  // Store incoming tiles for reference
  newCharleston.incomingTiles = incoming;
  
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
  
  // Majority vote (>=3 yes votes) means second Charleston happens
  if (yes >= 3) {
    state.charleston.phase = 'pass-left-2';
  } else {
    state.charleston.phase = 'courtesy';
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

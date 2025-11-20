// Create a new game (alias for startNewGame)
export function createGame(clientSeed: string, serverSecret: string, dealer: PlayerId = 0, options?: Partial<GameState>): GameState {
  const state = startNewGame(clientSeed, serverSecret, dealer);
  if (options) {
    Object.assign(state, options);
  }
  return state;
}

// Apply a move (alias for processMove)
export function applyMove(state: GameState, move: Move): { state?: GameState; error?: any } {
  try {
    const newState = processMove(state, move);
    return { state: newState };
  } catch (error) {
    return { error };
  }
}

// Get a snapshot of the game state
export function getGameState(state: GameState): GameState {
  // For now, just return the state object
  return state;
}
/**
 * Main American Mahjong game engine
 */
import { GameState, PlayerId, Tile, Move, PlayerState, Exposure } from './types';
import { DeterministicRNG } from './rng';
import { setupGame, createGameplayWall, drawFromWall } from './wall';
import { create2024AmericanRuleCard } from './rulecard';
// Charleston logic is now in charleston-manager.ts
import { validateMove, validateDeadHand } from './validation';
import { parseHandPattern, matchesHandPattern } from './pattern-matcher';
import handsData from '../nmjl_mahjong_hands_filled.json';

export function startNewGame(clientSeed: string, serverSecret: string, dealer: PlayerId = 0): GameState {
  const rng = new DeterministicRNG(clientSeed, serverSecret);
  const ruleCard = create2024AmericanRuleCard();
  const { hands, gameWalls, dice } = setupGame(rng, dealer);

  // Initialize player states
  const players: Record<PlayerId, PlayerState> = {
    0: { hand: hands[0], melds: [], exposures: [], isReady: false, isDead: false, score: 0 },
    1: { hand: hands[1], melds: [], exposures: [], isReady: false, isDead: false, score: 0 },
    2: { hand: hands[2], melds: [], exposures: [], isReady: false, isDead: false, score: 0 },
    3: { hand: hands[3], melds: [], exposures: [], isReady: false, isDead: false, score: 0 }
  };

  return {
    id: Math.random().toString(36).slice(2),
    phase: 'charleston',
    players,
    dealer,
    currentPlayer: dealer,
    wall: gameWalls.walls.flatMap(w => w.tiles),
    wallIndex: 0,
    deadWall: [],
    reservedTiles: gameWalls.walls[dealer].reserved,
    discardPile: [],
    pendingClaims: [],
    charleston: undefined,
    options: {
      ruleCard
    },
    logs: [],
    dice
  };
}

export function processMove(state: GameState, move: Move): GameState {
  // Validate move
  const result = validateMove(state, move);
  if (!result.valid) {
    throw new Error(result.error?.message || 'Invalid move');
  }

  // Create a mutable copy
  const newState = JSON.parse(JSON.stringify(state)) as GameState;

  // Apply move based on type
  switch (move.type) {
    case 'selectHand':
      processSelectHand(newState, move);
      break;
    case 'drawTile':
      processDrawTile(newState, move);
      break;
    case 'discardTile':
      processDiscardTile(newState, move);
      break;
    case 'claimDiscard':
      processClaimDiscard(newState, move);
      break;
    case 'passClaim':
      processPassClaim(newState, move);
      break;
      case 'exchangeJoker':
        processExchangeJoker(newState, move);
        break;
    case 'winGame':
      processWinGame(newState, move);
      break;
    // ... other move types handled elsewhere
  }

  // Log move
  newState.logs.push(move);
  
  return newState;
}

/**
 * Get next player counter-clockwise from current player
 */
export function getNextPlayer(currentPlayer: PlayerId): PlayerId {
  return ((currentPlayer - 1 + 4) % 4) as PlayerId;
}

/**
 * Process hand selection
 */
function processSelectHand(state: GameState, move: { type: 'selectHand'; player: PlayerId; handIndex: number }) {
  const player = state.players[move.player];
  if (!player) throw new Error('Invalid player');
  
  // Validate hand index
  if (move.handIndex < 0 || move.handIndex >= state.options.ruleCard.patterns.length) {
    throw new Error('Invalid hand index');
  }
  
  player.selectedHandIndex = move.handIndex;
}

/**
 * Process drawing a tile from the wall
 */
function processDrawTile(state: GameState, move: { type: 'drawTile'; player: PlayerId }) {
  if (state.phase !== 'play') {
    throw new Error('Can only draw during play phase');
  }
  
  if (move.player !== state.currentPlayer) {
    throw new Error('Not your turn');
  }
  
  const player = state.players[move.player];
  const { tile, newIndex } = drawFromWall(state.wall, state.wallIndex);
  
  if (!tile) {
    // Wall exhausted - game is a draw
    state.isDraw = true;
    state.phase = 'complete';
    return;
  }
  
  player.hand.push(tile);
  state.wallIndex = newIndex;
  
  // Check for automatic win after drawing
  if (checkWin(state, move.player)) {
    state.winner = move.player;
    state.phase = 'complete';
  }
}

/**
 * Process discarding a tile
 */
function processDiscardTile(state: GameState, move: { type: 'discardTile'; player: PlayerId; tile: Tile }) {
  if (state.phase !== 'play') {
    throw new Error('Can only discard during play phase');
  }
  
  if (move.player !== state.currentPlayer) {
    throw new Error('Not your turn');
  }
  
  const player = state.players[move.player];
  const tileIndex = player.hand.indexOf(move.tile);
  
  if (tileIndex === -1) {
    throw new Error('Tile not in hand');
  }
  
  // Remove tile from hand
  player.hand.splice(tileIndex, 1);
  
  // Add to discard pile
  state.discardPile.push({ player: move.player, tile: move.tile });
  
  // Set as current discard (claimable)
  state.currentDiscard = { player: move.player, tile: move.tile };
  
  // Clear pending claims from previous discard
  state.pendingClaims = [];
  
  // Note: Turn doesn't advance yet - waiting for claim window
  // Server should handle claim timeout and advance turn if no claims
}

/**
 * Process claiming a discarded tile
 */
function processClaimDiscard(state: GameState, move: { type: 'claimDiscard'; player: PlayerId; exposureTiles: Tile[] }) {
  if (state.phase !== 'play') {
    throw new Error('Can only claim during play phase');
  }
  
  if (!state.currentDiscard) {
    throw new Error('No tile to claim');
  }
  
  if (move.player === state.currentDiscard.player) {
    throw new Error('Cannot claim your own discard');
  }
  
  const player = state.players[move.player];
  const claimedTile = state.currentDiscard.tile;
  
  // Validate exposure tiles are in player's hand
  for (const tile of move.exposureTiles) {
    if (!player.hand.includes(tile)) {
      throw new Error(`Tile ${tile} not in hand`);
    }
  }
  
  // Validate exposure (this will be implemented in validation.ts)
  // For now, basic validation
  const allExposureTiles = [claimedTile, ...move.exposureTiles];
  
  // Check joker restriction: jokers can only be used in groups of 3+
  const jokerCount = allExposureTiles.filter(t => t === 'J').length;
  if (jokerCount > 0 && allExposureTiles.length < 3) {
    throw new Error('Jokers can only be used in groups of 3 or more tiles');
  }
  
  // Remove exposure tiles from hand
  for (const tile of move.exposureTiles) {
    const idx = player.hand.indexOf(tile);
    player.hand.splice(idx, 1);
  }
  
  // Add claimed tile to hand temporarily (will be part of exposure)
  player.hand.push(claimedTile);
  
  // Create exposure
  const exposure: Exposure = {
    tiles: allExposureTiles,
    claimedTile: claimedTile
  };
  
  player.exposures.push(exposure);
  
  // Remove claimed tile from hand (it's now in exposure)
  const claimedIdx = player.hand.indexOf(claimedTile);
  player.hand.splice(claimedIdx, 1);
  
  // Clear current discard
  state.currentDiscard = undefined;
  
  // Player who claimed becomes current player (must discard)
  state.currentPlayer = move.player;
  
  // Check for win after claiming
  if (checkWin(state, move.player)) {
    state.winner = move.player;
    state.phase = 'complete';
  }
}

/**
 * Process passing on a claim
 */
function processPassClaim(state: GameState, move: { type: 'passClaim'; player: PlayerId }) {
  // Record that this player passed
  // In actual implementation, once all players pass, turn advances
  // This will be managed by the server
}

/**
 * Process joker exchange
 */
function processExchangeJoker(
  state: GameState, 
  move: { 
    type: 'exchangeJoker'; 
    player: PlayerId; 
    targetPlayer: PlayerId; 
    exposureIndex: number; 
    jokerIndex: number; 
    replacementTile: Tile 
  }
) {
  const player = state.players[move.player];
  const targetPlayer = state.players[move.targetPlayer];
  
  if (!player || !targetPlayer) {
    throw new Error('Invalid player');
  }
  
  const exposure = targetPlayer.exposures[move.exposureIndex];
  if (!exposure) {
    throw new Error('Invalid exposure');
  }
  
  // Verify there's a joker at the specified position
  if (exposure.tiles[move.jokerIndex] !== 'J') {
    throw new Error('No joker at specified position');
  }
  
  // Remove replacement tile from player's hand
  const tileIdx = player.hand.indexOf(move.replacementTile);
  if (tileIdx === -1) {
    throw new Error('Replacement tile not in hand');
  }
  player.hand.splice(tileIdx, 1);
  
  // Add joker to player's hand
  player.hand.push('J');
  
  // Replace joker in exposure with natural tile
  exposure.tiles[move.jokerIndex] = move.replacementTile;
}

/**
 * Process automatic win declaration
 */
function processWinGame(state: GameState, move: { type: 'winGame'; player: PlayerId }) {
  if (!checkWin(state, move.player)) {
    throw new Error('Invalid win - hand does not match selected pattern');
  }
  
  state.winner = move.player;
  state.phase = 'complete';
}

/**
 * Advance turn to next player (counter-clockwise)
 */
export function advanceTurn(state: GameState): void {
  state.currentPlayer = getNextPlayer(state.currentPlayer);
  state.currentDiscard = undefined;
}

export function checkWin(state: GameState, player: PlayerId): boolean {
  const playerState = state.players[player];
  if (!playerState) return false;
  
  // Must have selected a hand
  if (playerState.selectedHandIndex === undefined) return false;
  
  // Build a flat list of all hands from JSON to find the selected one
  const allHands: { index: number; name: string; category: string; sections: string[] }[] = [];
  let currentIndex = 0;
  
  const categories = Object.keys(handsData);
  for (const category of categories) {
    const handsInCategory = handsData[category as keyof typeof handsData];
    for (const [handName, sections] of Object.entries(handsInCategory)) {
      allHands.push({
        index: currentIndex++,
        name: handName,
        category,
        sections: sections as string[]
      });
    }
  }
  
  const selectedHand = allHands.find(h => h.index === playerState.selectedHandIndex);
  if (!selectedHand) {
    console.error('Selected hand not found:', playerState.selectedHandIndex);
    return false;
  }
  
  // Collect all tiles: hand + exposures
  const allTiles = [...playerState.hand];
  for (const exposure of playerState.exposures) {
    allTiles.push(...exposure.tiles);
  }
  
  // Must have exactly 14 tiles
  if (allTiles.length !== 14) {
    console.log('Win check failed: not 14 tiles, have', allTiles.length);
    return false;
  }
  
  // Parse the pattern from the selected hand
  const patternGroups = parseHandPattern(selectedHand.sections);
  
  // Use the pattern matcher to validate the hand
  const matches = matchesHandPattern(playerState.hand, playerState.exposures, patternGroups);
  
  if (matches) {
    console.log('WIN! Player', player, 'matched pattern:', selectedHand.name, selectedHand.category);
  } else {
    console.log('No win: tiles do not match pattern', selectedHand.name);
  }
  
  return matches;
}

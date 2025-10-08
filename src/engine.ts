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
import { GameState, PlayerId, Tile, Move } from './types';
import { DeterministicRNG } from './rng';
import { setupGame } from './wall';
import { create2024AmericanRuleCard } from './rulecard';
// Charleston logic is now in charleston-manager.ts
import { validateMove, validateDeadHand } from './validation';

export function startNewGame(clientSeed: string, serverSecret: string, dealer: PlayerId = 0): GameState {
  const rng = new DeterministicRNG(clientSeed, serverSecret);
  const ruleCard = create2024AmericanRuleCard();
  const { hands, gameWalls, dice } = setupGame(rng, dealer);

  // Initialize player states
  const players: Record<PlayerId, any> = {
    0: { hand: hands[0], melds: [], isReady: false, isDead: false, score: 0 },
    1: { hand: hands[1], melds: [], isReady: false, isDead: false, score: 0 },
    2: { hand: hands[2], melds: [], isReady: false, isDead: false, score: 0 },
    3: { hand: hands[3], melds: [], isReady: false, isDead: false, score: 0 }
  };

  return {
    id: Math.random().toString(36).slice(2),
    phase: 'charleston',
    players,
    dealer,
    currentPlayer: dealer,
    wall: gameWalls.walls.flatMap(w => w.tiles),
    deadWall: [],
    reservedTiles: gameWalls.walls[dealer].reserved,
    discardPile: [],
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

  // Apply move (simplified)
  // ...actual move application logic would go here...

  // Log move
  state.logs.push(move);
  return state;
}

export function checkWin(state: GameState, player: PlayerId): boolean {
  // Validate hand against rulecard patterns
  const playerState = state.players[player];
  if (!playerState) return false;
  const ruleCard = state.options?.ruleCard;
  if (!ruleCard) return false;
  // ...implement hand pattern matching logic...
  return false;
}

// path: mahjong-ts/tests/validation.test.ts
import { validateTileOwnership, validateJokerUsage, validateExposure, validateDeadHand, validateMove } from '../src/validation';
import { Meld, GameState, Move, PlayerId } from '../src/types';

const MOCK_RULES = {
  name: 'Test Rules',
  year: 2024,
  patterns: [],
  rules: {
    charlestonPasses: 3,
    allowKongDrawAfter: true,
    allowRobbingKong: true,
    maxJokersPerHand: 8,
    jokerReplacements: true,
    allowChowClaim: true,
    allowKongClaim: true,
    selfDrawBonus: 10,
    flowerBonus: 5,
    minimumPoints: 25
  },
  scoring: {
    basicPoints: 25,
    flowerPoints: 5,
    selfDrawPoints: 10,
    kongPoints: 5,
    claimPenalty: -5
  }
};

const MOCK_CHARLESTON_OPTIONS = {
  secondCharlestonEnabled: true,
  enableCourtesyPass: true,
  enableBlindPass: false,
  enableTileStealing: true
};

const createMockState = (overrides = {}): GameState => ({
  id: '1',
  players: {
  0: { hand: [], melds: [], isReady: true, isDead: false, score: 0 },
  1: { hand: [], melds: [], isReady: true, isDead: false, score: 0 },
  2: { hand: [], melds: [], isReady: true, isDead: false, score: 0 },
  3: { hand: [], melds: [], isReady: true, isDead: false, score: 0 }
  },
  dealer: 0,
  currentPlayer: 0,
  wall: [],
  deadWall: [],
  reservedTiles: [], // Added required field
  discardPile: [],
  phase: 'play',
  options: {
    charleston: MOCK_CHARLESTON_OPTIONS,
    ruleCard: MOCK_RULES
  },
  logs: [],
  ...overrides
});

describe('validateTileOwnership', () => {
  it('should validate tiles are in hand', () => {
    const hand = ['1B', '2B', '3B'];
    expect(validateTileOwnership(hand, ['1B']).valid).toBe(true);
    expect(validateTileOwnership(hand, ['4B']).valid).toBe(false);
  });
});

describe('validateJokerUsage', () => {
  it('should allow melds with 1 joker', () => {
    const meld: Meld = {
      type: 'pong',
      tiles: ['1B', '1B', 'J'],
      from: 0,
      exposed: false,
      canExchangeJokers: false
    };
    expect(validateJokerUsage(meld).valid).toBe(true);
  });

  it('should not allow jokers in pairs', () => {
    const meld: Meld = {
      type: 'pair',
      tiles: ['1B', 'J'],
      from: 'wall',
      exposed: false,
      canExchangeJokers: false
    };
    expect(validateJokerUsage(meld).valid).toBe(false);
  });

  it('should not allow all jokers', () => {
    const meld: Meld = {
      type: 'pong',
      tiles: ['J', 'J', 'J'],
      from: 0,
      exposed: false,
      canExchangeJokers: false
    };
    expect(validateJokerUsage(meld).valid).toBe(false);
  });
});

describe('validateExposure', () => {
  const mockState = createMockState();

  it('should validate pong with natural tiles', () => {
    const pong: Meld = {
      type: 'pong',
      tiles: ['1B', '1B', '1B'],
      from: 0,
      exposed: false,
      canExchangeJokers: false
    };
    expect(validateExposure(pong, mockState, true).valid).toBe(true);
  });

  it('should validate kong with natural tiles', () => {
    const kong: Meld = {
      type: 'kong',
      tiles: ['1B', '1B', '1B', '1B'],
      from: 0,
      exposed: false,
      canExchangeJokers: false
    };
    expect(validateExposure(kong, mockState, true).valid).toBe(true);
  });

  it('should validate chow with consecutive tiles', () => {
    const chow: Meld = {
      type: 'chow',
      tiles: ['1B', '2B', '3B'],
      from: 0,
      exposed: false,
      canExchangeJokers: false
    };
  expect(validateExposure(chow, mockState, true).valid).toBe(false);
  });

  it('should reject invalid chow sequence', () => {
    const chow: Meld = {
      type: 'chow',
      tiles: ['1B', '3B', '4B'],
      from: 0,
      exposed: false,
      canExchangeJokers: false
    };
    expect(validateExposure(chow, mockState, true).valid).toBe(false);
  });
});

describe('validateDeadHand', () => {
  const player: PlayerId = 0;

  it('should validate hand with correct tile count', () => {
    const state = createMockState({
      players: {
        0: {
          hand: ['1B', '2B', '3B', '4B', '5B', '6B', '7B', '8B', '9B', '1C', '2C', '3C', '4C'],
          melds: [],
          isReady: true,
          isDead: false,
          score: 0
        },
        1: { hand: [], melds: [], isReady: true, isDead: false, score: 0 },
        2: { hand: [], melds: [], isReady: true, isDead: false, score: 0 },
        3: { hand: [], melds: [], isReady: true, isDead: false, score: 0 }
      }
    });
    
    expect(validateDeadHand(state, player).valid).toBe(true);
  });

  it('should reject hand with wrong tile count', () => {
    const state = createMockState({
      players: {
        0: {
          hand: ['1B', '2B', '3B'],
          melds: [],
          isReady: true,
          isDead: false,
          score: 0
        },
        1: { hand: [], melds: [], isReady: true, isDead: false, score: 0 },
        2: { hand: [], melds: [], isReady: true, isDead: false, score: 0 },
        3: { hand: [], melds: [], isReady: true, isDead: false, score: 0 }
      }
    });
    
    expect(validateDeadHand(state, player).valid).toBe(false);
  });
});

describe('validateMove', () => {
  const mockState = createMockState({
    players: {
      0: {
        hand: ['1B', '2B', '3B', '4B', '5B', '6B', '7B', '8B', '9B', '1C', '2C', '3C', '4C'],
        melds: [],
        isReady: true,
        isDead: false,
        score: 0
      },
      1: { hand: [], melds: [], isReady: true, isDead: false, score: 0 },
      2: { hand: [], melds: [], isReady: true, isDead: false, score: 0 },
      3: { hand: [], melds: [], isReady: true, isDead: false, score: 0 }
    },
    wall: ['5C'],
    discardPile: [{
      tile: '1B',
      player: 1
    }]
  });

  it('should validate draw from wall', () => {
    const move: Move = {
      type: 'draw',
      player: 0
    };
    expect(validateMove(mockState, move).valid).toBe(true);
  });

  it('should validate discard of owned tile', () => {
    const state = createMockState({
      ...mockState,
      players: {
        ...mockState.players,
        0: {
          ...mockState.players[0],
          hand: [...mockState.players[0].hand, '5C'] // 14 tiles
        }
      }
    });

    const move: Move = {
      type: 'discard',
      player: 0,
      tile: '5C'
    };
    expect(validateMove(state, move).valid).toBe(true);
  });

  it('should validate claiming last discard', () => {
    const move: Move = {
      type: 'claim',
      player: 0,
      meld: {
        type: 'pong',
        tiles: ['1B', '1B', '1B'],
        from: 1,
        exposed: false,
        canExchangeJokers: false
      }
    };
    expect(validateMove(mockState, move).valid).toBe(true);
  });
});
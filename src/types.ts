// path: mahjong-ts/src/types.ts
/**
 * Common TypeScript types for American Mahjong engine
 */

import { CharlestonState } from './charleston';

// American Mahjong uses 152 tiles total
export type Tile = string; 
// Format: 
// - Number tiles: '1C', '2C', ..., '9C' (Craks), '1B', '2B', ..., '9B' (Bams), '1D', '2D', ..., '9D' (Dots)
// - Dragons: 'RD' (Red), 'GD' (Green), 'WD' (White/Soap)
// - Winds: 'N', 'E', 'S', 'W'
// - Flowers: 'F1', 'F2', ..., 'F8' 
// - Jokers: 'J'

export type PlayerId = 0 | 1 | 2 | 3;

export type TileSuit = 'craks' | 'bams' | 'dots' | 'winds' | 'dragons' | 'flowers' | 'jokers';

// American Mahjong tile categories
export type TileNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type Dragon = 'RD' | 'GD' | 'WD';
export type Wind = 'N' | 'E' | 'S' | 'W';
export type Flower = 'F1' | 'F2' | 'F3' | 'F4' | 'F5' | 'F6' | 'F7' | 'F8';

// Hand categories from American Mahjong card
export type HandCategory = 
  | 'year'           // Year hands (e.g., 2024)
  | '2468'           // Even numbers  
  | 'multiplication' // Mathematical patterns
  | 'quints'         // Five of a kind
  | 'consecutive'    // Runs
  | '13579'          // Odd numbers
  | 'winds-dragons'  // Winds and dragons
  | '369'            // Specific numbers
  | 'singles-pairs'; // No jokers allowed

export interface Exposure {
  tiles: Tile[]; // Tiles in this exposure (including claimed tile)
  claimedTile?: Tile; // The tile that was claimed from another player
  sectionIndex?: number; // Which section of their selected hand this matches
}

export interface PlayerState {
  hand: Tile[];
  melds: Meld[];
  exposures: Exposure[]; // Visible exposed sections
  selectedHandIndex?: number; // Index into ruleCard.patterns for their chosen hand
  isReady: boolean;
  isDead: boolean;
  score: number;
}

export interface GameState {
  id: string;
  phase: 'init' | 'charleston' | 'play' | 'complete';
  players: Record<PlayerId, PlayerState>;
  dealer: PlayerId;
  currentPlayer: PlayerId;
  wall: Tile[]; // Remaining tiles to draw from (shuffled after Charleston)
  wallIndex: number; // Current position in wall for drawing
  deadWall: Tile[];
  reservedTiles: Tile[]; // Reserved tiles from dice roll
  discardPile: Array<{ player: PlayerId; tile: Tile }>;
  currentDiscard?: { player: PlayerId; tile: Tile }; // Most recent discard that can be claimed
  pendingClaims: Array<{ player: PlayerId; exposureTiles: Tile[] }>; // Players who want to claim current discard
  lastAction?: {
    type: string;
    player: PlayerId;
    tile?: Tile;
  };
  charleston?: CharlestonState;
  options: {
    ruleCard: RuleCard;
  };
  logs: Move[];
  dice?: number; // The dice roll for wall breaking
  winner?: PlayerId; // Set when game is won
  isDraw?: boolean; // Set when game ends in draw
}
export type Meld = {
  tiles: Tile[];
  type: 'pong' | 'kong' | 'chow' | 'pair' | 'quint' | 'exposed-kong';
  from: PlayerId | 'wall';
  exposed: boolean; // Whether this meld is face-up
  canExchangeJokers: boolean; // Whether jokers in this meld can be exchanged
};

// Hand section represents one group of tiles that must be the same suit
export type HandSection = {
  pattern: string; // e.g., "222", "FFFF", "2222 4444"
  tiles: string[]; // Parsed individual tile requirements
  allowsFlowers: boolean; // Whether this section can contain flowers
  allowsDragons: boolean; // Whether this section can contain dragons
  allowsWinds: boolean; // Whether this section can contain winds
  mustBeSameSuit: boolean; // Whether all tiles in this section must be same suit
};

// Suit constraint between sections
export type SuitConstraint = {
  sections: number[]; // Which section indices this constraint applies to
  type: 'same' | 'different'; // Whether sections must be same or different suits
};

// Updated HandPattern for JSON-based system
export type HandPattern = {
  name: string;
  category: HandCategory;
  points: number;
  isOpen: boolean; // X = open (can call), C = closed (cannot call)
  pattern: string; // The original pattern description from JSON
  sections: HandSection[]; // Parsed sections from JSON
  suitConstraints: SuitConstraint[]; // Rules for suit relationships between sections
  allowedJokers: number;
  specialRules?: {
    noJokers?: boolean; // Singles and pairs restriction
    consecutiveRun?: boolean; // Whether this is a consecutive number pattern
    windsDragonsOnly?: boolean; // Whether only winds/dragons allowed
  };
};

export type RuleCard = {
  name: string;
  year: number;
  patterns: HandPattern[];
  rules: {
    charlestonPasses: number; // number of charleston rounds
    allowKongDrawAfter: boolean; // whether to allow draw after kong
    allowRobbingKong: boolean; // whether to allow robbing kong for mahjong
    maxJokersPerHand: number; // maximum jokers allowed in a hand
    jokerReplacements: boolean; // whether jokers can be replaced with real tiles
    allowChowClaim: boolean; // whether chow claims are allowed
    allowKongClaim: boolean; // whether kong claims are allowed
    selfDrawBonus: number; // bonus points for self-drawn win
    flowerBonus: number; // bonus points per flower
    minimumPoints: number; // minimum points required to win
  };
  scoring: {
    basicPoints: number; // base points for winning
    flowerPoints: number; // points per flower
    selfDrawPoints: number; // additional points for self-draw
    kongPoints: number; // points for each kong
    claimPenalty: number; // penalty points for winning on a claim
  };
};

export type Move =
  | { type: 'draw'; player: PlayerId }
  | { type: 'discard'; player: PlayerId; tile: Tile }
  | { type: 'charlestonPass'; player: PlayerId; to: PlayerId; tiles: Tile[] }
  | { type: 'pass'; player: PlayerId }
  | { type: 'claim'; player: PlayerId; meld: Meld }
  | { type: 'claimRequest'; player: PlayerId; claimType: 'pong' | 'chow' | 'kong' }
  | { type: 'declareMahjong'; player: PlayerId }
  | { type: 'stopCharleston'; player: PlayerId }
  | { type: 'replaceJoker'; player: PlayerId; meldIndex: number; tile: Tile }
  | { type: 'kong'; player: PlayerId; tiles: Tile[] }
  | { type: 'selectHand'; player: PlayerId; handIndex: number } // Select a hand pattern from rule card
  | { type: 'drawTile'; player: PlayerId } // Draw tile from wall during play phase
  | { type: 'discardTile'; player: PlayerId; tile: Tile } // Discard during play phase
  | { type: 'claimDiscard'; player: PlayerId; exposureTiles: Tile[] } // Claim most recent discard with exposure tiles
  | { type: 'passClaim'; player: PlayerId } // Pass on claiming the current discard
    | { type: 'exchangeJoker'; player: PlayerId; targetPlayer: PlayerId; exposureIndex: number; jokerIndex: number; replacementTile: Tile } // Exchange natural tile for exposed joker
  | { type: 'winGame'; player: PlayerId }; // Automatic win declaration



// path: mahjong-ts/src/charleston-types.ts
// Type definitions for Charleston - logic is in charleston-manager.ts
import { PlayerId, Tile } from './types';

// Charleston phase - tracks the current pass
export type CharlestonPhase = 
  | 'pass-right'      // Pass 1
  | 'pass-across'     // Pass 2
  | 'pass-left'       // Pass 3 (blind pass option)
  | 'vote'            // Vote for Round 2
  | 'pass-left-2'     // Pass 4 (Round 2)
  | 'pass-across-2'   // Pass 5 (Round 2)
  | 'pass-right-2'    // Pass 6 (blind pass option)
  | 'courtesy'        // Courtesy pass
  | 'complete';       // Charleston finished

// Individual player's charleston state
export type CharlestonPlayerState = {
  selectedTiles: Tile[];
  ready: boolean;
  blindPass?: {
    enabled: boolean;
    count: 1 | 2 | 3; // How many tiles to take from incoming
  };
  vote?: 'yes' | 'no';
  voteSubmitted?: boolean; // Whether vote has been locked in
  courtesyOffer?: {
    tiles: Tile[];
    targetPlayer: PlayerId;
  };
};

export type CharlestonState = {
  phase: CharlestonPhase;
  passNumber: number; // 1-6 for tracking which pass we're on
  playerStates: Record<PlayerId, CharlestonPlayerState>;
  // Track incoming tiles for blind pass logic
  incomingTiles?: Record<PlayerId, Tile[]>;
  // Vote tallies
  votes?: {
    yes: number;
    no: number;
  };
  completed: boolean;
};

/**
 * Unit tests for the mahjong engine core.
 */

import { startNewGame, processMove } from '../src/engine';
import { PlayerId, Move } from '../src/types';

describe('American Mahjong Engine', () => {
  it('should start a new game and deal correct tile counts', () => {
    const state = startNewGame('testseed', 'secret', 0);
  // The expected remaining tiles after dealing: 99
  expect(state.wall.length + state.reservedTiles.length).toBe(99);
    for (let pid = 0; pid < 4; pid++) {
      const hand = state.players[pid as PlayerId].hand;
      if (pid === state.dealer) {
        expect(hand.length).toBe(14);
      } else {
        expect(hand.length).toBe(13);
      }
        // No need to set meld properties on hand tiles
    }
  });

  it('should reject invalid moves', () => {
    const state = startNewGame('testseed', 'secret', 0);
    const move: Move = { type: 'discard', player: 0, tile: 'J' };
    // Dealer has 14 tiles, but let's try to discard a tile not in hand
    expect(() => processMove(state, { ...move, tile: 'ZZ' })).toThrow();
  });

  // Add more tests for Charleston, claims, win detection, etc.
});

// path: mahjong-ts/src/validation.ts
import { GameState, Move, PlayerId, Tile, Meld, RuleCard } from './types';

export interface ValidationError {
  code: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: ValidationError;
}

export function validateTileOwnership(hand: Tile[], tiles: Tile[]): ValidationResult {
  for (const tile of tiles) {
    if (!hand.includes(tile)) {
      return {
        valid: false,
        error: {
          code: 'invalid_tile',
          message: `Tile ${tile} not in hand`
        }
      };
    }
  }
  return { valid: true };
}

export function validateJokerUsage(meld: Meld): ValidationResult {
  const jokerCount = meld.tiles.filter(t => t === 'J').length;
  
  // No jokers in the meld
  if (jokerCount === 0) return { valid: true };
  
  // Jokers cannot be used in pairs
  if (meld.type === 'pair') {
    return {
      valid: false,
      error: {
        code: 'invalid_joker_usage',
        message: 'Jokers cannot be used in pairs'
      }
    };
  }
  
  // Cannot be all jokers
  if (jokerCount === meld.tiles.length) {
    return {
      valid: false,
      error: {
        code: 'invalid_joker_usage',
        message: 'Meld cannot consist of only jokers'
      }
    };
  }
  
  return { valid: true };
}

export function validateExposure(meld: Meld, state: GameState, isOpen: boolean): ValidationResult {
  // Check if the hand allows calling (open vs closed)
  if (!isOpen && meld.exposed) {
    return {
      valid: false,
      error: {
        code: 'invalid_claim',
        message: 'Cannot claim tiles for a closed hand'
      }
    };
  }

  switch (meld.type) {
    case 'pong':
      // Must have at least 2 natural tiles plus claimed tile or joker
      const naturalTiles = meld.tiles.filter(t => t !== 'J');
      if (naturalTiles.length < 2) {
        return {
          valid: false,
          error: {
            code: 'invalid_pong',
            message: 'Pong must have at least 2 natural tiles'
          }
        };
      }
      // All natural tiles must be the same
      if (naturalTiles.length > 0 && !naturalTiles.every(t => t === naturalTiles[0])) {
        return {
          valid: false,
          error: {
            code: 'invalid_pong',
            message: 'All natural tiles in pong must be identical'
          }
        };
      }
      break;
      
    case 'kong':
      // Must have at least 3 natural tiles plus claimed tile or joker
      const kongNaturals = meld.tiles.filter(t => t !== 'J');
      if (kongNaturals.length < 3) {
        return {
          valid: false,
          error: {
            code: 'invalid_kong',
            message: 'Kong must have at least 3 natural tiles'
          }
        };
      }
      // All natural tiles must be the same
      if (kongNaturals.length > 0 && !kongNaturals.every(t => t === kongNaturals[0])) {
        return {
          valid: false,
          error: {
            code: 'invalid_kong',
            message: 'All natural tiles in kong must be identical'
          }
        };
      }
      break;

    case 'quint':
      // Five of a kind - requires at least one joker unless all flowers
      const quintNaturals = meld.tiles.filter(t => t !== 'J');
      const jokerCount = meld.tiles.filter(t => t === 'J').length;
      
      if (meld.tiles.length !== 5) {
        return {
          valid: false,
          error: {
            code: 'invalid_quint',
            message: 'Quint must have exactly 5 tiles'
          }
        };
      }
      
      if (jokerCount === 0 && !quintNaturals.every(t => t.startsWith('F'))) {
        return {
          valid: false,
          error: {
            code: 'invalid_quint',
            message: 'Quint requires jokers unless all flowers'
          }
        };
      }
      
      if (quintNaturals.length > 0 && !quintNaturals.every(t => t === quintNaturals[0])) {
        return {
          valid: false,
          error: {
            code: 'invalid_quint',
            message: 'All natural tiles in quint must be identical'
          }
        };
      }
      break;
      
    case 'chow':
      // American Mahjong doesn't traditionally use chows, but if implemented:
      return {
        valid: false,
        error: {
          code: 'invalid_claim_type',
          message: 'Chows cannot be claimed in American Mahjong'
        }
      };
  }
  
  return { valid: true };
}

export function validateDeadHand(state: GameState, player: PlayerId): ValidationResult {
  const playerState = state.players[player];
  
  // Check tile count
  const totalTiles = playerState.hand.length + 
    playerState.melds.reduce((sum, m) => sum + m.tiles.length, 0);
  
  if (totalTiles !== 13 && totalTiles !== 14) {
    return {
      valid: false,
      error: {
        code: 'invalid_tile_count',
        message: `Invalid tile count (${totalTiles}), must be 13 or 14`
      }
    };
  }
  
  // Check exposure validity
  for (const meld of playerState.melds) {
    const exposureResult = validateExposure(meld, state, true); // Default to open for now
    if (!exposureResult.valid) {
      return exposureResult;
    }
  }
  
  return { valid: true };
}

export function validateMove(state: GameState, move: Move): ValidationResult {
  const player = state.players[move.player];
  
  switch (move.type) {
    case 'selectHand':
      if (state.phase !== 'play') {
        return {
          valid: false,
          error: {
            code: 'invalid_phase',
            message: 'Can only select hand during play phase'
          }
        };
      }
      if (move.handIndex < 0 || move.handIndex >= state.options.ruleCard.patterns.length) {
        return {
          valid: false,
          error: {
            code: 'invalid_hand_index',
            message: 'Invalid hand index'
          }
        };
      }
      break;
      
    case 'drawTile':
      if (state.phase !== 'play') {
        return {
          valid: false,
          error: {
            code: 'invalid_phase',
            message: 'Can only draw during play phase'
          }
        };
      }
      if (move.player !== state.currentPlayer) {
        return {
          valid: false,
          error: {
            code: 'not_your_turn',
            message: 'Not your turn'
          }
        };
      }
      if (state.wallIndex >= state.wall.length) {
        return {
          valid: false,
          error: {
            code: 'wall_empty',
            message: 'No tiles left in wall'
          }
        };
      }
      break;
      
    case 'discardTile':
      if (state.phase !== 'play') {
        return {
          valid: false,
          error: {
            code: 'invalid_phase',
            message: 'Can only discard during play phase'
          }
        };
      }
      if (move.player !== state.currentPlayer) {
        return {
          valid: false,
          error: {
            code: 'not_your_turn',
            message: 'Not your turn'
          }
        };
      }
      const ownership = validateTileOwnership(player.hand, [move.tile]);
      if (!ownership.valid) return ownership;
      break;
      
    case 'claimDiscard':
      if (state.phase !== 'play') {
        return {
          valid: false,
          error: {
            code: 'invalid_phase',
            message: 'Can only claim during play phase'
          }
        };
      }
      if (!state.currentDiscard) {
        return {
          valid: false,
          error: {
            code: 'no_discard_to_claim',
            message: 'No tile available to claim'
          }
        };
      }
      if (move.player === state.currentDiscard.player) {
        return {
          valid: false,
          error: {
            code: 'cannot_claim_own',
            message: 'Cannot claim your own discard'
          }
        };
      }
      // Validate exposure tiles ownership
      const exposureOwnership = validateTileOwnership(player.hand, move.exposureTiles);
      if (!exposureOwnership.valid) return exposureOwnership;
      
      // Validate joker restriction
      const allTiles = [state.currentDiscard.tile, ...move.exposureTiles];
      const jokerCount = allTiles.filter(t => t === 'J').length;
      if (jokerCount > 0 && allTiles.length < 3) {
        return {
          valid: false,
          error: {
            code: 'invalid_joker_usage',
            message: 'Jokers can only be used in groups of 3 or more tiles'
          }
        };
      }
      break;
      
    case 'draw':
      if (state.wall.length === 0) {
        return {
          valid: false,
          error: {
            code: 'wall_empty',
            message: 'No tiles left in wall'
          }
        };
      }
      if (player.hand.length !== 13) {
        return {
          valid: false,
          error: {
            code: 'invalid_tile_count',
            message: 'Must have exactly 13 tiles to draw'
          }
        };
      }
      break;
      
    case 'discard':
      if (player.hand.length !== 14) {
        return {
          valid: false,
          error: {
            code: 'invalid_tile_count',
            message: 'Must have 14 tiles to discard'
          }
        };
      }
      const tileOwnership = validateTileOwnership(player.hand, [move.tile]);
      if (!tileOwnership.valid) return tileOwnership;
      break;
      
    case 'claim':
      // Validate claim timing and tile ownership
      const lastDiscard = state.discardPile[state.discardPile.length - 1];
      if (!lastDiscard || lastDiscard.tile !== move.meld.tiles[0]) {
        return {
          valid: false,
          error: {
            code: 'invalid_claim',
            message: 'Can only claim most recently discarded tile'
          }
        };
      }
      
      // Validate the meld structure
      const jokerResult = validateJokerUsage(move.meld);
      if (!jokerResult.valid) return jokerResult;
      
        // Determine if the hand is open or closed
        const ruleCard = state.options?.ruleCard;
        let isOpen = true;
        if (ruleCard) {
          // With JSON-based patterns, we'll default to open (most common case)
          // TODO: Add specific closed hand detection based on pattern analysis
          isOpen = true;
        }
        const exposureResult = validateExposure(move.meld, state, isOpen);
        if (!exposureResult.valid) return exposureResult;
      break;
      
      case 'exchangeJoker':
        if (state.phase !== 'play') {
          return {
            valid: false,
            error: {
              code: 'invalid_phase',
              message: 'Can only exchange jokers during play phase'
            }
          };
        }
      
        // Validate target player
        const targetPlayer = state.players[move.targetPlayer];
        if (!targetPlayer) {
          return {
            valid: false,
            error: {
              code: 'invalid_target',
              message: 'Invalid target player'
            }
          };
        }
      
        // Validate exposure index
        if (move.exposureIndex < 0 || move.exposureIndex >= targetPlayer.exposures.length) {
          return {
            valid: false,
            error: {
              code: 'invalid_exposure',
              message: 'Invalid exposure index'
            }
          };
        }
      
        const targetExposure = targetPlayer.exposures[move.exposureIndex];
      
        // Validate joker index
        if (move.jokerIndex < 0 || move.jokerIndex >= targetExposure.tiles.length) {
          return {
            valid: false,
            error: {
              code: 'invalid_joker_index',
              message: 'Invalid joker position'
            }
          };
        }
      
        // Validate that there's actually a joker at that position
        if (targetExposure.tiles[move.jokerIndex] !== 'J') {
          return {
            valid: false,
            error: {
              code: 'no_joker_at_position',
              message: 'No joker at specified position'
            }
          };
        }
      
        // Validate player has the replacement tile
        const replacementOwnership = validateTileOwnership(player.hand, [move.replacementTile]);
        if (!replacementOwnership.valid) return replacementOwnership;
      
        // Validate replacement tile is not a joker
        if (move.replacementTile === 'J') {
          return {
            valid: false,
            error: {
              code: 'invalid_replacement',
              message: 'Cannot exchange joker for another joker'
            }
          };
        }
      
        // Validate replacement tile matches the pattern
        // The joker should be replaceable by a natural tile that fits the exposure
        // For simplicity, we allow any natural tile for now
        // TODO: Add stricter pattern matching validation
        break;
  }
  
  return { valid: true };
}
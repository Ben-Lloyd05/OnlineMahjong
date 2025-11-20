/**
 * Wall building and dealing mechanics for American Mahjong
 */

import { Tile, PlayerId } from './types';
import { DeterministicRNG } from './rng';
import { createAmericanMahjongTileSet } from './tiles';

export interface Wall {
  tiles: Tile[];
  reserved: Tile[]; // Reserved tiles from dice roll
}

export interface GameWalls {
  walls: Wall[];
  dealingWall: number; // Current wall being used for dealing
  dealingPosition: number; // Position in the current wall
}

/**
 * Creates and shuffles the complete American Mahjong tile set
 */
export function createShuffledTileSet(rng: DeterministicRNG): Tile[] {
  const tiles = createAmericanMahjongTileSet();
  
  // Fisher-Yates shuffle using DeterministicRNG
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  
  return tiles;
}

/**
 * Builds four walls from shuffled tiles
 * Each wall is 19 tiles long and 2 tiles deep (38 tiles total)
 */
export function buildWalls(shuffledTiles: Tile[]): Wall[] {
  if (shuffledTiles.length !== 152) {
    throw new Error(`Expected 152 tiles, got ${shuffledTiles.length}`);
  }

  const walls: Wall[] = [
    { tiles: [], reserved: [] },
    { tiles: [], reserved: [] },
    { tiles: [], reserved: [] },
    { tiles: [], reserved: [] }
  ];
  
  // Each wall gets 38 tiles (19x2)
  const tilesPerWall = 38;
  
  for (let i = 0; i < 4; i++) {
    const start = i * tilesPerWall;
    const end = start + tilesPerWall;
    walls[i].tiles = shuffledTiles.slice(start, end);
  }
  
  return walls;
}

/**
 * Breaks the dealer's wall based on dice roll and reserves tiles
 * East throws dice and counts that many groups of 2 tiles from right end
 */
export function breakWall(walls: Wall[], dice: number, dealer: PlayerId): GameWalls {
  const dealerWall = walls[dealer];
  
  // Reserve dice count of pairs (groups of 2) from right end of dealer wall
  const tilesToReserve = dice * 2;
  const breakPoint = dealerWall.tiles.length - tilesToReserve;
  
  dealerWall.reserved = dealerWall.tiles.slice(breakPoint);
  dealerWall.tiles = dealerWall.tiles.slice(0, breakPoint);
  
  return {
    walls,
    dealingWall: dealer,
    dealingPosition: breakPoint
  };
}

/**
 * Deals tiles according to American Mahjong rules
 * East starts, dealing proceeds to the right
 * Each player gets 3 rounds of 4 tiles (12), then East gets 2 more, others get 1 more
 */
export function dealTiles(gameWalls: GameWalls): { hands: Tile[][], gameWalls: GameWalls } {
  const hands: Tile[][] = [[], [], [], []];
  const { walls, dealingWall } = gameWalls;
  let currentWall = dealingWall;
  
  // Deal 3 groups of 4 tiles to each player
  // East takes first, then player to East's right, etc.
  for (let round = 0; round < 3; round++) {
    for (let playerOffset = 0; playerOffset < 4; playerOffset++) {
      const player = (dealingWall + playerOffset) % 4;
      
      // Take 4 tiles from current wall
      for (let i = 0; i < 4; i++) {
        if (walls[currentWall].tiles.length === 0) {
          // Move to next wall counter-clockwise (left)
          currentWall = (currentWall + 3) % 4;
        }
        const tile = walls[currentWall].tiles.pop()!;
        hands[player].push(tile);
      }
    }
  }
  
  // Final dealing: Dealer gets one extra tile (total 14), others get 13
  for (let i = 0; i < 4; i++) {
    if (walls[currentWall].tiles.length === 0) {
      currentWall = (currentWall + 3) % 4;
    }
    const player = (dealingWall + i) % 4;
    // Dealer gets two tiles in final round, others get one
    if (player === dealingWall) {
      hands[player].push(walls[currentWall].tiles.pop()!);
      if (walls[currentWall].tiles.length === 0) {
        currentWall = (currentWall + 3) % 4;
      }
      hands[player].push(walls[currentWall].tiles.pop()!);
    } else {
      hands[player].push(walls[currentWall].tiles.pop()!);
    }
  }
  
  return {
    hands,
    gameWalls: {
      ...gameWalls,
      dealingWall: currentWall,
      dealingPosition: walls[currentWall].tiles.length
    }
  };
}

/**
 * Rolls two dice using deterministic RNG
 */
export function rollDice(rng: DeterministicRNG): number {
  const die1 = rng.nextInt(6) + 1;
  const die2 = rng.nextInt(6) + 1;
  return die1 + die2;
}

/**
 * Full setup process for American Mahjong game
 */
export function setupGame(rng: DeterministicRNG, dealer: PlayerId): {
  hands: Tile[][];
  gameWalls: GameWalls;
  dice: number;
} {
  // Create and shuffle tiles
  const shuffledTiles = createShuffledTileSet(rng);
  
  // Build walls
  const walls = buildWalls(shuffledTiles);
  
  // Roll dice for wall breaking
  const dice = rollDice(rng);
  
  // Break wall and set up dealing
  const gameWalls = breakWall(walls, dice, dealer);
  
  // Deal tiles to all players
  const { hands, gameWalls: finalGameWalls } = dealTiles(gameWalls);
  
  return {
    hands,
    gameWalls: finalGameWalls,
    dice
  };
}

/**
 * Creates a gameplay wall from remaining tiles after Charleston
 * Shuffles using deterministic RNG for fairness
 */
export function createGameplayWall(remainingTiles: Tile[], rng: DeterministicRNG): Tile[] {
  const wall = [...remainingTiles];
  
  // Fisher-Yates shuffle
  for (let i = wall.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    [wall[i], wall[j]] = [wall[j], wall[i]];
  }
  
  return wall;
}

/**
 * Draws a tile from the wall
 * Returns the tile and updated wall index, or undefined if wall is empty
 */
export function drawFromWall(wall: Tile[], wallIndex: number): { tile?: Tile; newIndex: number } {
  if (wallIndex >= wall.length) {
    return { tile: undefined, newIndex: wallIndex };
  }
  
  return {
    tile: wall[wallIndex],
    newIndex: wallIndex + 1
  };
}
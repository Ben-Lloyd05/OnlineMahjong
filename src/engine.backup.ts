// path: mahjong-ts/src/engine.backup.ts
/**
 * Backup of original engine implementation
 */

import { DeterministicRNG, shuffle } from './rng';
import { buildWalls, breakWall, dealTiles, rollDice } from './wall';
import { GameState, Move, PlayerId, Tile, Meld, HandPattern, RuleCard } from './types';
import { scoreHand, canDeclareMahjong } from './scoring';
import { load2024RuleCard } from './rulecard-parser';
import { randomUUID } from 'crypto';
import { commitServerSeed } from './fairness';
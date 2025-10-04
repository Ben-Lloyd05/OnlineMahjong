// path: mahjong-ts/tests/fairness-system.test.ts
/**
 * Comprehensive tests for provable fairness and audit logging system
 */

import {
  generateServerSeed,
  commitServerSeed,
  verifyCommit,
  generateClientSeed,
  combineSeeds,
  verifiableShuffle,
  verifyTileShuffle,
  hashGameState,
  AuditLogger,
  FairnessManager
} from '../src/fairness';

import { 
  AuditStorage,
  generateStorageConfig
} from '../src/audit-storage';

import { createAmericanMahjongTileSet } from '../src/tiles';

describe('Provable Fairness System', () => {
  let tiles: string[];
  let auditStorage: AuditStorage;

  beforeEach(() => {
    tiles = createAmericanMahjongTileSet();
    
    const config = generateStorageConfig(':memory:', {
      maxLogAge: 1000 * 60 * 60, // 1 hour for tests
      archiveInterval: 0 // Disable auto-archive in tests
    });
    
    auditStorage = new AuditStorage(config);
  });

  describe('Cryptographic Seed System', () => {
    test('should generate valid server seeds', () => {
      const seed = generateServerSeed();
      
      expect(seed).toBeDefined();
      expect(typeof seed).toBe('string');
      expect(seed.length).toBe(64); // 32 bytes = 64 hex chars
      expect(/^[0-9a-f]+$/.test(seed)).toBe(true);
    });

    test('should create and verify seed commitments', () => {
      const serverSeed = generateServerSeed();
      const commitment = commitServerSeed(serverSeed);
      
      expect(commitment).toBeDefined();
      expect(typeof commitment).toBe('string');
      expect(commitment.length).toBe(64); // SHA256 = 64 hex chars
      
      // Verify the commitment
      expect(verifyCommit(commitment, serverSeed)).toBe(true);
      
      // Verify with wrong seed fails
      const wrongSeed = generateServerSeed();
      expect(verifyCommit(commitment, wrongSeed)).toBe(false);
    });

    test('should generate client seeds', () => {
      const clientSeed = generateClientSeed();
      
      expect(clientSeed).toBeDefined();
      expect(typeof clientSeed).toBe('string');
      expect(clientSeed.length).toBe(32); // 16 bytes = 32 hex chars
      expect(/^[0-9a-f]+$/.test(clientSeed)).toBe(true);
    });

    test('should combine seeds deterministically', () => {
      const serverSeed = 'a'.repeat(64);
      const clientSeed = 'b'.repeat(32);
      
      const combined1 = combineSeeds(serverSeed, clientSeed, 0);
      const combined2 = combineSeeds(serverSeed, clientSeed, 0);
      const combined3 = combineSeeds(serverSeed, clientSeed, 1);
      
      expect(combined1).toBe(combined2); // Same inputs = same output
      expect(combined1).not.toBe(combined3); // Different nonce = different output
      expect(combined1.length).toBe(64);
    });

    test('should handle invalid seed inputs gracefully', () => {
      expect(() => verifyCommit('invalid', 'also-invalid')).not.toThrow();
      expect(verifyCommit('invalid', 'also-invalid')).toBe(false);
    });
  });

  describe('Verifiable Tile Shuffling', () => {
    test('should shuffle tiles deterministically', () => {
      const serverSeed = generateServerSeed();
      const clientSeed = generateClientSeed();
      
      const shuffled1 = verifiableShuffle(tiles, serverSeed, clientSeed, 0);
      const shuffled2 = verifiableShuffle(tiles, serverSeed, clientSeed, 0);
      
      expect(shuffled1).toEqual(shuffled2); // Same seeds = same shuffle
      expect(shuffled1.length).toBe(tiles.length);
      expect(shuffled1).not.toEqual(tiles); // Should actually shuffle (very unlikely to be same)
    });

    test('should produce different shuffles with different seeds', () => {
      const serverSeed1 = generateServerSeed();
      const serverSeed2 = generateServerSeed();
      const clientSeed = generateClientSeed();
      
      const shuffled1 = verifiableShuffle(tiles, serverSeed1, clientSeed, 0);
      const shuffled2 = verifiableShuffle(tiles, serverSeed2, clientSeed, 0);
      
      expect(shuffled1).not.toEqual(shuffled2);
    });

    test('should produce different shuffles with different nonces', () => {
      const serverSeed = generateServerSeed();
      const clientSeed = generateClientSeed();
      
      const shuffled1 = verifiableShuffle(tiles, serverSeed, clientSeed, 0);
      const shuffled2 = verifiableShuffle(tiles, serverSeed, clientSeed, 1);
      
      expect(shuffled1).not.toEqual(shuffled2);
    });

    test('should verify shuffles correctly', () => {
      const serverSeed = generateServerSeed();
      const clientSeed = generateClientSeed();
      const nonce = 5;
      
      const shuffled = verifiableShuffle(tiles, serverSeed, clientSeed, nonce);
      
      // Correct verification should pass
      expect(verifyTileShuffle(tiles, shuffled, serverSeed, clientSeed, nonce)).toBe(true);
      
      // Wrong seeds should fail
      const wrongServerSeed = generateServerSeed();
      expect(verifyTileShuffle(tiles, shuffled, wrongServerSeed, clientSeed, nonce)).toBe(false);
      
      const wrongClientSeed = generateClientSeed();
      expect(verifyTileShuffle(tiles, shuffled, serverSeed, wrongClientSeed, nonce)).toBe(false);
      
      // Wrong nonce should fail
      expect(verifyTileShuffle(tiles, shuffled, serverSeed, clientSeed, 99)).toBe(false);
    });

    test('should preserve tile counts during shuffle', () => {
      const serverSeed = generateServerSeed();
      const clientSeed = generateClientSeed();
      
      const shuffled = verifiableShuffle(tiles, serverSeed, clientSeed, 0);
      
      // Count tiles in original and shuffled arrays
      const originalCounts = new Map<string, number>();
      const shuffledCounts = new Map<string, number>();
      
      tiles.forEach(tile => {
        originalCounts.set(tile, (originalCounts.get(tile) || 0) + 1);
      });
      
      shuffled.forEach(tile => {
        shuffledCounts.set(tile, (shuffledCounts.get(tile) || 0) + 1);
      });
      
      expect(shuffledCounts).toEqual(originalCounts);
    });
  });

  describe('Game State Hashing', () => {
    test('should create consistent hashes for identical states', () => {
      const gameState = {
        id: 'test-game',
        phase: 'play' as const,
        players: {
          0: {
            hand: ['1C', '2C', '3C'],
            melds: [],
            isReady: true,
            isDead: false,
            score: 0
          }
        } as Record<0 | 1 | 2 | 3, any>,
        dealer: 0 as const,
        currentPlayer: 0 as const,
        wall: tiles.slice(0, 100),
        deadWall: tiles.slice(100, 114),
        reservedTiles: [],
        discardPile: [],
        lastAction: undefined,
        charleston: undefined,
        options: {
          charleston: {
            passes: 3,
            mustPass: true,
            blindPass: false,
            secondCharlestonEnabled: false,
            enableCourtesyPass: false,
            enableBlindPass: false,
            enableTileStealing: false
          },
          ruleCard: {
            name: 'Test',
            year: 2024,
            patterns: [],
            rules: {
              charlestonPasses: 3,
              allowKongDrawAfter: true,
              allowRobbingKong: false,
              maxJokersPerHand: 8,
              jokerReplacements: true,
              allowChowClaim: false,
              allowKongClaim: true,
              selfDrawBonus: 2,
              flowerBonus: 4,
              minimumPoints: 25
            },
            scoring: {
              basicPoints: 1,
              flowerPoints: 4,
              selfDrawPoints: 2,
              kongPoints: 2,
              claimPenalty: 1
            }
          }
        },
        logs: [],
        dice: 7
      };
      
      const hash1 = hashGameState(gameState);
      const hash2 = hashGameState(gameState);
      
      expect(hash1).toBe(hash2);
      expect(typeof hash1).toBe('string');
      expect(hash1.length).toBe(64);
    });

    test('should create different hashes for different states', () => {
      const baseState = {
        id: 'test-game',
        phase: 'play' as const,
        players: {
          0: {
            hand: ['1C', '2C', '3C'],
            melds: [],
            isReady: true,
            isDead: false,
            score: 0
          }
        } as Record<0 | 1 | 2 | 3, any>,
        dealer: 0 as const,
        currentPlayer: 0 as const,
        wall: tiles.slice(0, 100),
        deadWall: tiles.slice(100, 114),
        reservedTiles: [],
        discardPile: [],
        lastAction: undefined,
        charleston: undefined,
        options: {
          charleston: {
            passes: 3,
            mustPass: true,
            blindPass: false,
            secondCharlestonEnabled: false,
            enableCourtesyPass: false,
            enableBlindPass: false,
            enableTileStealing: false
          },
          ruleCard: {
            name: 'Test',
            year: 2024,
            patterns: [],
            rules: {
              charlestonPasses: 3,
              allowKongDrawAfter: true,
              allowRobbingKong: false,
              maxJokersPerHand: 8,
              jokerReplacements: true,
              allowChowClaim: false,
              allowKongClaim: true,
              selfDrawBonus: 2,
              flowerBonus: 4,
              minimumPoints: 25
            },
            scoring: {
              basicPoints: 1,
              flowerPoints: 4,
              selfDrawPoints: 2,
              kongPoints: 2,
              claimPenalty: 1
            }
          }
        },
        logs: [],
        dice: 7
      };
      
      const modifiedState = {
        ...baseState,
        players: {
          0: {
            ...baseState.players[0],
            hand: ['4C', '5C', '6C'] // Different hand
          }
        } as Record<0 | 1 | 2 | 3, any>
      };
      
      const hash1 = hashGameState(baseState);
      const hash2 = hashGameState(modifiedState);
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Audit Logger', () => {
    let logger: AuditLogger;
    
    beforeEach(() => {
      logger = new AuditLogger('test-game-' + Date.now());
    });

    test('should log actions with proper structure', () => {
      const entry = logger.logAction('tile_drawn', { tile: '1C', player: 'player1' }, 'player1');
      
      expect(entry.id).toBeDefined();
      expect(entry.timestamp).toBeGreaterThan(Date.now() - 1000);
      expect(entry.gameId).toContain('test-game');
      expect(entry.playerId).toBe('player1');
      expect(entry.action).toBe('tile_drawn');
      expect(entry.data).toEqual({ tile: '1C', player: 'player1' });
      expect(entry.signature).toBeDefined();
      expect(entry.signature.length).toBe(64);
    });

    test('should maintain chronological order', () => {
      const entry1 = logger.logAction('action1', {}, 'player1');
      const entry2 = logger.logAction('action2', {}, 'player2');
      const entry3 = logger.logAction('action3', {}, 'player1');
      
      const entries = logger.getEntries();
      
      expect(entries).toHaveLength(3);
      expect(entries[0].timestamp).toBeLessThanOrEqual(entries[1].timestamp);
      expect(entries[1].timestamp).toBeLessThanOrEqual(entries[2].timestamp);
    });

    test('should verify log integrity correctly', () => {
      logger.logAction('action1', { data: 'test1' });
      logger.logAction('action2', { data: 'test2' });
      logger.logAction('action3', { data: 'test3' });
      
      const verification = logger.verifyLogIntegrity();
      
      expect(verification.isValid).toBe(true);
      expect(verification.errors).toHaveLength(0);
    });

    test('should detect tampered entries', () => {
      logger.logAction('action1', { data: 'test1' });
      logger.logAction('action2', { data: 'test2' });
      
      // Tamper with an entry
      const entries = logger.getEntries();
      (entries[0] as any).signature = 'tampered_signature';
      
      // Verification should fail
      const verification = logger.verifyLogIntegrity();
      
      expect(verification.isValid).toBe(false);
      expect(verification.errors.length).toBeGreaterThan(0);
      expect(verification.errors[0]).toContain('Invalid signature');
    });

    test('should export complete log data', () => {
      logger.logAction('action1', { data: 'test1' });
      logger.logAction('action2', { data: 'test2' });
      
      const exported = logger.exportLog();
      const parsed = JSON.parse(exported);
      
      expect(parsed.gameId).toContain('test-game');
      expect(parsed.entries).toHaveLength(2);
      expect(parsed.integrity).toBeDefined();
      expect(parsed.exportedAt).toBeGreaterThan(Date.now() - 1000);
    });

    test('should sanitize sensitive data', () => {
      const sensitiveData = {
        normalData: 'ok',
        password: 'secret123',
        token: 'abc123',
        secret: 'hidden'
      };
      
      const entry = logger.logAction('test', sensitiveData);
      
      expect(entry.data.normalData).toBe('ok');
      expect(entry.data.password).toBeUndefined();
      expect(entry.data.token).toBeUndefined();
      expect(entry.data.secret).toBeUndefined();
    });
  });

  describe('Fairness Manager', () => {
    let manager: FairnessManager;
    
    beforeEach(() => {
      const gameId = 'test-game-' + Date.now();
      const clientSeeds = {
        'player1': generateClientSeed(),
        'player2': generateClientSeed()
      };
      manager = new FairnessManager(gameId, clientSeeds);
    });

    test('should initialize game fairness correctly', () => {
      const commitment = manager.initializeGame(tiles.slice(0, 100));
      
      expect(commitment).toBeDefined();
      expect(typeof commitment).toBe('string');
      expect(commitment.length).toBe(64);
      
      const fairnessData = manager.getFairnessData();
      expect(fairnessData.serverSeedCommit).toBe(commitment);
      expect(fairnessData.initialTileOrder).toHaveLength(100);
      expect(Object.keys(fairnessData.clientSeeds)).toHaveLength(2);
    });

    test('should perform verifiable shuffles', () => {
      manager.initializeGame(tiles);
      
      const testTiles = tiles.slice(0, 50);
      const shuffled1 = manager.shuffleTiles(testTiles);
      const shuffled2 = manager.shuffleTiles(testTiles);
      
      expect(shuffled1).toHaveLength(50);
      expect(shuffled2).toHaveLength(50);
      expect(shuffled1).not.toEqual(shuffled2); // Different nonces should produce different results
    });

    test('should log game actions with state hashes', () => {
      manager.initializeGame(tiles);
      
      const mockStateBefore = {
        id: 'test',
        phase: 'play' as const,
        players: {} as Record<0 | 1 | 2 | 3, any>,
        dealer: 0 as const,
        currentPlayer: 0 as const,
        wall: [],
        deadWall: [],
        reservedTiles: [],
        discardPile: [],
        options: {
          charleston: { passes: 3, mustPass: true, blindPass: false, secondCharlestonEnabled: false, enableCourtesyPass: false, enableBlindPass: false, enableTileStealing: false },
          ruleCard: {
            name: 'Test', year: 2024, patterns: [],
            rules: {
              charlestonPasses: 3, allowKongDrawAfter: true, allowRobbingKong: false,
              maxJokersPerHand: 8, jokerReplacements: true, allowChowClaim: false,
              allowKongClaim: true, selfDrawBonus: 2, flowerBonus: 4, minimumPoints: 25
            },
            scoring: {
              basicPoints: 1, flowerPoints: 4, selfDrawPoints: 2, kongPoints: 2, claimPenalty: 1
            }
          }
        },
        logs: []
      };
      
      const mockStateAfter = { ...mockStateBefore };
      
      manager.logGameAction('tile_drawn', { tile: '1C' }, 'player1', mockStateBefore, mockStateAfter);
      
      const auditLogger = manager.getAuditLogger();
      const entries = auditLogger.getEntries();
      
      expect(entries.length).toBeGreaterThan(0);
      const lastEntry = entries[entries.length - 1];
      expect(lastEntry.action).toBe('tile_drawn');
      expect(lastEntry.stateHashBefore).toBeDefined();
      expect(lastEntry.stateHashAfter).toBeDefined();
    });

    test('should reveal server seed correctly', () => {
      const commitment = manager.initializeGame(tiles);
      const { serverSeed, isValid } = manager.revealServerSeed();
      
      expect(serverSeed).toBeDefined();
      expect(isValid).toBe(true);
      expect(verifyCommit(commitment, serverSeed)).toBe(true);
    });

    test('should generate comprehensive fairness report', () => {
      manager.initializeGame(tiles);
      manager.logGameAction('game_started', {});
      manager.logGameAction('tile_drawn', { tile: '1C' });
      
      const report = manager.generateFairnessReport();
      
      expect(report.fairnessData).toBeDefined();
      expect(report.auditLog.length).toBeGreaterThan(0);
      expect(report.stateSnapshots).toBeDefined();
      expect(report.integrity.isValid).toBe(true);
    });

    test('should verify complete game fairness', () => {
      manager.initializeGame(tiles);
      manager.logGameAction('test_action', {});
      const { serverSeed } = manager.revealServerSeed();
      
      const report = manager.generateFairnessReport();
      const verification = FairnessManager.verifyGameFairness(report, tiles);
      
      expect(verification.isValid).toBe(true);
      expect(verification.errors).toHaveLength(0);
    });
  });

  describe('Integration Tests', () => {
    test('should handle complete game fairness workflow', async () => {
      // Setup
      const gameId = 'integration-test-' + Date.now();
      const clientSeeds = {
        'player1': generateClientSeed(),
        'player2': generateClientSeed(),
        'player3': generateClientSeed(),
        'player4': generateClientSeed()
      };
      
      // Initialize fairness manager
      const manager = new FairnessManager(gameId, clientSeeds);
      const commitment = manager.initializeGame(tiles);
      
      // Perform several game actions
      manager.shuffleTiles(tiles); // Initial shuffle
      manager.logGameAction('game_started', { players: Object.keys(clientSeeds) });
      manager.logGameAction('charleston_started', {});
      
      // Simulate tile draws and discards
      for (let i = 0; i < 10; i++) {
        const playerId = `player${(i % 4) + 1}`;
        manager.logGameAction('tile_drawn', { tile: tiles[i] }, playerId);
        manager.logGameAction('tile_discarded', { tile: tiles[i + 50] }, playerId);
      }
      
      // End game and reveal seed
      manager.logGameAction('game_ended', { winner: 'player1' });
      const { serverSeed, isValid: seedValid } = manager.revealServerSeed();
      
      // Verify everything
      expect(seedValid).toBe(true);
      expect(verifyCommit(commitment, serverSeed)).toBe(true);
      
      const report = manager.generateFairnessReport();
      expect(report.integrity.isValid).toBe(true);
      expect(report.auditLog.length).toBeGreaterThan(10);
      
      const verification = FairnessManager.verifyGameFairness(report, tiles);
      expect(verification.isValid).toBe(true);
      expect(verification.errors).toHaveLength(0);
    });

    test('should detect and report integrity violations', () => {
      const manager = new FairnessManager('tampered-game');
      manager.initializeGame(tiles);
      manager.logGameAction('action1', {});
      
      // Tamper with audit log
      const auditLogger = manager.getAuditLogger();
      const entries = auditLogger.getEntries();
      if (entries.length > 0) {
        (entries[0] as any).data = { tampered: true };
      }
      
      const report = manager.generateFairnessReport();
      expect(report.integrity.isValid).toBe(false);
      expect(report.integrity.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Performance Tests', () => {
    test('should handle large numbers of audit entries efficiently', () => {
      const logger = new AuditLogger('performance-test');
      const startTime = Date.now();
      
      // Log 1000 entries
      for (let i = 0; i < 1000; i++) {
        logger.logAction(`action_${i}`, { index: i, data: 'test'.repeat(100) });
      }
      
      const logTime = Date.now() - startTime;
      expect(logTime).toBeLessThan(5000); // Should complete in under 5 seconds
      
      // Verify integrity of all entries
      const verifyStartTime = Date.now();
      const verification = logger.verifyLogIntegrity();
      const verifyTime = Date.now() - verifyStartTime;
      
      expect(verification.isValid).toBe(true);
      expect(verifyTime).toBeLessThan(2000); // Verification should be fast
    });

    test('should shuffle large tile sets efficiently', () => {
      const largeTileSet = Array(1000).fill(0).map((_, i) => `tile_${i}`);
      const serverSeed = generateServerSeed();
      const clientSeed = generateClientSeed();
      
      const startTime = Date.now();
      const shuffled = verifiableShuffle(largeTileSet, serverSeed, clientSeed, 0);
      const shuffleTime = Date.now() - startTime;
      
      expect(shuffleTime).toBeLessThan(1000); // Should complete in under 1 second
      expect(shuffled).toHaveLength(1000);
      
      // Verify the shuffle
      const verifyStartTime = Date.now();
      const isValid = verifyTileShuffle(largeTileSet, shuffled, serverSeed, clientSeed, 0);
      const verifyTime = Date.now() - verifyStartTime;
      
      expect(isValid).toBe(true);
      expect(verifyTime).toBeLessThan(1000);
    });
  });
});
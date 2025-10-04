// path: mahjong-ts/src/fairness-api.ts
/**
 * REST API endpoints for provable fairness verification and audit log access.
 */

import { Request, Response } from 'express';
import { FairnessManager, GameFairnessData, AuditLogEntry } from './fairness';
import { AuditStorage, QueryOptions } from './audit-storage';
import { GameState } from './types';
import * as crypto from 'crypto';

export interface FairnessVerificationResponse {
  gameId: string;
  isValid: boolean;
  errors: string[];
  fairnessData: GameFairnessData;
  timestamp: number;
}

export class FairnessApiController {
  private auditStorage: AuditStorage;
  private activeFairnessManagers: Map<string, FairnessManager> = new Map();

  constructor(auditStorage: AuditStorage) {
    this.auditStorage = auditStorage;
  }

  async verifyGameFairness(req: Request, res: Response): Promise<void> {
    try {
      const { gameId } = req.body;
      
      const fairnessData = await this.auditStorage.getFairnessData(gameId);
      if (!fairnessData) {
        res.status(404).json({ error: 'Game not found' });
        return;
      }

      const auditIntegrity = await this.auditStorage.verifyGameIntegrity(gameId);
      
      const response: FairnessVerificationResponse = {
        gameId,
        isValid: auditIntegrity.isValid,
        errors: auditIntegrity.errors,
        fairnessData,
        timestamp: Date.now()
      };

      res.json(response);
    } catch (error) {
      res.status(500).json({ error: 'Verification failed' });
    }
  }

  async queryAuditLogs(req: Request, res: Response): Promise<void> {
    try {
      const options: QueryOptions = {
        gameId: req.query.gameId as string,
        limit: req.query.limit ? parseInt(String(req.query.limit)) : 100
      };

      const entries = await this.auditStorage.queryAuditLogs(options);
      res.json({ entries, total: entries.length });
    } catch (error) {
      res.status(500).json({ error: 'Query failed' });
    }
  }

  registerFairnessManager(gameId: string, manager: FairnessManager): void {
    this.activeFairnessManagers.set(gameId, manager);
  }

  unregisterFairnessManager(gameId: string): void {
    this.activeFairnessManagers.delete(gameId);
  }
}

export function createFairnessRouter(auditStorage: AuditStorage) {
  const express = require('express');
  const router = express.Router();
  const controller = new FairnessApiController(auditStorage);

  router.post('/verify', (req: Request, res: Response) => 
    controller.verifyGameFairness(req, res)
  );
  
  router.get('/audit-logs', (req: Request, res: Response) => 
    controller.queryAuditLogs(req, res)
  );

  return { router, controller };
}
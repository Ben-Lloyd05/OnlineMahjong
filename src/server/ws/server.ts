// path: mahjong-ts/src/server/ws/server.ts
import { WebSocketServer } from 'ws';
import { randomUUID, randomBytes } from 'crypto';
import { ClientToServer, ServerToClient, nowIso } from './protocol';
import { createGame, applyMove, getGameState } from '../../engine';
import { load2024RuleCard } from '../../rulecard-parser';
import { commitServerSeed } from '../../fairness';

type Client = { 
  ws: any; 
  tableId?: string; 
  authed?: boolean; 
  playerId?: 0 | 1 | 2 | 3; 
  isCreator?: boolean;
  tableHistory?: Set<string>; // Track which tables this client has been in
};

type TableEntry = {
  state: any;
  clients: Set<Client>;
  inviteCode: string;
  createdAt: number;
  creatorLeft?: boolean; // Track if creator left but table should persist
  seeds: {
    serverSecret: string; // per-table random secret
    clientSeed: string;   // client-provided or server-generated
    serverCommit: string; // commitment to serverSecret for fairness
  };
};

const tables = new Map<string, TableEntry>();
const inviteCodeToTableId = new Map<string, string>();

function generateInviteCode(): string {
  // Generate a 6-character alphanumeric invite code
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  // Ensure uniqueness
  if (inviteCodeToTableId.has(code)) {
    return generateInviteCode();
  }
  return code;
}

function broadcast(tableId: string, msg: ServerToClient) {
  const table = tables.get(tableId);
  if (!table) return;
  for (const c of table.clients) {
    c.ws.send(JSON.stringify(msg));
  }
}

function broadcastPlayerCount(tableId: string) {
  const table = tables.get(tableId);
  if (!table) {
    console.log(`[broadcastPlayerCount] Table ${tableId.slice(0, 8)} not found`);
    return;
  }
  
  const playerCount = table.clients.size;
  const msg: ServerToClient = {
    type: 'player_count_update',
    traceId: mkTrace(),
    ts: nowIso(),
    tableId,
    players: playerCount,
    ready: playerCount === 4
  };
  
  console.log(`[broadcastPlayerCount] Broadcasting to ${table.clients.size} clients: ${playerCount}/4`);
  broadcast(tableId, msg);
  console.log(`[Table ${tableId.slice(0, 8)}] Player count: ${playerCount}/4 ${playerCount === 4 ? '(READY)' : ''}`);
}

function mkTrace() { return randomUUID(); }

export function startServer(port = 8080) {
  const wss = new WebSocketServer({ port });
  console.log(`WebSocket server listening on ws://localhost:${port}`);

  wss.on('connection', (ws: any) => {
    const client: Client = { ws };

    ws.on('close', () => {
      console.log(`[Server] WebSocket closed for client, tableId: ${client.tableId || 'none'}, isCreator: ${client.isCreator}`);
      // Clean up when client disconnects
      if (client.tableId) {
        const table = tables.get(client.tableId);
        if (table) {
          const tableIdForBroadcast = client.tableId;
          const clientsBeforeRemove = table.clients.size;
          table.clients.delete(client);
          console.log(`[Server] Removed client from table ${tableIdForBroadcast.slice(0, 8)}, was ${clientsBeforeRemove} players, now ${table.clients.size} players`);
          
          // Broadcast updated player count to remaining players
          if (table.clients.size > 0) {
            broadcastPlayerCount(tableIdForBroadcast);
          }
          
          // If creator disconnects, mark table but keep it alive for rejoining
          if (client.isCreator && table.clients.size === 0) {
            table.creatorLeft = true;
            console.log(`[Table ${tableIdForBroadcast.slice(0, 8)}] Creator disconnected, table empty but kept alive`);
            // Set a timeout to clean up after 10 minutes if no one rejoins
            setTimeout(() => {
              const currentTable = tables.get(tableIdForBroadcast);
              if (currentTable && currentTable.clients.size === 0) {
                tables.delete(tableIdForBroadcast);
                inviteCodeToTableId.delete(currentTable.inviteCode);
                console.log(`[Table ${tableIdForBroadcast.slice(0, 8)}] Cleaned up after timeout`);
              }
            }, 10 * 60 * 1000); // 10 minutes
          }
          // If non-creator disconnects and table becomes empty, clean up immediately
          else if (!client.isCreator && table.clients.size === 0) {
            console.log(`[Table ${tableIdForBroadcast.slice(0, 8)}] All players left, cleaning up`);
            tables.delete(client.tableId);
            inviteCodeToTableId.delete(table.inviteCode);
          }
        }
      }
    });

    ws.on('message', (data: Buffer) => {
      const msg: ClientToServer = JSON.parse(data.toString());
      if (!msg.traceId || !msg.ts) return;

      if (msg.type === 'auth') {
        client.authed = !!msg.token;
        return;
      }

      if (msg.type === 'create_table') {
        const tableId = randomUUID();
        const inviteCode = generateInviteCode();
        
        // Generate per-table seeds for deterministic fairness
        const serverSecret = randomBytes(32).toString('hex');
        const clientSeed = (msg as any).clientSeed || randomUUID();
        const serverCommit = commitServerSeed(serverSecret);

        const entry: TableEntry = {
          state: createGame(clientSeed, serverSecret, 0),
          clients: new Set(),
          inviteCode,
          createdAt: Date.now(),
          seeds: { serverSecret, clientSeed, serverCommit }
        };
        
        tables.set(tableId, entry);
        inviteCodeToTableId.set(inviteCode, tableId);
        
        client.tableId = tableId;
        client.playerId = 0;
        client.isCreator = true;
        if (!client.tableHistory) client.tableHistory = new Set();
        client.tableHistory.add(tableId);
        entry.clients.add(client);

        const response: ServerToClient = {
          type: 'table_created',
          traceId: mkTrace(),
          ts: nowIso(),
          tableId,
          inviteCode
        };
        ws.send(JSON.stringify(response));
        
        // Broadcast player count to all clients in the table
        broadcastPlayerCount(tableId);
        
        // Automatically send game state after creating
        const snapshot = getGameState(entry.state);
        const gameUpdate: ServerToClient = {
          type: 'game_state_update',
          traceId: mkTrace(),
          ts: nowIso(),
          tableId,
          full: snapshot
        };
        ws.send(JSON.stringify(gameUpdate));
        return;
      }

      if (msg.type === 'join_table') {
        const tableId = inviteCodeToTableId.get(msg.inviteCode);
        if (!tableId) {
          const errorResponse: ServerToClient = {
            type: 'action_result',
            traceId: mkTrace(),
            ts: nowIso(),
            tableId: '',
            ok: false,
            error: { code: 'invalid_invite_code', message: 'Invalid invite code' }
          };
          ws.send(JSON.stringify(errorResponse));
          return;
        }

        const entry = tables.get(tableId);
        if (!entry) {
          const errorResponse: ServerToClient = {
            type: 'action_result',
            traceId: mkTrace(),
            ts: nowIso(),
            tableId: '',
            ok: false,
            error: { code: 'table_not_found', message: 'Table no longer exists' }
          };
          ws.send(JSON.stringify(errorResponse));
          return;
        }

        if (entry.clients.size >= 4) {
          const errorResponse: ServerToClient = {
            type: 'action_result',
            traceId: mkTrace(),
            ts: nowIso(),
            tableId,
            ok: false,
            error: { code: 'table_full', message: 'Table is full (4 players maximum)' }
          };
          ws.send(JSON.stringify(errorResponse));
          return;
        }

        client.tableId = tableId;
        if (!client.tableHistory) client.tableHistory = new Set();
        client.tableHistory.add(tableId);
        
        // If this is the creator rejoining their empty table, restore their creator status
        if (entry.creatorLeft && entry.clients.size === 0) {
          client.isCreator = true;
          client.playerId = 0;
          entry.creatorLeft = false;
        } else {
          client.playerId = entry.clients.size as (0 | 1 | 2 | 3);
        }
        
        entry.clients.add(client);
        console.log(`[Server] Player joined table ${tableId.slice(0, 8)}, now ${entry.clients.size} players`);

        const response: ServerToClient = {
          type: 'table_joined',
          traceId: mkTrace(),
          ts: nowIso(),
          tableId,
          inviteCode: entry.inviteCode,
          players: entry.clients.size
        };
        ws.send(JSON.stringify(response));
        
        // Broadcast player count to all clients in the table
        console.log(`[Server] Broadcasting player count to ${entry.clients.size} clients`);
        broadcastPlayerCount(tableId);
        
        // Automatically send game state after joining
        const snapshot = getGameState(entry.state);
        const gameUpdate: ServerToClient = {
          type: 'game_state_update',
          traceId: mkTrace(),
          ts: nowIso(),
          tableId,
          full: snapshot
        };
        ws.send(JSON.stringify(gameUpdate));
        return;
      }

      if (msg.type === 'get_my_tables') {
        const myTables: { tableId: string; inviteCode: string; isCreator: boolean }[] = [];
        
        if (client.tableHistory) {
          for (const tableId of client.tableHistory) {
            const table = tables.get(tableId);
            if (table) {
              // Check if this client was the creator by checking if any client in this table has this connection
              // Since we don't persist this across connections, we'll use a simpler approach:
              // Just report if the table still exists
              myTables.push({
                tableId,
                inviteCode: table.inviteCode,
                isCreator: false // We can't reliably track this across reconnections
              });
            }
          }
        }
        
        const response: ServerToClient = {
          type: 'my_tables',
          traceId: mkTrace(),
          ts: nowIso(),
          tables: myTables
        };
        ws.send(JSON.stringify(response));
        return;
      }

      if (msg.type === 'leave_table') {
        if (!client.tableId) return;
        
        const tableIdForBroadcast = client.tableId;
        const table = tables.get(client.tableId);
        if (table) {
          table.clients.delete(client);
          
          // Broadcast updated player count to remaining players
          if (table.clients.size > 0) {
            broadcastPlayerCount(tableIdForBroadcast);
          }
          
          // If creator is leaving, mark table but keep it alive for rejoining
          if (client.isCreator && table.clients.size === 0) {
            table.creatorLeft = true;
            console.log(`[Table ${tableIdForBroadcast.slice(0, 8)}] Creator left, table empty but kept alive`);
            // Set a timeout to clean up after 10 minutes if no one rejoins
            setTimeout(() => {
              const currentTable = tables.get(tableIdForBroadcast);
              if (currentTable && currentTable.clients.size === 0) {
                tables.delete(tableIdForBroadcast);
                inviteCodeToTableId.delete(currentTable.inviteCode);
                console.log(`[Table ${tableIdForBroadcast.slice(0, 8)}] Cleaned up after timeout`);
              }
            }, 10 * 60 * 1000); // 10 minutes
          }
          // If non-creator leaves and table becomes empty, clean up immediately
          else if (!client.isCreator && table.clients.size === 0) {
            console.log(`[Table ${tableIdForBroadcast.slice(0, 8)}] All players left, cleaning up`);
            tables.delete(client.tableId);
            inviteCodeToTableId.delete(table.inviteCode);
          }
        }
        
        const response: ServerToClient = {
          type: 'table_left',
          traceId: mkTrace(),
          ts: nowIso(),
          tableId: client.tableId
        };
        
        client.tableId = undefined;
        client.playerId = undefined;
        client.isCreator = undefined;
        
        ws.send(JSON.stringify(response));
        return;
      }

      if (msg.type === 'subscribe') {
        if (!client.tableId) {
          const errorResponse: ServerToClient = {
            type: 'action_result',
            traceId: mkTrace(),
            ts: nowIso(),
            tableId: '',
            ok: false,
            error: { code: 'table_not_found', message: 'Table not found. Use create_table or join_table instead.' }
          };
          ws.send(JSON.stringify(errorResponse));
          return;
        }

        const entry = tables.get(client.tableId);
        if (!entry) return;

        const snapshot = getGameState(entry.state);
        // Optionally, include fairness metadata in a separate message in future (e.g., serverCommit)
        const update = { type: 'game_state_update', traceId: mkTrace(), ts: nowIso(), tableId: client.tableId, full: snapshot } as ServerToClient;
        ws.send(JSON.stringify(update));
        return;
      }

      if (msg.type === 'player_action' && client.tableId) {
        const table = tables.get(client.tableId);
        if (!table) return;
        const res = applyMove(table.state, msg.action);
        const resultMsg: ServerToClient = {
          type: 'action_result',
          traceId: mkTrace(),
          ts: nowIso(),
          tableId: client.tableId,
          ok: !!res.state,
          error: res.error,
          applied: res.state ? msg.action : undefined
        };
        if (res.state) table.state = res.state;
        ws.send(JSON.stringify(resultMsg));

        if (res.state) {
          broadcast(client.tableId, {
            type: 'game_state_update', traceId: mkTrace(), ts: nowIso(), tableId: client.tableId, delta: { logsAppend: [msg.action] }
          } as ServerToClient);
        }
        return;
      }
    });
  });

  return wss;
}



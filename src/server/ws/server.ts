// path: mahjong-ts/src/server/ws/server.ts
import { WebSocketServer } from 'ws';
import { randomUUID, randomBytes } from 'crypto';
import { ClientToServer, ServerToClient, nowIso } from './protocol';
import { createGame, applyMove, getGameState } from '../../engine';
import { load2024RuleCard } from '../../rulecard-parser';
import { commitServerSeed } from '../../fairness';

type Client = { ws: any; tableId?: string; authed?: boolean; playerId?: 0 | 1 | 2 | 3 };

type TableEntry = {
  state: any;
  clients: Set<Client>;
  seeds: {
    serverSecret: string; // per-table random secret
    clientSeed: string;   // client-provided or server-generated
    serverCommit: string; // commitment to serverSecret for fairness
  };
};

const tables = new Map<string, TableEntry>();

function broadcast(tableId: string, msg: ServerToClient) {
  const table = tables.get(tableId);
  if (!table) return;
  for (const c of table.clients) {
    c.ws.send(JSON.stringify(msg));
  }
}

function mkTrace() { return randomUUID(); }

export function startServer(port = 8080) {
  const wss = new WebSocketServer({ port });
  console.log(`WebSocket server listening on ws://localhost:${port}`);

  wss.on('connection', (ws: any) => {
    const client: Client = { ws };

    ws.on('message', (data: Buffer) => {
      const msg: ClientToServer = JSON.parse(data.toString());
      if (!msg.traceId || !msg.ts) return;

      if (msg.type === 'auth') {
        client.authed = !!msg.token;
        return;
      }

      if (msg.type === 'subscribe') {
        const tableId = msg.tableId;
        client.tableId = tableId;
        client.playerId = ((Math.random() * 4) | 0) as 0 | 1 | 2 | 3;
        let entry = tables.get(tableId);
        if (!entry) {
          // Generate per-table seeds for deterministic fairness
          const serverSecret = randomBytes(32).toString('hex');
          const clientSeed = (msg as any).clientSeed || randomUUID();
          const serverCommit = commitServerSeed(serverSecret);

          entry = {
            state: createGame(clientSeed, serverSecret, 0),
            clients: new Set(),
            seeds: { serverSecret, clientSeed, serverCommit }
          };
          tables.set(tableId, entry);
        }
        entry.clients.add(client);

        const snapshot = getGameState(entry.state);
  // Optionally, include fairness metadata in a separate message in future (e.g., serverCommit)
  const update = { type: 'game_state_update', traceId: mkTrace(), ts: nowIso(), tableId, full: snapshot } as ServerToClient;
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



// path: mahjong-ts/src/server/ws/server.ts
import { WebSocketServer } from 'ws';
import { randomUUID, randomBytes } from 'crypto';
import { ClientToServer, ServerToClient, nowIso, PlayerInfo } from './protocol';
import { createGame, applyMove, getGameState } from '../../engine';
import { load2024RuleCard } from '../../rulecard-parser';
import { commitServerSeed } from '../../fairness';
import { 
  initializeCharleston,
  handleCharlestonSelection,
  handleCharlestonReady,
  handleCharlestonVote,
  handleCharlestonVoteSubmit,
  handleCourtesyProposal,
  allPlayersReady,
  executeCharlestonPass,
  processVoteResults,
  executeCourtesyPass,
  tallyVotes,
  getPhaseInstructions
} from '../../charleston-manager';

// Admin password - in production, use environment variable
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Grace period (in milliseconds) before marking a player as disconnected
// This prevents showing disconnect UI during quick page refreshes
const DISCONNECT_GRACE_PERIOD = 3000; // 3 seconds

type Client = { 
  ws: any; 
  tableId?: string; 
  authed?: boolean; 
  playerId?: 0 | 1 | 2 | 3; 
  isCreator?: boolean;
  tableHistory?: Set<string>; // Track which tables this client has been in
  username?: string; // Player's username
  isAdmin?: boolean; // Track if client has admin privileges
  sessionToken?: string; // Unique token for reconnection
};

type PlayerSession = {
  playerId: 0 | 1 | 2 | 3;
  username: string;
  sessionToken: string;
  connected: boolean;
  disconnectedAt?: number; // Timestamp when disconnected
  client?: Client; // Current active client (undefined if disconnected)
  disconnectTimeout?: NodeJS.Timeout; // Timer for grace period before showing disconnect
};

type TableEntry = {
  state: any;
  clients: Set<Client>;
  inviteCode: string;
  createdAt: number;
  creatorLeft?: boolean; // Track if creator left but table should persist
  gameStarted?: boolean; // Track if game has started (hands dealt)
  paused?: boolean; // Track if game is paused due to disconnections
  playerSessions: Map<number, PlayerSession>; // Track all player sessions for reconnection
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

function cleanupPlayerSession(session: PlayerSession) {
  // Clear any pending disconnect timeout
  if (session.disconnectTimeout) {
    clearTimeout(session.disconnectTimeout);
    session.disconnectTimeout = undefined;
  }
}

function cleanupTable(table: TableEntry) {
  // Clear all disconnect timeouts for all player sessions
  for (const session of table.playerSessions.values()) {
    cleanupPlayerSession(session);
  }
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

function broadcastPlayersUpdate(tableId: string) {
  const table = tables.get(tableId);
  if (!table) return;
  
  // Build player list from sessions (includes disconnected players)
  const playersList: PlayerInfo[] = [];
  for (const [playerId, session] of table.playerSessions.entries()) {
    playersList.push({
      playerId: session.playerId,
      username: session.username,
      isDealer: false, // Will be set when game starts
      connected: session.connected,
      // Only include disconnectedAt if the player is actually disconnected
      disconnectedAt: session.connected ? undefined : session.disconnectedAt
    });
  }
  
  console.log(`[broadcastPlayersUpdate] Table ${tableId.slice(0, 8)}: ${playersList.length} players:`, 
    playersList.map(p => `P${p.playerId}=${p.username}${p.connected ? '' : '(DC)'}${p.disconnectedAt ? `@${p.disconnectedAt}` : ''}`).join(', '));
  
  // Send to each client with their own playerId
  for (const client of table.clients) {
    const msg: ServerToClient = {
      type: 'players_update',
      traceId: mkTrace(),
      ts: nowIso(),
      tableId,
      players: playersList,
      yourPlayerId: client.playerId
    };
    console.log(`[broadcastPlayersUpdate] Sending to ${client.username} (P${client.playerId})`);
    client.ws.send(JSON.stringify(msg));
  }
}

function pauseGame(tableId: string) {
  const table = tables.get(tableId);
  if (!table || !table.gameStarted) return;
  
  table.paused = true;
  console.log(`[Server] Game paused for table ${tableId.slice(0, 8)}`);
  
  // Get list of disconnected players
  const disconnectedPlayers: PlayerInfo[] = [];
  for (const [playerId, session] of table.playerSessions.entries()) {
    if (!session.connected) {
      disconnectedPlayers.push({
        playerId: session.playerId,
        username: session.username,
        connected: false,
        disconnectedAt: session.disconnectedAt
      });
    }
  }
  
  // Broadcast pause message to all connected clients
  const msg: ServerToClient = {
    type: 'game_paused',
    traceId: mkTrace(),
    ts: nowIso(),
    tableId,
    disconnectedPlayers
  };
  broadcast(tableId, msg);
}

function checkAndResumeGame(tableId: string) {
  const table = tables.get(tableId);
  if (!table || !table.paused) return;
  
  // Check if all players are now connected
  let allConnected = true;
  for (const [playerId, session] of table.playerSessions.entries()) {
    if (!session.connected) {
      allConnected = false;
      break;
    }
  }
  
  if (allConnected) {
    table.paused = false;
    console.log(`[Server] Game resumed for table ${tableId.slice(0, 8)}`);
    
    const msg: ServerToClient = {
      type: 'game_resumed',
      traceId: mkTrace(),
      ts: nowIso(),
      tableId
    };
    broadcast(tableId, msg);
  }
}

// Charleston functions
function broadcastCharlestonState(tableId: string) {
  const table = tables.get(tableId);
  if (!table || !table.state || !table.state.charleston) return;
  
  const charleston = table.state.charleston;
  const blindAll = process.env.BLIND_PASS_ALL === '1' || process.env.BLIND_PASS_ALL === 'true';
  const canBlindPass = blindAll || charleston.phase === 'pass-left' || charleston.phase === 'pass-right-2';
  
  // Build player states array for broadcast
  const playerStates = [];
  for (let pid = 0; pid < 4; pid++) {
    const playerId = pid as 0 | 1 | 2 | 3;
    const state = charleston.playerStates[playerId];
    playerStates.push({
      playerId,
      selectedTiles: state.selectedTiles,
      ready: state.ready,
      blindPass: state.blindPass,
      vote: state.vote,
      courtesyOffer: state.courtesyOffer ? {
        tiles: state.courtesyOffer.tiles,
        targetPlayer: state.courtesyOffer.targetPlayer
      } : undefined
    });
  }
  
  const msg: ServerToClient = {
    type: 'charleston_state',
    traceId: mkTrace(),
    ts: nowIso(),
    tableId,
    phase: charleston.phase,
    playerStates,
    passNumber: charleston.passNumber,
    canBlindPass,
    message: getPhaseInstructions(charleston.phase)
  };
  
  broadcast(tableId, msg);
}

function startGameForTable(tableId: string) {
  const table = tables.get(tableId);
  if (!table || table.gameStarted) return;
  
  console.log(`[Server] Starting game for table ${tableId.slice(0, 8)}`);
  
  // Randomly select dealer (0-3)
  const dealer = Math.floor(Math.random() * 4) as 0 | 1 | 2 | 3;
  console.log(`[Server] Selected dealer: Player ${dealer}`);
  
  // Create the game state with dealt hands
  table.state = createGame(table.seeds.clientSeed, table.seeds.serverSecret, dealer);
  table.gameStarted = true;
  
  // Initialize Charleston
  table.state = initializeCharleston(table.state);
  
  // Assign seat positions based on join order (playerId already reflects this)
  // and create PlayerInfo array
  const allPlayers: PlayerInfo[] = [];
  for (const client of table.clients) {
    const playerId = client.playerId!;
    const session = table.playerSessions.get(playerId);
    allPlayers.push({
      playerId,
      username: client.username || `Player ${playerId + 1}`,
      isDealer: playerId === dealer,
      seatPosition: playerId, // playerId 0-3 already reflects join order
      connected: session?.connected ?? true,
      disconnectedAt: session?.connected ? undefined : session?.disconnectedAt
    });
  }
  
  // Send each player their own hand plus all player info
  for (const client of table.clients) {
    const playerId = client.playerId!;
    const playerHand = table.state.players[playerId].hand;
    
    const msg: ServerToClient = {
      type: 'game_start',
      traceId: mkTrace(),
      ts: nowIso(),
      tableId,
      dealer,
      yourHand: playerHand,
      yourPlayerId: playerId,
      allPlayers
    };
    client.ws.send(JSON.stringify(msg));
  }
  
  // Send initial Charleston state
  broadcastCharlestonState(tableId);
  
  console.log(`[Server] Game started for table ${tableId.slice(0, 8)}, dealer is Player ${dealer}`);
}

function mkTrace() { return randomUUID(); }

export function startServer(port = 8080) {
  const wss = new WebSocketServer({ port });
  console.log(`WebSocket server listening on ws://localhost:${port}`);

  wss.on('connection', (ws: any) => {
    const client: Client = { ws };

    ws.on('close', () => {
      console.log(`[Server] WebSocket closed for client, tableId: ${client.tableId || 'none'}, playerId: ${client.playerId}, isCreator: ${client.isCreator}`);
      
      if (client.tableId) {
        const table = tables.get(client.tableId);
        if (table && client.playerId !== undefined) {
          const session = table.playerSessions.get(client.playerId);
          
          if (session) {
            // If game has started, use grace period before marking as disconnected
            if (table.gameStarted) {
              console.log(`[Server] Player ${client.playerId} (${session.username}) connection closed - starting grace period`);
              
              // Remove client from the table immediately (they're not connected)
              table.clients.delete(client);
              
              // Set a timeout to mark them as disconnected after grace period
              // If they reconnect before the timeout, we'll cancel it
              session.disconnectTimeout = setTimeout(() => {
                // Check if they reconnected during the grace period
                if (!session.connected) {
                  console.log(`[Server] Player ${client.playerId} (${session.username}) did not reconnect - marking as disconnected`);
                  session.disconnectedAt = Date.now();
                  session.client = undefined;
                  
                  // Pause the game and notify other players
                  pauseGame(client.tableId!);
                  broadcastPlayersUpdate(client.tableId!);
                } else {
                  console.log(`[Server] Player ${client.playerId} (${session.username}) reconnected during grace period`);
                }
                session.disconnectTimeout = undefined;
              }, DISCONNECT_GRACE_PERIOD);
              
              // Temporarily mark as not connected (but don't set disconnectedAt yet)
              session.connected = false;
              session.client = undefined;
            } 
            // If game hasn't started, remove player from table immediately
            else {
              console.log(`[Server] Player ${client.playerId} (${session.username}) left before game started`);
              table.clients.delete(client);
              cleanupPlayerSession(session);
              table.playerSessions.delete(client.playerId);
              
              // Broadcast updated counts
              if (table.clients.size > 0) {
                broadcastPlayerCount(client.tableId);
                broadcastPlayersUpdate(client.tableId);
              }
              
              // Clean up empty tables
              if (table.clients.size === 0) {
                console.log(`[Table ${client.tableId.slice(0, 8)}] All players left, cleaning up`);
                cleanupTable(table);
                tables.delete(client.tableId);
                inviteCodeToTableId.delete(table.inviteCode);
              }
            }
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
        const sessionToken = randomUUID();
        
        // Generate per-table seeds for deterministic fairness
        const serverSecret = randomBytes(32).toString('hex');
        const clientSeed = (msg as any).clientSeed || randomUUID();
        const serverCommit = commitServerSeed(serverSecret);

        const entry: TableEntry = {
          state: null, // Don't create game state until 4 players join
          clients: new Set(),
          inviteCode,
          createdAt: Date.now(),
          gameStarted: false,
          paused: false,
          playerSessions: new Map(),
          seeds: { serverSecret, clientSeed, serverCommit }
        };
        
        tables.set(tableId, entry);
        inviteCodeToTableId.set(inviteCode, tableId);
        
        client.tableId = tableId;
        client.playerId = 0;
        client.isCreator = true;
        client.sessionToken = sessionToken;
        client.username = (msg as any).username || 'Player 1';
        if (!client.tableHistory) client.tableHistory = new Set();
        client.tableHistory.add(tableId);
        entry.clients.add(client);
        
        // Create player session
        entry.playerSessions.set(0, {
          playerId: 0,
          username: client.username || 'Player 1',
          sessionToken,
          connected: true,
          disconnectedAt: undefined,
          client
        });

        const response: ServerToClient = {
          type: 'table_created',
          traceId: mkTrace(),
          ts: nowIso(),
          tableId,
          inviteCode,
          sessionToken
        };
        ws.send(JSON.stringify(response));
        
        // Broadcast player count and player list to all clients in the table
        broadcastPlayerCount(tableId);
        broadcastPlayersUpdate(tableId);
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

        const providedSessionToken = (msg as any).sessionToken;
        const providedUsername = (msg as any).username;
        let isReconnection = false;
        let reconnectedSession: PlayerSession | undefined;

        console.log(`[Server] Join attempt - sessionToken: ${providedSessionToken ? 'provided' : 'none'}, username: ${providedUsername}, gameStarted: ${entry.gameStarted}`);

        // Check if this is a reconnection attempt
        // Priority 1: Match by session token (most reliable)
        if (providedSessionToken) {
          for (const [playerId, session] of entry.playerSessions.entries()) {
            if (session.sessionToken === providedSessionToken) {
              console.log(`[Server] Reconnection by session token for player ${playerId} (${session.username})`);
              isReconnection = true;
              reconnectedSession = session;
              client.playerId = playerId as (0 | 1 | 2 | 3);
              client.sessionToken = providedSessionToken;
              client.username = providedUsername || session.username;
              client.tableId = tableId;
              if (playerId === 0) client.isCreator = true;
              if (!client.tableHistory) client.tableHistory = new Set();
              client.tableHistory.add(tableId);
              
              // Cancel any pending disconnect timeout
              if (session.disconnectTimeout) {
                clearTimeout(session.disconnectTimeout);
                session.disconnectTimeout = undefined;
                console.log(`[Server] Cancelled disconnect timeout for player ${playerId} - reconnected in time`);
              }
              
              // Update session
              session.connected = true;
              session.disconnectedAt = undefined;
              session.client = client;
              session.username = client.username || session.username;
              
              entry.clients.add(client);
              console.log(`[Server] Reconnection successful - session updated: P${playerId} connected=${session.connected}, disconnectedAt=${session.disconnectedAt}`);
              break;
            }
          }
        }
        
        // Priority 2: If game has started and there's a disconnected player with matching username, reconnect them
        if (!isReconnection && entry.gameStarted && providedUsername) {
          for (const [playerId, session] of entry.playerSessions.entries()) {
            if (!session.connected && session.username === providedUsername) {
              console.log(`[Server] Reconnection by username for player ${playerId} (${session.username})`);
              isReconnection = true;
              reconnectedSession = session;
              client.playerId = playerId as (0 | 1 | 2 | 3);
              client.sessionToken = session.sessionToken; // Use existing session token
              client.username = providedUsername;
              client.tableId = tableId;
              if (playerId === 0) client.isCreator = true;
              if (!client.tableHistory) client.tableHistory = new Set();
              client.tableHistory.add(tableId);
              
              // Cancel any pending disconnect timeout
              if (session.disconnectTimeout) {
                clearTimeout(session.disconnectTimeout);
                session.disconnectTimeout = undefined;
                console.log(`[Server] Cancelled disconnect timeout for player ${playerId} - reconnected by username`);
              }
              
              // Update session
              session.connected = true;
              session.disconnectedAt = undefined;
              session.client = client;
              
              entry.clients.add(client);
              console.log(`[Server] Reconnection by username successful - session updated: P${playerId} connected=${session.connected}, disconnectedAt=${session.disconnectedAt}`);
              break;
            }
          }
        }

        // New player joining (not a reconnection)
        if (!isReconnection) {
          // Reject if table already has 4 player sessions (slots)
          // We check sessions, not connected players, because each session holds a player slot
          console.log(`[Server] New player joining - sessions: ${entry.playerSessions.size}, clients.size: ${entry.clients.size}, gameStarted: ${entry.gameStarted}`);
          
          if (entry.playerSessions.size >= 4) {
            console.log(`[Server] Rejecting join - table is full (${entry.playerSessions.size} player slots taken)`);
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
          
          // Reject if game has started (even if someone is disconnected) - only reconnections allowed
          if (entry.gameStarted) {
            console.log(`[Server] Rejecting new player ${providedUsername} - game already started, only reconnections allowed`);
            const errorResponse: ServerToClient = {
              type: 'action_result',
              traceId: mkTrace(),
              ts: nowIso(),
              tableId,
              ok: false,
              error: { code: 'game_in_progress', message: 'Game has already started. Only existing players can reconnect.' }
            };
            ws.send(JSON.stringify(errorResponse));
            return;
          }

          const newSessionToken = randomUUID();
          client.tableId = tableId;
          client.sessionToken = newSessionToken;
          client.username = (msg as any).username || `Player ${entry.playerSessions.size + 1}`;
          if (!client.tableHistory) client.tableHistory = new Set();
          client.tableHistory.add(tableId);
          
          // If this is the creator rejoining their empty table, restore their creator status
          if (entry.creatorLeft && entry.clients.size === 0) {
            client.isCreator = true;
            client.playerId = 0;
            entry.creatorLeft = false;
          } else {
            // Find the first available player ID (0-3) that doesn't have a session
            let assignedPlayerId: 0 | 1 | 2 | 3 = 0;
            for (let pid = 0; pid < 4; pid++) {
              if (!entry.playerSessions.has(pid)) {
                assignedPlayerId = pid as (0 | 1 | 2 | 3);
                break;
              }
            }
            client.playerId = assignedPlayerId;
          }
          
          entry.clients.add(client);
          
          // Create player session
          entry.playerSessions.set(client.playerId, {
            playerId: client.playerId,
            username: client.username || `Player ${client.playerId + 1}`,
            sessionToken: newSessionToken,
            connected: true,
            disconnectedAt: undefined,
            client
          });
          
          console.log(`[Server] Player ${client.username} joined table ${tableId.slice(0, 8)}, now ${entry.clients.size} players`);
        }

        const response: ServerToClient = {
          type: 'table_joined',
          traceId: mkTrace(),
          ts: nowIso(),
          tableId,
          inviteCode: entry.inviteCode,
          players: entry.clients.size,
          sessionToken: client.sessionToken || '',
          reconnected: isReconnection
        };
        ws.send(JSON.stringify(response));
        
        // If this was a reconnection and game has started, resend game state to the reconnected player
        if (isReconnection && entry.gameStarted && entry.state && client.playerId !== undefined) {
          console.log(`[Server] Resending game state to reconnected player ${client.playerId}`);
          
          const playerId = client.playerId;
          const playerHand = entry.state.players[playerId].hand;
          
          // Build allPlayers array from sessions
          const allPlayers: PlayerInfo[] = [];
          for (const [pid, session] of entry.playerSessions.entries()) {
            allPlayers.push({
              playerId: pid,
              username: session.username,
              isDealer: entry.state.dealer === pid,
              seatPosition: pid,
              connected: session.connected,
              // Only include disconnectedAt if the player is actually disconnected
              disconnectedAt: session.connected ? undefined : session.disconnectedAt
            });
          }
          
          const gameStartMsg: ServerToClient = {
            type: 'game_start',
            traceId: mkTrace(),
            ts: nowIso(),
            tableId,
            dealer: entry.state.dealer,
            yourHand: playerHand,
            yourPlayerId: playerId,
            allPlayers
          };
          ws.send(JSON.stringify(gameStartMsg));
        }
        
        // Broadcast player count and player list to all clients in the table
        // This should happen BEFORE checking to resume so all clients see updated connection status
        console.log(`[Server] Broadcasting player count to ${entry.clients.size} clients`);
        broadcastPlayerCount(tableId);
        broadcastPlayersUpdate(tableId);
        
        // If this was a reconnection and game was paused, check if we can resume
        if (isReconnection && entry.paused) {
          checkAndResumeGame(tableId);
        }
        
        // If we now have 4 players and game hasn't started, start it
        if (entry.clients.size === 4 && !entry.gameStarted) {
          startGameForTable(tableId);
        }
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
          console.log(`[leave_table] Player ${client.playerId} (${client.username}) leaving. Game started: ${table.gameStarted}`);
          console.log(`[leave_table] Before delete - playerSessions size: ${table.playerSessions.size}, clients size: ${table.clients.size}`);
          
          table.clients.delete(client);
          
          // Remove player session if game hasn't started
          if (!table.gameStarted && client.playerId !== undefined) {
            console.log(`[leave_table] Deleting session for playerId: ${client.playerId}`);
            const session = table.playerSessions.get(client.playerId);
            if (session) {
              cleanupPlayerSession(session);
            }
            table.playerSessions.delete(client.playerId);
          }
          
          console.log(`[leave_table] After delete - playerSessions size: ${table.playerSessions.size}, clients size: ${table.clients.size}`);
          
          // Broadcast updated player count and player list to remaining players
          if (table.clients.size > 0) {
            broadcastPlayerCount(tableIdForBroadcast);
            broadcastPlayersUpdate(tableIdForBroadcast);
          }
          
          // If creator is leaving, mark table but keep it alive for rejoining
          if (client.isCreator && table.clients.size === 0) {
            table.creatorLeft = true;
            console.log(`[Table ${tableIdForBroadcast.slice(0, 8)}] Creator left, table empty but kept alive`);
            // Set a timeout to clean up after 10 minutes if no one rejoins
            setTimeout(() => {
              const currentTable = tables.get(tableIdForBroadcast);
              if (currentTable && currentTable.clients.size === 0) {
                cleanupTable(currentTable);
                tables.delete(tableIdForBroadcast);
                inviteCodeToTableId.delete(currentTable.inviteCode);
                console.log(`[Table ${tableIdForBroadcast.slice(0, 8)}] Cleaned up after timeout`);
              }
            }, 10 * 60 * 1000); // 10 minutes
          }
          // If non-creator leaves and table becomes empty, clean up immediately
          else if (!client.isCreator && table.clients.size === 0) {
            console.log(`[Table ${tableIdForBroadcast.slice(0, 8)}] All players left, cleaning up`);
            cleanupTable(table);
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

      // Admin handlers
      if (msg.type === 'admin_auth') {
        const isValid = msg.password === ADMIN_PASSWORD;
        client.isAdmin = isValid;
        
        const response: ServerToClient = {
          type: 'admin_auth_result',
          traceId: mkTrace(),
          ts: nowIso(),
          ok: isValid,
          error: isValid ? undefined : 'Invalid admin password'
        };
        
        ws.send(JSON.stringify(response));
        console.log(`[Admin] Auth attempt: ${isValid ? 'SUCCESS' : 'FAILED'}`);
        return;
      }

      if (msg.type === 'admin_list_tables') {
        if (!client.isAdmin) {
          ws.send(JSON.stringify({
            type: 'action_result',
            traceId: mkTrace(),
            ts: nowIso(),
            tableId: '',
            ok: false,
            error: { code: 'unauthorized', message: 'Admin authentication required' }
          } as ServerToClient));
          return;
        }

        const tablesList: any[] = [];
        for (const [tableId, table] of tables.entries()) {
          const playersList = Array.from(table.clients).map(c => ({
            playerId: c.playerId ?? 0,
            username: c.username || 'Unknown',
            isDealer: false
          }));

          tablesList.push({
            tableId,
            inviteCode: table.inviteCode,
            playerCount: table.clients.size,
            players: playersList,
            gameStarted: table.gameStarted || false,
            createdAt: table.createdAt
          });
        }

        const response: ServerToClient = {
          type: 'admin_tables_list',
          traceId: mkTrace(),
          ts: nowIso(),
          tables: tablesList
        };

        ws.send(JSON.stringify(response));
        console.log(`[Admin] Listed ${tablesList.length} active tables`);
        return;
      }

      if (msg.type === 'admin_join_table') {
        if (!client.isAdmin) {
          ws.send(JSON.stringify({
            type: 'action_result',
            traceId: mkTrace(),
            ts: nowIso(),
            tableId: '',
            ok: false,
            error: { code: 'unauthorized', message: 'Admin authentication required' }
          } as ServerToClient));
          return;
        }

        const tableId = inviteCodeToTableId.get(msg.inviteCode);
        if (!tableId) {
          ws.send(JSON.stringify({
            type: 'action_result',
            traceId: mkTrace(),
            ts: nowIso(),
            tableId: '',
            ok: false,
            error: { code: 'table_not_found', message: 'Table not found' }
          } as ServerToClient));
          return;
        }

        const table = tables.get(tableId);
        if (!table) {
          ws.send(JSON.stringify({
            type: 'action_result',
            traceId: mkTrace(),
            ts: nowIso(),
            tableId: '',
            ok: false,
            error: { code: 'table_not_found', message: 'Table not found' }
          } as ServerToClient));
          return;
        }

        // Get all player hands
        const allHands: { [playerId: number]: string[] } = {};
        if (table.state) {
          for (let i = 0; i < 4; i++) {
            if (table.state.players[i]) {
              allHands[i] = table.state.players[i].hand || [];
            }
          }
        }

        // Get player info
        const playersList = Array.from(table.clients).map(c => ({
          playerId: c.playerId ?? 0,
          username: c.username || 'Unknown',
          isDealer: table.state ? table.state.dealer === c.playerId : false
        }));

        const response: ServerToClient = {
          type: 'admin_game_view',
          traceId: mkTrace(),
          ts: nowIso(),
          tableId,
          inviteCode: table.inviteCode,
          gameState: table.state,
          allHands,
          players: playersList,
          gameStarted: table.gameStarted || false
        };

        ws.send(JSON.stringify(response));
        console.log(`[Admin] Joined table ${tableId.slice(0, 8)} (${table.inviteCode}) for spectating`);
        return;
      }

      // Charleston message handlers
      if (msg.type === 'charleston_select') {
        const { tableId, tiles, blindPass } = msg;
        const table = tables.get(tableId);
        
        if (!table || !table.state || !table.state.charleston) {
          ws.send(JSON.stringify({
            type: 'action_result',
            traceId: mkTrace(),
            ts: nowIso(),
            tableId,
            ok: false,
            error: { code: 'charleston_not_active', message: 'Charleston is not active' }
          } as ServerToClient));
          return;
        }
        
        const result = handleCharlestonSelection(table.state, client.playerId!, tiles, blindPass);
        
        if (!result.success) {
          ws.send(JSON.stringify({
            type: 'action_result',
            traceId: mkTrace(),
            ts: nowIso(),
            tableId,
            ok: false,
            error: { code: 'invalid_selection', message: result.error }
          } as ServerToClient));
          return;
        }
        
        // Broadcast updated state
        broadcastCharlestonState(tableId);
        return;
      }

      if (msg.type === 'charleston_ready') {
        const { tableId } = msg;
        const table = tables.get(tableId);
        
        if (!table || !table.state || !table.state.charleston) {
          console.log('[Charleston] No table or charleston state found');
          return;
        }
        
        console.log(`[Charleston] Player ${client.playerId} marked ready for phase ${table.state.charleston.phase}`);
        
        const result = handleCharlestonReady(table.state, client.playerId!);
        
        if (!result.success) {
          console.log(`[Charleston] Player ${client.playerId} ready failed: ${result.error}`);
          ws.send(JSON.stringify({
            type: 'action_result',
            traceId: mkTrace(),
            ts: nowIso(),
            tableId,
            ok: false,
            error: { code: 'cannot_ready', message: result.error }
          } as ServerToClient));
          return;
        }
        
        // Broadcast updated state
        broadcastCharlestonState(tableId);
        
        // Check if all players are ready
        if (allPlayersReady(table.state.charleston)) {
          console.log(`[Charleston] All players ready for phase ${table.state.charleston.phase}`);
          const phase = table.state.charleston.phase;
          
          if (phase === 'vote') {
            // Process vote results
            table.state = processVoteResults(table.state);
            
            // Broadcast vote results
            const voteResults = tallyVotes(table.state.charleston);
            const voteResultMsg: ServerToClient = {
              type: 'charleston_vote_result',
              traceId: mkTrace(),
              ts: nowIso(),
              tableId,
              yesVotes: voteResults.yes,
              noVotes: voteResults.no,
              secondCharlestonHappens: voteResults.yes >= 3
            };
            broadcast(tableId, voteResultMsg);
            
            // Broadcast new state
            setTimeout(() => broadcastCharlestonState(tableId), 1000);
          } else if (phase === 'courtesy') {
            // Execute courtesy pass
            table.state = executeCourtesyPass(table.state);
            
            // Broadcast completion
            const completeMsg: ServerToClient = {
              type: 'charleston_complete',
              traceId: mkTrace(),
              ts: nowIso(),
              tableId
            };
            broadcast(tableId, completeMsg);
            
            // Update all players' hands
            for (const c of table.clients) {
              const playerId = c.playerId!;
              const playerHand = table.state.players[playerId].hand;
              
              const updateMsg: ServerToClient = {
                type: 'game_state_update',
                traceId: mkTrace(),
                ts: nowIso(),
                tableId,
                delta: {
                  phase: 'play',
                  players: {
                    [playerId]: {
                      hand: playerHand
                    }
                  } as any
                }
              };
              c.ws.send(JSON.stringify(updateMsg));
            }
          } else {
            // Execute pass
            console.log(`[Charleston] Executing pass for phase ${phase}`);
            const blindPassInfo: { playerId: number; count: number }[] = [];
            
            // Collect blind pass info
            for (let pid = 0; pid < 4; pid++) {
              const playerId = pid as 0 | 1 | 2 | 3;
              const playerState = table.state.charleston.playerStates[playerId];
              if (playerState.blindPass?.enabled) {
                blindPassInfo.push({
                  playerId,
                  count: playerState.blindPass.count
                });
              }
            }
            
            table.state = executeCharlestonPass(table.state);
            console.log(`[Charleston] Pass executed, new phase: ${table.state.charleston.phase}`);
            
            // Send pass executed message to each player with their new tiles
            for (const c of table.clients) {
              const playerId = c.playerId!;
              const playerHand = table.state.players[playerId].hand;
              
              const passMsg: ServerToClient = {
                type: 'charleston_pass_executed',
                traceId: mkTrace(),
                ts: nowIso(),
                tableId,
                passNumber: table.state.charleston.passNumber - 1,
                yourNewTiles: playerHand,
                blindPassInfo: blindPassInfo.length > 0 ? blindPassInfo : undefined
              };
              c.ws.send(JSON.stringify(passMsg));
            }
            
            // Broadcast new state after a brief delay
            setTimeout(() => broadcastCharlestonState(tableId), 500);
          }
        }
        
        return;
      }

      if (msg.type === 'charleston_vote') {
        const { tableId, vote } = msg;
        const table = tables.get(tableId);
        
        if (!table || !table.state || !table.state.charleston) {
          return;
        }
        
        const result = handleCharlestonVote(table.state, client.playerId!, vote);
        
        if (!result.success) {
          ws.send(JSON.stringify({
            type: 'action_result',
            traceId: mkTrace(),
            ts: nowIso(),
            tableId,
            ok: false,
            error: { code: 'invalid_vote', message: result.error }
          } as ServerToClient));
          return;
        }
        
        // Broadcast updated state (votes are live)
        broadcastCharlestonState(tableId);
        return;
      }

      if (msg.type === 'charleston_courtesy') {
        const { tableId, tiles, targetPlayer } = msg;
        const table = tables.get(tableId);
        
        if (!table || !table.state || !table.state.charleston) {
          return;
        }
        
        const result = handleCourtesyProposal(
          table.state,
          client.playerId!,
          tiles,
          targetPlayer as 0 | 1 | 2 | 3
        );
        
        if (!result.success) {
          ws.send(JSON.stringify({
            type: 'action_result',
            traceId: mkTrace(),
            ts: nowIso(),
            tableId,
            ok: false,
            error: { code: 'invalid_courtesy', message: result.error }
          } as ServerToClient));
          return;
        }
        
        // Broadcast updated state
        broadcastCharlestonState(tableId);
        return;
      }
    });
  });

  return wss;
}



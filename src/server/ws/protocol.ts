// path: mahjong-ts/src/server/ws/protocol.ts
import { Move, GameState, PlayerId } from '../../types';

export type ISO8601 = string; // e.g., new Date().toISOString()

export type BaseMsg = {
  traceId: string;
  ts: ISO8601;
  type: string;
};

// Client -> Server
export type AuthMsg = BaseMsg & {
  type: 'auth';
  token: string;
};

export type SubscribeMsg = BaseMsg & {
  type: 'subscribe';
  tableId: string;
  // Optional client-provided seed to participate in deterministic RNG
  // If omitted, the server will generate a random clientSeed per new table
  clientSeed?: string;
};

export type PlayerActionMsg = BaseMsg & {
  type: 'player_action';
  tableId: string;
  action: Move;
};

export type ReplayRequestMsg = BaseMsg & {
  type: 'replay_request';
  tableId: string;
  fromIndex?: number;
};

export type ChatMessageMsg = BaseMsg & {
  type: 'chat_message';
  tableId: string;
  text: string;
};

export type CreateTableMsg = BaseMsg & {
  type: 'create_table';
  // Optional client-provided seed to participate in deterministic RNG
  clientSeed?: string;
  username?: string;
  sessionToken?: string; // For reconnection
};

export type JoinTableMsg = BaseMsg & {
  type: 'join_table';
  inviteCode: string;
  // Optional client-provided seed to participate in deterministic RNG
  clientSeed?: string;
  username?: string;
  sessionToken?: string; // For reconnection
};

export type LeaveTableMsg = BaseMsg & {
  type: 'leave_table';
};

export type GetMyTablesMsg = BaseMsg & {
  type: 'get_my_tables';
};

export type PresenceUpdateMsg = BaseMsg & {
  type: 'presence_update';
  status: 'online' | 'away' | 'offline';
};

// Admin messages
export type AdminAuthMsg = BaseMsg & {
  type: 'admin_auth';
  password: string;
};

export type AdminListTablesMsg = BaseMsg & {
  type: 'admin_list_tables';
};

export type AdminJoinTableMsg = BaseMsg & {
  type: 'admin_join_table';
  inviteCode: string;
};

// Charleston messages
export type CharlestonSelectMsg = BaseMsg & {
  type: 'charleston_select';
  tableId: string;
  tiles: string[]; // Tiles selected to pass
  blindPass?: {
    enabled: boolean;
    count: 0 | 1 | 2; // How many tiles to take from incoming
  };
};

export type CharlestonReadyMsg = BaseMsg & {
  type: 'charleston_ready';
  tableId: string;
};

export type CharlestonVoteMsg = BaseMsg & {
  type: 'charleston_vote';
  tableId: string;
  vote: 'yes' | 'no'; // Vote for second Charleston
};

export type CharlestonCourtesyMsg = BaseMsg & {
  type: 'charleston_courtesy';
  tableId: string;
  tiles: string[]; // 0-3 tiles to offer
  targetPlayer: number; // PlayerId to trade with
};

export type ClientToServer =
  | AuthMsg
  | SubscribeMsg
  | PlayerActionMsg
  | ReplayRequestMsg
  | ChatMessageMsg
  | CreateTableMsg
  | JoinTableMsg
  | LeaveTableMsg
  | GetMyTablesMsg
  | PresenceUpdateMsg
  | AdminAuthMsg
  | AdminListTablesMsg
  | AdminJoinTableMsg
  | CharlestonSelectMsg
  | CharlestonReadyMsg
  | CharlestonVoteMsg
  | CharlestonCourtesyMsg;

// Server -> Client
export type GameStateDelta = Partial<GameState> & { logsAppend?: GameState['logs'] };

export type GameStateUpdateMsg = BaseMsg & {
  type: 'game_state_update';
  tableId: string;
  full?: GameState;
  delta?: GameStateDelta;
};

export type ActionResultMsg = BaseMsg & {
  type: 'action_result';
  tableId: string;
  ok: boolean;
  error?: { code: string; message: string };
  applied?: Move;
};

export type ReplayChunkMsg = BaseMsg & {
  type: 'replay_chunk';
  tableId: string;
  startIndex: number;
  logs: GameState['logs'];
  nextIndex?: number;
};

export type TableCreatedMsg = BaseMsg & {
  type: 'table_created';
  tableId: string;
  inviteCode: string;
  serverCommit?: string; // fairness commitment
  sessionToken: string; // For reconnection
};

export type TableJoinedMsg = BaseMsg & {
  type: 'table_joined';
  tableId: string;
  inviteCode: string;
  players: number;
  serverCommit?: string; // fairness commitment
  sessionToken: string; // For reconnection
  reconnected?: boolean; // True if this was a reconnection
};

export type TableLeftMsg = BaseMsg & {
  type: 'table_left';
  tableId: string;
};

export type MyTablesMsg = BaseMsg & {
  type: 'my_tables';
  tables: { tableId: string; inviteCode: string; isCreator: boolean }[];
};

export type LobbyUpdateMsg = BaseMsg & {
  type: 'lobby_update';
  tables: { id: string; inviteCode: string; players: number; started: boolean }[];
};

export type PlayerCountUpdateMsg = BaseMsg & {
  type: 'player_count_update';
  tableId: string;
  players: number;
  ready: boolean; // true if 4 players present
};

export type PlayerInfo = {
  playerId: number;
  username: string;
  isDealer?: boolean;
  seatPosition?: number; // 0-3, assigned based on join order
  connected?: boolean; // Connection status
  disconnectedAt?: number; // Timestamp when disconnected (for duration calc)
};

export type PlayersUpdateMsg = BaseMsg & {
  type: 'players_update';
  tableId: string;
  players: PlayerInfo[];
  yourPlayerId?: number;
};

export type GameStartMsg = BaseMsg & {
  type: 'game_start';
  tableId: string;
  dealer: number;
  yourHand: string[];
  yourPlayerId: number;
  allPlayers: PlayerInfo[]; // All 4 players with their seat positions
};

// Admin response messages
export type AdminAuthResultMsg = BaseMsg & {
  type: 'admin_auth_result';
  ok: boolean;
  error?: string;
};

export type AdminTableInfo = {
  tableId: string;
  inviteCode: string;
  playerCount: number;
  players: PlayerInfo[];
  gameStarted: boolean;
  createdAt: number;
};

export type AdminTablesListMsg = BaseMsg & {
  type: 'admin_tables_list';
  tables: AdminTableInfo[];
};

export type AdminGameViewMsg = BaseMsg & {
  type: 'admin_game_view';
  tableId: string;
  inviteCode: string;
  gameState: GameState | null;
  allHands: { [playerId: number]: string[] };
  players: PlayerInfo[];
  gameStarted: boolean;
  paused?: boolean;
};

// Game pause/resume messages
export type GamePausedMsg = BaseMsg & {
  type: 'game_paused';
  tableId: string;
  disconnectedPlayers: PlayerInfo[]; // List of disconnected players
};

export type GameResumedMsg = BaseMsg & {
  type: 'game_resumed';
  tableId: string;
};

// Charleston phase types
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

export type CharlestonPlayerState = {
  playerId: number;
  selectedTiles: string[];
  ready: boolean;
  blindPass?: {
    enabled: boolean;
    count: 0 | 1 | 2;
  };
  vote?: 'yes' | 'no';
  courtesyOffer?: {
    tiles: string[];
    targetPlayer: number;
  };
};

// Charleston state update message
export type CharlestonStateMsg = BaseMsg & {
  type: 'charleston_state';
  tableId: string;
  phase: CharlestonPhase;
  playerStates: CharlestonPlayerState[];
  passNumber: number; // 1-6 for tracking progress
  canBlindPass: boolean; // True on pass 3 and 6
  message: string; // Instructions for current phase
};

// Charleston pass execution message
export type CharlestonPassExecutedMsg = BaseMsg & {
  type: 'charleston_pass_executed';
  tableId: string;
  passNumber: number;
  yourNewTiles: string[]; // Tiles you received
  blindPassInfo?: { // Info about who did blind passes
    playerId: number;
    count: number;
  }[];
};

// Charleston vote results
export type CharlestonVoteResultMsg = BaseMsg & {
  type: 'charleston_vote_result';
  tableId: string;
  yesVotes: number;
  noVotes: number;
  secondCharlestonHappens: boolean; // True if >=3 yes votes
};

// Charleston complete message
export type CharlestonCompleteMsg = BaseMsg & {
  type: 'charleston_complete';
  tableId: string;
};

export type ServerToClient =
  | GameStateUpdateMsg
  | ActionResultMsg
  | ReplayChunkMsg
  | TableCreatedMsg
  | TableJoinedMsg
  | TableLeftMsg
  | MyTablesMsg
  | LobbyUpdateMsg
  | PlayerCountUpdateMsg
  | PlayersUpdateMsg
  | GameStartMsg
  | GamePausedMsg
  | GameResumedMsg
  | CharlestonStateMsg
  | CharlestonPassExecutedMsg
  | CharlestonVoteResultMsg
  | CharlestonCompleteMsg
  | PresenceUpdateMsg
  | ChatMessageMsg
  | AdminAuthResultMsg
  | AdminTablesListMsg
  | AdminGameViewMsg;

export function nowIso(): ISO8601 { return new Date().toISOString(); }



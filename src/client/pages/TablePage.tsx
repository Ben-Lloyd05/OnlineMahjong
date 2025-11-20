import React, { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Table from '../ui/components/Table';
import RuleCardSelector from '../ui/components/RuleCardSelector';
import { SeatingSquare } from '../ui/components/SeatingSquare';
import { GamePausedOverlay } from '../ui/components/GamePausedOverlay';
import CharlestonUI from '../ui/components/CharlestonUI';
import { HandSelector } from '../ui/components/HandSelector';
import { SelectedHandDisplay } from '../ui/components/SelectedHandDisplay';
import { Exposures } from '../ui/components/Exposures';
import LegalHandsModal from '../ui/components/LegalHandsModal';
import JokerExchangeModal from '../ui/components/JokerExchangeModal';
import { DiscardPile } from '../ui/components/DiscardPile';
// Correct path to root JSON file (4 levels up from this file's directory)
import handsData from '../../../nmjl_mahjong_hands_filled.json';
import { ServerToClient } from '../../server/ws/protocol';

interface TablePageProps {
  messages: ServerToClient[];
  onLeaveTable: () => void;
  onJoinTable: (inviteCode: string, clientSeed?: string, username?: string) => void;
  onSendMessage: (msg: any) => void; // For sending Charleston messages
}

export default function TablePage({ messages, onLeaveTable, onJoinTable, onSendMessage }: TablePageProps) {
  const navigate = useNavigate();
  const { inviteCode } = useParams<{ inviteCode: string }>();
  const [year, setYear] = React.useState<2024 | 2025>(2025);
  const [wsReady, setWsReady] = React.useState(false);
  const hasJoinedRef = React.useRef(false); // Use ref instead of state to prevent re-renders
  const hasReconnectedRef = React.useRef(false); // Track if we've already attempted reconnection
  const [currentHand, setCurrentHand] = React.useState<string[]>([]); // Track current hand through Charleston
  const processedCharlestonPassesRef = React.useRef<Set<string>>(new Set()); // Track processed Charleston passes

  // Gameplay state
  const [isHandSelectorOpen, setIsHandSelectorOpen] = React.useState(false);
  const [selectedHandInfo, setSelectedHandInfo] = React.useState<{
    index: number;
    name: string;
    category: string;
    sections: string[];
  } | null>(null);
  const [selectedTilesForClaim, setSelectedTilesForClaim] = React.useState<string[]>([]);
  const [isClaimWindowOpen, setIsClaimWindowOpen] = React.useState(false);
  const [currentClaimableTile, setCurrentClaimableTile] = React.useState<string | null>(null);
  const [showHandsModal, setShowHandsModal] = React.useState(false);
  const [showJokerModal, setShowJokerModal] = React.useState(false);
  const [jokerCtx, setJokerCtx] = React.useState<{ targetPlayer: number; exposureIndex: number; jokerIndex: number } | null>(null);
  const [jokerExchangeLoading, setJokerExchangeLoading] = React.useState(false);

  // Mark WebSocket as ready after a short delay (ensures connection is established)
  React.useEffect(() => {
    const timer = setTimeout(() => {
      console.log('[TablePage] Marking WebSocket as ready');
      setWsReady(true);
    }, 500); // 500ms should be plenty for WebSocket to connect
    
    return () => clearTimeout(timer);
  }, []);

  // Auto-join table if we landed on this page via direct URL or page refresh
  React.useEffect(() => {
    if (!inviteCode || !wsReady) {
      if (inviteCode && !wsReady) {
        console.log('[TablePage] Waiting for WebSocket to be ready...');
      }
      return;
    }
    
    // Check if we've received a join/create message for this table
    const alreadyJoinedOrCreated = messages.find((msg: any) => 
      (msg.type === 'table_joined' || msg.type === 'table_created') && 
      msg.inviteCode === inviteCode
    );
    
    if (alreadyJoinedOrCreated) {
      // We already have a join/create message for this table
      if (!hasJoinedRef.current) {
        console.log('[TablePage] Found existing join/create message for table:', inviteCode, '- marking as joined');
        hasJoinedRef.current = true;
      }
      
      // Check if this might be a page refresh by looking for a stored session token
      const storedSessionToken = localStorage.getItem(`mahjong_session_${inviteCode}`);
      
      // Only reconnect if:
      // 1. We have a stored session token (indicates we were previously connected)
      // 2. We haven't already reconnected this component instance
      // 3. The WebSocket is ready
      if (storedSessionToken && !hasReconnectedRef.current) {
        hasReconnectedRef.current = true;
        console.log('[TablePage] Page refresh detected - reconnecting to table:', inviteCode);
        const clientSeed = globalThis.crypto && 'randomUUID' in globalThis.crypto 
          ? (globalThis.crypto as any).randomUUID() 
          : Math.random().toString(36).slice(2);
        const username = localStorage.getItem('mahjong_username') || 'Guest';
        onJoinTable(inviteCode, clientSeed, username);
      }
      return; // Important: return early - no auto-join needed
    }
    
    // If we've already attempted to join, don't try again
    if (hasJoinedRef.current) {
      console.log('[TablePage] Already attempted join, not trying again');
      return;
    }
    
    // No message at all - this must be someone following a shared link
    // They need to explicitly join via the UI, not auto-join
    // The SeatingSquare component should show a "Join Table" button
    console.log('[TablePage] No join/create message found - user needs to manually join');
    
    // Don't auto-join - let the user decide if they want to join this table
  }, [inviteCode, wsReady, messages, onJoinTable]);

  // Get the most recent game state update
  const gameSnapshot = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if ((messages[i] as any).type === 'game_state_update' && (messages[i] as any).full) {
        return messages[i] as any;
      }
    }
    return null;
  }, [messages]);

  // Get the most recent player count update
  const playerCountInfo = useMemo(() => {
    console.log('[TablePage] Recalculating player count from', messages.length, 'messages');
    
    // Get the current table ID from messages
    const joinMsg = messages.find((m: any) => 
      (m.type === 'table_created' || m.type === 'table_joined') && 
      m.inviteCode === inviteCode
    ) as any;
    
    const currentTableId = joinMsg?.tableId;
    if (!currentTableId) {
      console.log('[TablePage] No current tableId found for player count');
      return { players: 1, ready: false };
    }
    
    // Look for most recent player_count_update FOR THIS TABLE ONLY
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i] as any;
      if (msg.type === 'player_count_update' && msg.tableId === currentTableId) {
        console.log('[TablePage] Found player_count_update for current table:', msg);
        return msg;
      }
    }
    console.log('[TablePage] No player_count_update found for current table, using default');
    return { players: 1, ready: false };
  }, [messages, inviteCode]);

  // Get the most recent players update (names and info)
  const playersInfo = useMemo(() => {
    // Get the current table ID from messages
    const joinMsg = messages.find((m: any) => 
      (m.type === 'table_created' || m.type === 'table_joined') && 
      m.inviteCode === inviteCode
    ) as any;
    
    const currentTableId = joinMsg?.tableId;
    if (!currentTableId) {
      console.log('[TablePage] No current tableId found');
      return null;
    }
    
    // Look for most recent players_update FOR THIS TABLE ONLY
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i] as any;
      if (msg.type === 'players_update' && msg.tableId === currentTableId) {
        console.log('[TablePage] Found players_update for current table:', msg);
        return msg;
      }
    }
    console.log('[TablePage] No players_update found for current table');
    return null;
  }, [messages, inviteCode]);

  // Get the game start message (with your hand) for THIS specific table
  const gameStartInfo = useMemo(() => {
    // Get the current table ID from messages
    const joinMsg = messages.find((m: any) => 
      (m.type === 'table_created' || m.type === 'table_joined') && 
      m.inviteCode === inviteCode
    ) as any;
    
    const currentTableId = joinMsg?.tableId;
    
    if (!currentTableId) return null;
    
    // Only look for game_start messages for this specific table
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i] as any;
      if (msg.type === 'game_start' && msg.tableId === currentTableId) {
        console.log('[TablePage] Found game_start for current table:', msg);
        return msg;
      }
    }
    console.log('[TablePage] No game_start found for current table');
    return null;
  }, [messages, inviteCode]);

  // Get Charleston state
  const charlestonInfo = useMemo(() => {
    // Get the current table ID from messages
    const joinMsg = messages.find((m: any) => 
      (m.type === 'table_created' || m.type === 'table_joined') && 
      m.inviteCode === inviteCode
    ) as any;
    
    const currentTableId = joinMsg?.tableId;
    if (!currentTableId) return null;
    
    // Look for most recent charleston_state message
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i] as any;
      if (msg.type === 'charleston_state' && msg.tableId === currentTableId) {
        console.log('[TablePage] Found charleston_state:', msg);
        return msg;
      }
      // Check if Charleston completed
      if (msg.type === 'charleston_complete' && msg.tableId === currentTableId) {
        console.log('[TablePage] Charleston complete');
        return null; // Charleston finished
      }
    }
    return null;
  }, [messages, inviteCode]);

  // Gameplay phase info
  const gameplayPhase = useMemo(() => {
    const joinMsg = messages.find((m: any) => 
      (m.type === 'table_created' || m.type === 'table_joined') && 
      m.inviteCode === inviteCode
    ) as any;
    const currentTableId = joinMsg?.tableId;
    if (!currentTableId) return null;

    // Check if we're in play phase
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i] as any;
      if (msg.type === 'game_state_update' && msg.tableId === currentTableId) {
        if (msg.delta?.phase === 'play' || msg.full?.phase === 'play') {
          return 'play';
        }
      }
    }
    return null;
  }, [messages, inviteCode]);

  // Get current turn info
  const turnInfo = useMemo(() => {
    const joinMsg = messages.find((m: any) => 
      (m.type === 'table_created' || m.type === 'table_joined') && 
      m.inviteCode === inviteCode
    ) as any;
    const currentTableId = joinMsg?.tableId;
    if (!currentTableId) return null;

    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i] as any;
      if (msg.type === 'turn_start' && msg.tableId === currentTableId) {
        return msg;
      }
    }
    return null;
  }, [messages, inviteCode]);

  // Get discard pile
  const discardPile = useMemo(() => {
    const joinMsg = messages.find((m: any) => 
      (m.type === 'table_created' || m.type === 'table_joined') && 
      m.inviteCode === inviteCode
    ) as any;
    const currentTableId = joinMsg?.tableId;
    if (!currentTableId) return [];

    const discards: { player: number; tile: string }[] = [];
    for (const msg of messages) {
      const m = msg as any;
      if (m.type === 'tile_discarded' && m.tableId === currentTableId) {
        discards.push({ player: m.player, tile: m.tile });
      }
    }
    return discards;
  }, [messages, inviteCode]);

  // Get current claim window
  const claimWindowInfo = useMemo(() => {
    const joinMsg = messages.find((m: any) => 
      (m.type === 'table_created' || m.type === 'table_joined') && 
      m.inviteCode === inviteCode
    ) as any;
    const currentTableId = joinMsg?.tableId;
    if (!currentTableId) return null;

    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i] as any;
      if (msg.type === 'claim_window' && msg.tableId === currentTableId) {
        // Check if still valid
        if (msg.expiresAt > Date.now()) {
          return msg;
        }
      }
    }
    return null;
  }, [messages, inviteCode]);

  // Get exposures for all players
  const playerExposures = useMemo(() => {
    const joinMsg = messages.find((m: any) => 
      (m.type === 'table_created' || m.type === 'table_joined') && 
      m.inviteCode === inviteCode
    ) as any;
    const currentTableId = joinMsg?.tableId;
    if (!currentTableId) return { 0: [], 1: [], 2: [], 3: [] };

    const exposures: { [key: number]: any[] } = { 0: [], 1: [], 2: [], 3: [] };
    for (const msg of messages) {
      const m = msg as any;
      if (m.type === 'claim_made' && m.tableId === currentTableId) {
        exposures[m.player].push({
          tiles: m.exposedTiles,
          claimedTile: m.claimedTile
        });
      }
      if (m.type === 'joker_exchanged' && m.tableId === currentTableId) {
        const { targetPlayer, exposureIndex, jokerIndex, replacementTile } = m;
        if (exposures[targetPlayer] && exposures[targetPlayer][exposureIndex]) {
          // Replace joker with natural tile in stored exposure tiles
          exposures[targetPlayer][exposureIndex].tiles[jokerIndex] = replacementTile;
        }
      }
    }
    return exposures;
  }, [messages, inviteCode]);

  const handleSendJokerExchange = React.useCallback((replacementTile: string) => {
    if (!jokerCtx) return;
    const joinMsg = messages.find((m: any) => 
      (m.type === 'table_created' || m.type === 'table_joined') && 
      m.inviteCode === inviteCode
    ) as any;
    const tableId = joinMsg?.tableId;
    if (!tableId || !gameStartInfo) return;
    setJokerExchangeLoading(true);
    const ts = new Date().toISOString();
    const traceId = (globalThis.crypto && 'randomUUID' in globalThis.crypto) ? (globalThis.crypto as any).randomUUID() : Math.random().toString(36).slice(2);
    onSendMessage({
      type: 'exchange_joker',
      traceId,
      ts,
      tableId,
      targetPlayer: jokerCtx.targetPlayer,
      exposureIndex: jokerCtx.exposureIndex,
      jokerIndex: jokerCtx.jokerIndex,
      replacementTile
    });
    // Close modal optimistically; will refresh on broadcast
    setTimeout(() => {
      setJokerExchangeLoading(false);
      setShowJokerModal(false);
      setJokerCtx(null);
    }, 300);
  }, [jokerCtx, messages, inviteCode, onSendMessage, gameStartInfo]);

  // Gameplay handlers
  const handleSelectHand = React.useCallback((handIndex: number, handName: string, category: string) => {
    const joinMsg = messages.find((m: any) => 
      (m.type === 'table_created' || m.type === 'table_joined') && 
      m.inviteCode === inviteCode
    ) as any;
    const tableId = joinMsg?.tableId;
    if (!tableId) return;

    // Find sections from handsData
    const categories = Object.keys(handsData);
    let sections: string[] = [];
    for (const cat of categories) {
      const hands = handsData[cat as keyof typeof handsData];
      for (const [name, sec] of Object.entries(hands)) {
        if (name === handName && cat === category) {
          sections = sec as string[];
          break;
        }
      }
    }

    setSelectedHandInfo({ index: handIndex, name: handName, category, sections });
    
    onSendMessage({
      type: 'select_hand',
      tableId,
      handIndex,
      traceId: crypto.randomUUID(),
      ts: new Date().toISOString()
    });
  }, [messages, inviteCode, onSendMessage]);

  const handleDrawTile = React.useCallback(() => {
    const joinMsg = messages.find((m: any) => 
      (m.type === 'table_created' || m.type === 'table_joined') && 
      m.inviteCode === inviteCode
    ) as any;
    const tableId = joinMsg?.tableId;
    if (!tableId) return;

    onSendMessage({
      type: 'draw_tile',
      tableId,
      traceId: crypto.randomUUID(),
      ts: new Date().toISOString()
    });
  }, [messages, inviteCode, onSendMessage]);

  const handleDiscardTile = React.useCallback((tile: string) => {
    const joinMsg = messages.find((m: any) => 
      (m.type === 'table_created' || m.type === 'table_joined') && 
      m.inviteCode === inviteCode
    ) as any;
    const tableId = joinMsg?.tableId;
    if (!tableId) return;

    // Remove tile from current hand
    setCurrentHand(prev => {
      const newHand = [...prev];
      const idx = newHand.indexOf(tile);
      if (idx !== -1) newHand.splice(idx, 1);
      return newHand;
    });

    onSendMessage({
      type: 'discard_tile',
      tableId,
      tile,
      traceId: crypto.randomUUID(),
      ts: new Date().toISOString()
    });
  }, [messages, inviteCode, onSendMessage]);

  const handleClaimDiscard = React.useCallback(() => {
    const joinMsg = messages.find((m: any) => 
      (m.type === 'table_created' || m.type === 'table_joined') && 
      m.inviteCode === inviteCode
    ) as any;
    const tableId = joinMsg?.tableId;
    if (!tableId) return;

    onSendMessage({
      type: 'claim_discard',
      tableId,
      exposureTiles: selectedTilesForClaim,
      traceId: crypto.randomUUID(),
      ts: new Date().toISOString()
    });

    // Clear claim state
    setSelectedTilesForClaim([]);
    setIsClaimWindowOpen(false);
  }, [messages, inviteCode, onSendMessage, selectedTilesForClaim]);

  const handlePassClaim = React.useCallback(() => {
    const joinMsg = messages.find((m: any) => 
      (m.type === 'table_created' || m.type === 'table_joined') && 
      m.inviteCode === inviteCode
    ) as any;
    const tableId = joinMsg?.tableId;
    if (!tableId) return;

    onSendMessage({
      type: 'pass_claim',
      tableId,
      traceId: crypto.randomUUID(),
      ts: new Date().toISOString()
    });

    setIsClaimWindowOpen(false);
  }, [messages, inviteCode, onSendMessage]);

  // Listen for claim windows
  React.useEffect(() => {
    if (claimWindowInfo && gameStartInfo) {
      // Don't show claim window for your own discards
      if (claimWindowInfo.discardedBy !== gameStartInfo.yourPlayerId) {
        setIsClaimWindowOpen(true);
        setCurrentClaimableTile(claimWindowInfo.discardedTile);
      }
    } else {
      setIsClaimWindowOpen(false);
      setCurrentClaimableTile(null);
    }
  }, [claimWindowInfo, gameStartInfo]);

  // Listen for tile draws
  React.useEffect(() => {
    const joinMsg = messages.find((m: any) => 
      (m.type === 'table_created' || m.type === 'table_joined') && 
      m.inviteCode === inviteCode
    ) as any;
    const currentTableId = joinMsg?.tableId;
    if (!currentTableId || !gameStartInfo) return;

    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i] as any;
      if (msg.type === 'tile_drawn' && msg.tableId === currentTableId && msg.player === gameStartInfo.yourPlayerId && msg.tile) {
        // Add drawn tile to hand if not already there
        if (!currentHand.includes(msg.tile)) {
          setCurrentHand(prev => [...prev, msg.tile]);
        }
        break;
      }
    }
  }, [messages, inviteCode, gameStartInfo, currentHand]);

  // Get storage key for tile order
  const getTileOrderStorageKey = React.useCallback(() => {
    const joinMsg = messages.find((m: any) => 
      (m.type === 'table_created' || m.type === 'table_joined') && 
      m.inviteCode === inviteCode
    ) as any;
    
    const tableId = joinMsg?.tableId;
    const playerId = gameStartInfo?.yourPlayerId;
    
    if (!tableId || playerId === undefined) return null;
    return `mahjong_tile_order_${tableId}_${playerId}`;
  }, [messages, inviteCode, gameStartInfo]);

  // Update current hand when we receive new tiles from Charleston
  React.useEffect(() => {
    if (!gameStartInfo) return;
    
    const storageKey = getTileOrderStorageKey();
    
    // Get current table ID
    const joinMsg = messages.find((m: any) => 
      (m.type === 'table_created' || m.type === 'table_joined') && 
      m.inviteCode === inviteCode
    ) as any;
    
    const currentTableId = joinMsg?.tableId;
    if (!currentTableId) return;
    
    // Initialize with starting hand (or most recent Charleston hand)
    if (currentHand.length === 0 && gameStartInfo.yourHand) {
      // First check if there's a Charleston pass that has already happened
      let mostRecentCharlestonHand: string[] | null = null;
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i] as any;
        if (msg.type === 'charleston_pass_executed' && msg.tableId === currentTableId) {
          console.log('[TablePage] Found most recent Charleston hand on init:', msg.yourNewTiles);
          mostRecentCharlestonHand = msg.yourNewTiles;
          break;
        }
      }
      
      // Use Charleston hand if available, otherwise use starting hand
      const handToUse = mostRecentCharlestonHand || gameStartInfo.yourHand;
      
      // Try to restore saved order from localStorage
      if (storageKey) {
        try {
          const savedOrder = localStorage.getItem(storageKey);
          if (savedOrder) {
            const parsedOrder = JSON.parse(savedOrder);
            // Verify all tiles in saved order exist in current hand
            const allTilesValid = parsedOrder.every((tile: string) => handToUse.includes(tile));
            const allTilesPresent = handToUse.every((tile: string) => parsedOrder.includes(tile));
            
            if (allTilesValid && allTilesPresent && parsedOrder.length === handToUse.length) {
              console.log('[TablePage] Restored tile order from localStorage');
              setCurrentHand(parsedOrder);
              return;
            }
          }
        } catch (e) {
          console.error('[TablePage] Failed to restore tile order:', e);
        }
      }
      
      setCurrentHand(handToUse);
      return;
    }
    
    // Update hand when Charleston pass executed (only process NEW messages)
    // Find most recent charleston_pass_executed that we haven't processed yet
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i] as any;
      if (msg.type === 'charleston_pass_executed' && msg.tableId === currentTableId) {
        const msgKey = `${msg.passNumber}_${msg.ts}`;
        
        if (processedCharlestonPassesRef.current.has(msgKey)) {
          // Already processed this one
          break;
        }
        
        console.log('[TablePage] Processing new Charleston pass:', msg.yourNewTiles);
        processedCharlestonPassesRef.current.add(msgKey);
        
        // Set hand to exactly what the server sent - the server is authoritative
        setCurrentHand(msg.yourNewTiles);
        break;
      }
    }
  }, [messages, gameStartInfo, inviteCode, getTileOrderStorageKey]);

  // Save tile order to localStorage whenever it changes
  React.useEffect(() => {
    if (currentHand.length === 0) return;
    
    const storageKey = getTileOrderStorageKey();
    if (!storageKey) return;
    
    try {
      localStorage.setItem(storageKey, JSON.stringify(currentHand));
      console.log('[TablePage] Saved tile order to localStorage');
    } catch (e) {
      console.error('[TablePage] Failed to save tile order:', e);
    }
  }, [currentHand, getTileOrderStorageKey]);

  // Handler for tile reordering
  const handleReorderHand = React.useCallback((newOrder: string[]) => {
    console.log('[TablePage] Reordering hand:', newOrder);
    setCurrentHand(newOrder);
  }, []);

  // Check if we received a "table full" error
  const tableFull = useMemo(() => {
    // Look for the most recent error messages
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i] as any;
      if (msg.type === 'action_result' && !msg.ok) {
        if (msg.error?.code === 'table_full' || msg.error?.message?.includes('full')) {
          return true;
        }
      }
    }
    return false;
  }, [messages]);

  // Calculate seating arrangement for the seating square
  // MUST be before any early returns to avoid hooks order violation
  const seatingPlayers = useMemo(() => {
    console.log('[TablePage] Calculating seatingPlayers, gameStartInfo:', gameStartInfo);
    
    // If no game started, return empty
    if (!gameStartInfo) return [];
    
    const yourPosition = gameStartInfo.yourPlayerId;
    const dealer = gameStartInfo.dealer;
    
    // Try to use allPlayers if available (new format)
    let allPlayers = gameStartInfo.allPlayers;
    
    // Fallback: construct from playersInfo if allPlayers is missing (old games)
    if (!allPlayers && playersInfo?.players) {
      console.log('[TablePage] Using fallback: constructing allPlayers from playersInfo');
      allPlayers = playersInfo.players.map((player: any) => ({
        playerId: player.playerId,
        username: player.username,
        isDealer: player.playerId === dealer,
        seatPosition: player.playerId
      }));
    }
    
    if (!allPlayers || allPlayers.length === 0) {
      console.log('[TablePage] No allPlayers data available, returning empty array');
      return [];
    }
          <LegalHandsModal isOpen={showHandsModal} onClose={() => setShowHandsModal(false)} />
    
    console.log('[TablePage] Building seating square with allPlayers:', allPlayers);
    
    // Calculate relative positions for each player
    // You are always at bottom, others arranged clockwise
    return allPlayers.map((player: any) => {
              <button
                onClick={() => setShowHandsModal(true)}
                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 rounded text-sm font-semibold shadow shadow-emerald-900/50"
              >View Hands</button>
      const seatPos = player.seatPosition ?? player.playerId;
      // Calculate relative position from your perspective
      const relativePos = (seatPos - yourPosition + 4) % 4;
      
      // Map relative position to visual position
      const positionMap = ['bottom', 'right', 'top', 'left'] as const;
      const position = positionMap[relativePos];
      
      // Determine card count: dealer has 14, others have 13
      const cardCount = player.isDealer ? 14 : 13;
      
      return {
        username: player.username,
        isDealer: player.isDealer || false,
        cardCount,
        position
      };
    });
  }, [gameStartInfo, playersInfo]);

  // Check if game is paused
  const gamePauseInfo = useMemo(() => {
    // Get the current table ID from messages
    const joinMsg = messages.find((m: any) => 
      (m.type === 'table_created' || m.type === 'table_joined') && 
      m.inviteCode === inviteCode
    ) as any;
    
    const currentTableId = joinMsg?.tableId;
    if (!currentTableId) return null;
    
    // Look for most recent game_paused or game_resumed message FOR THIS TABLE ONLY
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i] as any;
      // Only consider messages for the current table
      if (msg.tableId !== currentTableId) continue;
      
      if (msg.type === 'game_resumed') {
        return null; // Game was paused but now resumed
      }
      if (msg.type === 'game_paused') {
        return {
          disconnectedPlayers: msg.disconnectedPlayers || []
        };
      }
    }
    return null;
  }, [messages, inviteCode]);

  // Use invite code from URL
  const currentInviteCode = inviteCode || 'Unknown';

  const handleLeaveTable = () => {
    // Clear saved tile order when leaving the table
    const storageKey = getTileOrderStorageKey();
    if (storageKey) {
      try {
        localStorage.removeItem(storageKey);
        console.log('[TablePage] Cleared tile order from localStorage');
      } catch (e) {
        console.error('[TablePage] Failed to clear tile order:', e);
      }
    }
    
    onLeaveTable();
    navigate('/');
  };

  const handleReturnToLobby = () => {
    // Clear saved tile order when returning to lobby
    const storageKey = getTileOrderStorageKey();
    if (storageKey) {
      try {
        localStorage.removeItem(storageKey);
        console.log('[TablePage] Cleared tile order from localStorage');
      } catch (e) {
        console.error('[TablePage] Failed to clear tile order:', e);
      }
    }
    
    navigate('/');
  };

  // Charleston handlers
  const handleCharlestonSelectTiles = (tiles: string[], blindPass?: { enabled: boolean; count: 0 | 1 | 2 }) => {
    const joinMsg = messages.find((m: any) => 
      (m.type === 'table_created' || m.type === 'table_joined') && 
      m.inviteCode === inviteCode
    ) as any;
    
    if (!joinMsg?.tableId) return;
    
    onSendMessage({
      type: 'charleston_select',
      tableId: joinMsg.tableId,
      tiles,
      blindPass,
      traceId: crypto.randomUUID(),
      ts: new Date().toISOString()
    });
  };

  const handleCharlestonReady = () => {
    const joinMsg = messages.find((m: any) => 
      (m.type === 'table_created' || m.type === 'table_joined') && 
      m.inviteCode === inviteCode
    ) as any;
    
    if (!joinMsg?.tableId) return;
    
    onSendMessage({
      type: 'charleston_ready',
      tableId: joinMsg.tableId,
      traceId: crypto.randomUUID(),
      ts: new Date().toISOString()
    });
  };

  const handleCharlestonVote = (vote: 'yes' | 'no') => {
    const joinMsg = messages.find((m: any) => 
      (m.type === 'table_created' || m.type === 'table_joined') && 
      m.inviteCode === inviteCode
    ) as any;
    
    if (!joinMsg?.tableId) return;
    
    onSendMessage({
      type: 'charleston_vote',
      tableId: joinMsg.tableId,
      vote,
      traceId: crypto.randomUUID(),
      ts: new Date().toISOString()
    });
  };

  // Courtesy pass removed

  // If table is full, show error screen
  if (tableFull) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-gray-900 to-gray-800">
        <div className="max-w-md w-full bg-white rounded-lg shadow-2xl p-8 text-center">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Table Full</h1>
            <p className="text-gray-600 mb-6">
              This table already has 4 players and cannot accept any more players.
            </p>
            <div className="bg-gray-100 rounded-lg p-4 mb-6">
              <p className="text-sm text-gray-700">
                Table Code: <span className="font-mono font-bold text-gray-900">{currentInviteCode}</span>
              </p>
            </div>
          </div>
          <button
            onClick={handleReturnToLobby}
            className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
          >
            Return to Lobby
          </button>
        </div>
      </div>
    );
  }

  // If game hasn't started yet, show waiting room with player names
  if (!gameStartInfo) {
    return (
      <div className="min-h-screen p-4 space-y-4 bg-gradient-to-br from-green-800 to-green-900">
        <div className="flex items-center justify-between">
          <button
            onClick={handleLeaveTable}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Return to Lobby
          </button>
          <div className="flex items-center space-x-4 text-sm text-white">
            <div className="opacity-90">
              Invite Code: <span className="font-mono font-bold text-xl">{currentInviteCode}</span>
            </div>
          </div>
        </div>
        
        <div className="max-w-2xl mx-auto mt-8">
          <div className="bg-white rounded-xl shadow-2xl p-8">
            <h2 className="text-3xl font-bold text-center mb-2 text-gray-800">Waiting for Players</h2>
            <p className="text-center text-gray-600 mb-8">Game will start when all 4 players join</p>
            
            <div className="grid grid-cols-2 gap-4 mb-8">
              {[0, 1, 2, 3].map(seat => {
                const player = playersInfo?.players?.find((p: any) => p.playerId === seat);
                console.log(`[TablePage] Seat ${seat}: player =`, player, 'from playersInfo:', playersInfo);
                return (
                  <div key={seat} className={`p-6 rounded-lg border-2 ${player ? 'bg-green-50 border-green-500' : 'bg-gray-50 border-gray-300 border-dashed'}`}>
                    <div className="text-sm text-gray-600 mb-2">Seat {seat + 1}</div>
                    {player ? (
                      <div className="font-bold text-lg text-gray-900">{player.username}</div>
                    ) : (
                      <div className="text-gray-400 italic">Waiting...</div>
                    )}
                    <br></br>
                  </div>
                );
              })}
            </div>
            
            <div className={`text-center py-4 px-6 rounded-lg ${
              playerCountInfo.ready 
                ? 'bg-green-100 text-green-800' 
                : 'bg-yellow-100 text-yellow-800'
            }`}>
              <p className="font-semibold text-lg">{playerCountInfo.players}/4 Players Connected</p>
              {!playerCountInfo.ready && (
                <p className="text-sm mt-1">Share the invite code with your friends!</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Game has started - show table with Charleston integration
  return (
    <div className="min-h-screen" style={charlestonInfo ? { 
      background: 'linear-gradient(135deg, #1a3a2e 0%, #0f2419 100%)',
      padding: 0,
      margin: 0
    } : { 
      background: 'linear-gradient(135deg, #1a3a2e 0%, #0f2419 100%)',
      padding: '1rem', 
      gap: '1rem', 
      display: 'flex', 
      flexDirection: 'column' 
    }}>
      
      {/* Room code in top left - always visible */}
      <div style={{ 
        position: 'absolute', 
        top: '1rem', 
        left: '1rem', 
        color: '#d4af37',
        background: 'linear-gradient(135deg, rgba(30, 90, 61, 0.9), rgba(15, 61, 42, 0.9))',
        padding: '0.75rem 1.25rem',
        borderRadius: '12px',
        fontSize: '0.875rem',
        fontWeight: '700',
        zIndex: 10,
        border: '2px solid rgba(212, 175, 55, 0.3)',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
        letterSpacing: '0.5px'
      }}>
        Room Code: <span style={{ fontFamily: 'monospace', fontSize: '1.25rem', color: '#4ade80' }}>{currentInviteCode}</span>
      </div>
      
      {/* Charleston Header - shown at top during Charleston */}
      {charlestonInfo && (
        <div className="charleston-header-integrated" style={{ padding: '1rem' }}>
          <div className="charleston-progress">
            <h2 style={{ color: '#fbbf24', fontSize: '2.5rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
              Charleston - Pass {charlestonInfo.passNumber}/6
            </h2>
            <div className="progress-dots" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
              {[1, 2, 3, 4, 5, 6].map(num => (
                <div 
                  key={num} 
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor: charlestonInfo.passNumber === num ? '#fbbf24' : charlestonInfo.passNumber > num ? '#22c55e' : '#6b7280',
                    transition: 'all 0.3s ease'
                  }}
                />
              ))}
            </div>
          </div>
          
          {/* Player Ready Status */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(4, 1fr)', 
            gap: '1rem', 
            marginTop: '1rem',
            maxWidth: '800px',
            marginLeft: 'auto',
            marginRight: 'auto'
          }}>
            {gameStartInfo.allPlayers.map((player: any) => {
              const state = charlestonInfo.playerStates.find((ps: any) => ps.playerId === player.playerId);
              return (
                <div 
                  key={player.playerId} 
                  style={{
                    background: state?.ready ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 255, 255, 0.1)',
                    border: player.playerId === gameStartInfo.yourPlayerId ? '2px solid #fbbf24' : '2px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: '8px',
                    padding: '0.75rem',
                    textAlign: 'center',
                    color: 'white'
                  }}
                >
                  <div style={{ fontWeight: '600' }}>
                    {player.username} {player.playerId === gameStartInfo.yourPlayerId && '(YOU)'}
                  </div>
                  <div style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>
                    {state?.ready ? '✓ Ready' : 'Waiting...'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      
      {!charlestonInfo && (
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <RuleCardSelector value={year} onChange={setYear} />
            <button
              onClick={handleLeaveTable}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Return to Lobby
            </button>
          </div>
          <div className="flex items-center space-x-4 text-sm">
            <div className="opacity-70">
              Invite Code: <span className="font-mono font-bold">{currentInviteCode}</span>
            </div>
          </div>
        </div>
      )}
      
      {/* Dealer indicator */}
      {!charlestonInfo && gameStartInfo.dealer === gameStartInfo.yourPlayerId && (
        <div className="max-w-4xl mx-auto p-4 bg-yellow-100 border-2 border-yellow-500 rounded-lg shadow-lg">
          <p className="text-center text-xl font-bold text-yellow-700">⭐ You are the Dealer! ⭐</p>
        </div>
      )}
      
      {/* Seating Square - shows all 4 players with you at bottom */}
      {seatingPlayers.length === 4 && (
        <div style={charlestonInfo ? { padding: '0 1rem' } : undefined}>
          <SeatingSquare 
            players={seatingPlayers} 
            yourHand={currentHand.length > 0 ? currentHand : gameStartInfo.yourHand}
            hideBottomHand={!!charlestonInfo}
            onReorderHand={handleReorderHand}
            onTileClick={turnInfo && turnInfo.action === 'discard' && turnInfo.currentPlayer === gameStartInfo.yourPlayerId ? handleDiscardTile : undefined}
            allowTileClick={turnInfo && turnInfo.action === 'discard' && turnInfo.currentPlayer === gameStartInfo.yourPlayerId}
          />
        </div>
      )}
      
      {/* Charleston Hand Selector - replaces bottom hand during Charleston */}
      {charlestonInfo && (
        <div style={{ marginTop: '2rem', padding: '0 1rem 1rem 1rem' }}>
          <CharlestonUI
            phase={charlestonInfo.phase}
            message={charlestonInfo.message}
            playerStates={charlestonInfo.playerStates}
            yourPlayerId={gameStartInfo.yourPlayerId}
            yourHand={currentHand.length > 0 ? currentHand : gameStartInfo.yourHand}
            canBlindPass={charlestonInfo.canBlindPass}
            passNumber={charlestonInfo.passNumber}
            allPlayers={gameStartInfo.allPlayers}
            onSelectTiles={handleCharlestonSelectTiles}
            onReady={handleCharlestonReady}
            onVote={handleCharlestonVote}
            onReorderHand={handleReorderHand}
          />
        </div>
      )}

      {/* Gameplay Phase UI */}
      {gameplayPhase === 'play' && !charlestonInfo && (
        <div className="max-w-6xl mx-auto space-y-4">
          {/* Hand Selector Button */}
          {!selectedHandInfo && (
            <div className="text-center">
              <button
                onClick={() => setIsHandSelectorOpen(true)}
                className="px-8 py-4 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-bold rounded-lg shadow-lg text-xl transition-all hover:scale-105 hover:shadow-emerald-500/50"
                style={{ animation: 'pulse 2s ease-in-out infinite' }}
              >
                📋 Select Your Hand
              </button>
            </div>
          )}

          {/* Selected Hand Display */}
          {selectedHandInfo && (
            <SelectedHandDisplay
              handName={selectedHandInfo.name}
              category={selectedHandInfo.category}
              sections={selectedHandInfo.sections}
            />
          )}

          {/* Turn Indicator */}
          {turnInfo && (
            <div className={`p-4 rounded-lg text-center font-bold text-lg transition-all ${
              turnInfo.currentPlayer === gameStartInfo.yourPlayerId
                ? 'bg-gradient-to-r from-emerald-900 to-emerald-800 border-2 border-emerald-500 text-emerald-100 shadow-lg shadow-emerald-500/50'
                : 'bg-gradient-to-r from-gray-800 to-gray-900 border-2 border-gray-600 text-gray-300'
            }`}>
              {turnInfo.currentPlayer === gameStartInfo.yourPlayerId ? (
                <>
                  🎯 Your Turn - {turnInfo.action === 'draw' ? 'Draw a Tile' : 'Discard a Tile'}
                </>
              ) : (
                <>
                  ⏳ Waiting for Player {turnInfo.currentPlayer}
                </>
              )}
            </div>
          )}

          {/* Action Buttons */}
          {turnInfo && turnInfo.currentPlayer === gameStartInfo.yourPlayerId && (
            <div className="flex justify-center gap-4">
              {turnInfo.action === 'draw' && (
                <button
                  onClick={handleDrawTile}
                  className="px-8 py-4 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-bold rounded-lg shadow-lg text-xl transition-all hover:scale-105 hover:shadow-emerald-500/50"
                >
                  🎴 Draw Tile
                </button>
              )}
              {turnInfo.action === 'discard' && (
                <div className="text-center">
                  <p className="text-emerald-300 mb-2 font-semibold">Click a tile in your hand to discard it</p>
                </div>
              )}
            </div>
          )}

          {/* Claim Window */}
          {isClaimWindowOpen && currentClaimableTile && (
            <div className="fixed inset-0 bg-black bg-opacity-80 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
              <div className="bg-gradient-to-br from-gray-900 to-gray-800 border-2 border-emerald-600 rounded-lg shadow-2xl p-6 max-w-md w-full">
                <h3 className="text-2xl font-bold mb-4 text-emerald-400">Claim Opportunity!</h3>
                <div className="mb-4">
                  <p className="text-gray-200 mb-2">Available tile: <span className="font-mono font-bold text-yellow-400 text-lg">{currentClaimableTile}</span></p>
                  <p className="text-sm text-gray-400">Select tiles from your hand to expose with this tile (minimum 3 tiles total if using jokers)</p>
                </div>
                
                <div className="mb-4">
                  <div className="flex flex-wrap gap-2">
                    {currentHand.map((tile, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setSelectedTilesForClaim(prev =>
                            prev.includes(tile)
                              ? prev.filter(t => t !== tile)
                              : [...prev, tile]
                          );
                        }}
                        className={`px-3 py-2 rounded font-mono font-bold transition-all ${
                          selectedTilesForClaim.includes(tile)
                            ? 'bg-emerald-500 text-white scale-105 shadow-lg shadow-emerald-500/50'
                            : 'bg-gray-700 hover:bg-gray-600 text-gray-200 border border-gray-600'
                        }`}
                      >
                        {tile}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleClaimDiscard}
                    disabled={selectedTilesForClaim.length === 0}
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-all"
                  >
                    Claim ({selectedTilesForClaim.length + 1} tiles)
                  </button>
                  <button
                    onClick={handlePassClaim}
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-gray-700 to-gray-800 hover:from-gray-600 hover:to-gray-700 text-white font-bold rounded-lg transition-all"
                  >
                    Pass
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Discard Pile */}
          <DiscardPile
            discards={discardPile}
            currentDiscard={claimWindowInfo ? { player: claimWindowInfo.discardedBy, tile: claimWindowInfo.discardedTile } : null}
          />

          {/* Exposures for all players (including self; jokers clickable only on others) */}
          {gameStartInfo && (
            <div className="mt-6 space-y-4">
              {[0,1,2,3].map(pid => (
                <Exposures
                  key={pid}
                  exposures={playerExposures[pid]}
                  ownerPlayerId={pid}
                  currentPlayerId={gameStartInfo.yourPlayerId}
                  onJokerClick={(ctx) => {
                    // Ensure we have tiles in hand to exchange
                    if (currentHand.filter(t => t !== 'J').length === 0) return;
                    setJokerCtx(ctx);
                    setShowJokerModal(true);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}
      <JokerExchangeModal
        isOpen={showJokerModal}
        onClose={() => { if(!jokerExchangeLoading){ setShowJokerModal(false); setJokerCtx(null);} }}
        context={jokerCtx}
        handTiles={currentHand}
        onConfirm={handleSendJokerExchange}
        loading={jokerExchangeLoading}
      />

      {/* Hand Selector Modal */}
      <HandSelector
        isOpen={isHandSelectorOpen}
        onClose={() => setIsHandSelectorOpen(false)}
        onSelectHand={handleSelectHand}
      />
      
      {/* Game Paused Overlay */}
      {gamePauseInfo && (
        <GamePausedOverlay disconnectedPlayers={gamePauseInfo.disconnectedPlayers} />
      )}
    </div>
  );
}

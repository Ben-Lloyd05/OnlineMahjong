import React, { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Table from '../ui/components/Table';
import RuleCardSelector from '../ui/components/RuleCardSelector';
import { SeatingSquare } from '../ui/components/SeatingSquare';
import { GamePausedOverlay } from '../ui/components/GamePausedOverlay';
import CharlestonUI from '../ui/components/CharlestonUI';
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
  const [hasJoinedThisSession, setHasJoinedThisSession] = React.useState(false);
  const initialMessageCountRef = React.useRef(messages.length);
  const [currentHand, setCurrentHand] = React.useState<string[]>([]); // Track current hand through Charleston

  // Mark WebSocket as ready after a short delay (ensures connection is established)
  React.useEffect(() => {
    const timer = setTimeout(() => {
      console.log('[TablePage] Marking WebSocket as ready');
      setWsReady(true);
    }, 500); // 500ms should be plenty for WebSocket to connect
    
    return () => clearTimeout(timer);
  }, []);

  // Auto-join table if we landed on this page via direct URL
  React.useEffect(() => {
    if (!inviteCode || !wsReady || hasJoinedThisSession) {
      if (inviteCode && !wsReady) {
        console.log('[TablePage] Waiting for WebSocket to be ready...');
      }
      return;
    }
    
    // Check if we've EVER received a join/create message for this table (including before mount)
    // This prevents auto-joining if we just created the table or already joined it
    const alreadyJoinedMsg = messages.find((msg: any) => 
      (msg.type === 'table_joined' || msg.type === 'table_created') && 
      msg.inviteCode === inviteCode
    );
    
    if (!alreadyJoinedMsg) {
      console.log('[TablePage] Auto-joining table via URL:', inviteCode);
      const clientSeed = globalThis.crypto && 'randomUUID' in globalThis.crypto 
        ? (globalThis.crypto as any).randomUUID() 
        : Math.random().toString(36).slice(2);
      // Get username from localStorage
      const username = localStorage.getItem('mahjong_username') || 'Guest';
      onJoinTable(inviteCode, clientSeed, username);
      setHasJoinedThisSession(true);
    } else {
      console.log('[TablePage] Already joined/created this table:', inviteCode, 'Message type:', alreadyJoinedMsg.type);
      setHasJoinedThisSession(true);
    }
  }, [inviteCode, wsReady, messages, onJoinTable, hasJoinedThisSession]);

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
    for (let i = messages.length - 1; i >= 0; i--) {
      if ((messages[i] as any).type === 'player_count_update') {
        console.log('[TablePage] Found player_count_update:', messages[i]);
        return messages[i] as any;
      }
    }
    console.log('[TablePage] No player_count_update found, using default');
    return { players: 1, ready: false };
  }, [messages]);

  // Get the most recent players update (names and info)
  const playersInfo = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if ((messages[i] as any).type === 'players_update') {
        console.log('[TablePage] Found players_update:', messages[i]);
        return messages[i] as any;
      }
    }
    console.log('[TablePage] No players_update found');
    return null;
  }, [messages]);

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
    
    // Initialize with starting hand
    if (currentHand.length === 0 && gameStartInfo.yourHand) {
      // Try to restore saved order from localStorage
      if (storageKey) {
        try {
          const savedOrder = localStorage.getItem(storageKey);
          if (savedOrder) {
            const parsedOrder = JSON.parse(savedOrder);
            // Verify all tiles in saved order exist in current hand
            const allTilesValid = parsedOrder.every((tile: string) => gameStartInfo.yourHand.includes(tile));
            const allTilesPresent = gameStartInfo.yourHand.every((tile: string) => parsedOrder.includes(tile));
            
            if (allTilesValid && allTilesPresent && parsedOrder.length === gameStartInfo.yourHand.length) {
              console.log('[TablePage] Restored tile order from localStorage');
              setCurrentHand(parsedOrder);
              return;
            }
          }
        } catch (e) {
          console.error('[TablePage] Failed to restore tile order:', e);
        }
      }
      
      setCurrentHand(gameStartInfo.yourHand);
    }
    
    // Update hand when Charleston pass executed
    const joinMsg = messages.find((m: any) => 
      (m.type === 'table_created' || m.type === 'table_joined') && 
      m.inviteCode === inviteCode
    ) as any;
    
    const currentTableId = joinMsg?.tableId;
    if (!currentTableId) return;
    
    // Find most recent charleston_pass_executed
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i] as any;
      if (msg.type === 'charleston_pass_executed' && msg.tableId === currentTableId) {
        console.log('[TablePage] Updating hand from Charleston pass:', msg.yourNewTiles);
        
        // Merge new tiles: keep existing tiles in their order, add new tiles at the end
        const existingTiles = currentHand.filter(tile => msg.yourNewTiles.includes(tile));
        const newTiles = msg.yourNewTiles.filter((tile: string) => !existingTiles.includes(tile));
        const mergedHand = [...existingTiles, ...newTiles];
        
        setCurrentHand(mergedHand);
        break;
      }
    }
  }, [messages, gameStartInfo, inviteCode, currentHand.length, getTileOrderStorageKey]);

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
    // Look for error messages after this component mounted
    const newMessages = messages.slice(initialMessageCountRef.current);
    for (let i = newMessages.length - 1; i >= 0; i--) {
      const msg = newMessages[i] as any;
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
    
    console.log('[TablePage] Building seating square with allPlayers:', allPlayers);
    
    // Calculate relative positions for each player
    // You are always at bottom, others arranged clockwise
    return allPlayers.map((player: any) => {
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
    // Look for most recent game_paused or game_resumed message
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i] as any;
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
  }, [messages]);

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
  const handleCharlestonSelectTiles = (tiles: string[], blindPass?: { enabled: boolean; count: 1 | 2 | 3 }) => {
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

  const handleCharlestonCourtesy = (tiles: string[], targetPlayer: number) => {
    const joinMsg = messages.find((m: any) => 
      (m.type === 'table_created' || m.type === 'table_joined') && 
      m.inviteCode === inviteCode
    ) as any;
    
    if (!joinMsg?.tableId) return;
    
    onSendMessage({
      type: 'charleston_courtesy',
      tableId: joinMsg.tableId,
      tiles,
      targetPlayer,
      traceId: crypto.randomUUID(),
      ts: new Date().toISOString()
    });
  };

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
      background: 'linear-gradient(to bottom right, rgb(22, 101, 52), rgb(21, 128, 61))',
      padding: 0,
      margin: 0
    } : { padding: '1rem', gap: '1rem', display: 'flex', flexDirection: 'column' }}>
      
      {/* Room code in top left - always visible */}
      <div style={{ 
        position: 'absolute', 
        top: '1rem', 
        left: '1rem', 
        color: 'white',
        background: 'rgba(0, 0, 0, 0.3)',
        padding: '0.5rem 1rem',
        borderRadius: '8px',
        fontSize: '0.875rem',
        fontWeight: '600',
        zIndex: 10
      }}>
        Room Code: <span style={{ fontFamily: 'monospace', fontSize: '1.25rem' }}>{currentInviteCode}</span>
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
            onCourtesyOffer={handleCharlestonCourtesy}
            onReorderHand={handleReorderHand}
          />
        </div>
      )}
      
      {/* Game Paused Overlay */}
      {gamePauseInfo && (
        <GamePausedOverlay disconnectedPlayers={gamePauseInfo.disconnectedPlayers} />
      )}
    </div>
  );
}

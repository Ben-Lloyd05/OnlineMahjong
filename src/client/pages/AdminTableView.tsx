import React, { useMemo, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ServerToClient } from '../../server/ws/protocol';
import Hand from '../ui/components/Hand';

interface AdminTableViewProps {
  messages: ServerToClient[];
  onAdminJoinTable: (inviteCode: string) => void;
}

export default function AdminTableView({ messages, onAdminJoinTable }: AdminTableViewProps) {
  const navigate = useNavigate();
  const { inviteCode } = useParams<{ inviteCode: string }>();
  const hasRequestedDataRef = React.useRef(false);

  // Auto-join the table when component mounts (once only)
  useEffect(() => {
    if (inviteCode && !hasRequestedDataRef.current) {
      console.log('[AdminTableView] Requesting table data for:', inviteCode);
      onAdminJoinTable(inviteCode);
      hasRequestedDataRef.current = true;
    }
  }, [inviteCode, onAdminJoinTable]);

  // Get the admin game view data
  const gameView = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i] as any;
      if (msg.type === 'admin_game_view' && msg.inviteCode === inviteCode) {
        return msg;
      }
    }
    return null;
  }, [messages, inviteCode]);

  if (!gameView) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800 p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-white mx-auto mb-4"></div>
          <p className="text-white text-lg">Loading table data...</p>
        </div>
      </div>
    );
  }

  const { allHands, players, gameStarted, gameState, paused } = gameView;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-1">
                Admin View: {inviteCode}
              </h1>
              <div className="flex items-center gap-3">
                <p className="text-gray-600">
                  {gameStarted ? 'Game In Progress' : 'Waiting for Players'}
                </p>
                {paused && (
                  <span className="px-3 py-1 bg-red-100 text-red-700 text-sm font-semibold rounded-full">
                    ⏸️ PAUSED
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => navigate('/admin')}
              className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors"
            >
              Back to Admin Panel
            </button>
          </div>
          
          {/* Player Connection Status */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4 border-t border-gray-200">
            {players.map((player: any) => (
              <div 
                key={player.playerId} 
                className={`p-3 rounded-lg border-2 ${
                  player.connected 
                    ? 'bg-green-50 border-green-300' 
                    : 'bg-red-50 border-red-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${
                    player.connected ? 'bg-green-500' : 'bg-red-500 animate-pulse'
                  }`}></div>
                  <span className="font-semibold text-sm">
                    P{player.playerId + 1}: {player.username}
                  </span>
                </div>
                {!player.connected && player.disconnectedAt && (
                  <p className="text-xs text-gray-600 mt-1">
                    DC for {Math.floor((Date.now() - player.disconnectedAt) / 1000)}s
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Game Info */}
        {gameState && (
          <div className="bg-white rounded-xl shadow-2xl p-6 mb-6">
            <div className="grid grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-gray-600 text-sm mb-1">Dealer</p>
                <p className="text-2xl font-bold text-blue-600">
                  Player {gameState.dealer + 1}
                </p>
              </div>
              <div className="text-center">
                <p className="text-gray-600 text-sm mb-1">Current Player</p>
                <p className="text-2xl font-bold text-green-600">
                  Player {gameState.currentPlayer + 1}
                </p>
              </div>
              <div className="text-center">
                <p className="text-gray-600 text-sm mb-1">Wall Remaining</p>
                <p className="text-2xl font-bold text-purple-600">
                  {gameState.wallRemaining || 0} tiles
                </p>
              </div>
              <div className="text-center">
                <p className="text-gray-600 text-sm mb-1">Round</p>
                <p className="text-2xl font-bold text-orange-600">
                  {gameState.round || 1}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* All Player Hands */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[0, 1, 2, 3].map((playerId) => {
            const player = players.find((p: any) => p.playerId === playerId);
            const hand = allHands[playerId] || [];
            const isDealer = gameState?.dealer === playerId;
            const isCurrentPlayer = gameState?.currentPlayer === playerId;

            return (
              <div
                key={playerId}
                className={`bg-white rounded-xl shadow-2xl p-6 ${
                  isCurrentPlayer ? 'ring-4 ring-green-500' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold text-gray-900">
                      Player {playerId + 1}
                    </h2>
                    {player && (
                      <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-semibold">
                        {player.username}
                      </span>
                    )}
                    {isDealer && (
                      <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-bold">
                        Dealer
                      </span>
                    )}
                    {isCurrentPlayer && (
                      <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-bold">
                        Current
                      </span>
                    )}
                  </div>
                  <span className="text-gray-600 font-medium">
                    {hand.length} tiles
                  </span>
                </div>

                {hand.length > 0 ? (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <Hand tiles={hand} />
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-lg p-8 text-center">
                    <p className="text-gray-400">No hand yet</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Discards (if available) */}
        {gameState && gameState.discards && Object.keys(gameState.discards).length > 0 && (
          <div className="bg-white rounded-xl shadow-2xl p-6 mt-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Discards</h2>
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              {[0, 1, 2, 3].map((playerId) => {
                const playerDiscards = (gameState.discards as any)[playerId] || [];
                const player = players.find((p: any) => p.playerId === playerId);

                return (
                  <div key={playerId} className="bg-gray-50 rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">
                      Player {playerId + 1} {player && `(${player.username})`}
                    </h3>
                    {playerDiscards.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {playerDiscards.map((tile: string, idx: number) => (
                          <span
                            key={idx}
                            className="px-2 py-1 bg-white border border-gray-300 rounded text-xs font-mono"
                          >
                            {tile}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-400 text-sm">No discards</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

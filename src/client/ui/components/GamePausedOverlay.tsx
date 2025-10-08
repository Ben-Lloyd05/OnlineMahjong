// path: mahjong-ts/src/client/ui/components/GamePausedOverlay.tsx
import React, { useEffect, useState } from 'react';
import './GamePausedOverlay.css';
import { PlayerInfo } from '../../../server/ws/protocol';

interface GamePausedOverlayProps {
  disconnectedPlayers: PlayerInfo[];
}

export const GamePausedOverlay: React.FC<GamePausedOverlayProps> = ({ disconnectedPlayers }) => {
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Update current time every second for duration calculation
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const formatDuration = (disconnectedAt?: number) => {
    if (!disconnectedAt) return '0s';
    
    const seconds = Math.floor((currentTime - disconnectedAt) / 1000);
    
    if (seconds < 60) {
      return `${seconds}s`;
    }
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes < 60) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  };

  return (
    <div className="game-paused-overlay">
      <div className="game-paused-content">
        <div className="pause-icon">⏸️</div>
        <h2 className="pause-title">Game Paused</h2>
        <p className="pause-subtitle">Waiting for players to reconnect...</p>
        
        <div className="disconnected-players-list">
          {disconnectedPlayers.map((player) => (
            <div key={player.playerId} className="disconnected-player-card">
              <div className="player-avatar">
                <span className="player-number">P{player.playerId + 1}</span>
              </div>
              <div className="player-info">
                <div className="player-name">{player.username}</div>
                <div className="disconnect-status">
                  <span className="status-dot"></span>
                  Disconnected for {formatDuration(player.disconnectedAt)}
                </div>
              </div>
            </div>
          ))}
        </div>
        
        <div className="pause-message">
          The game will automatically resume when all players reconnect.
        </div>
      </div>
    </div>
  );
};

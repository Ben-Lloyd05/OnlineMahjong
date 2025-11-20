// path: mahjong-ts/src/client/ui/components/Exposures.tsx
import React from 'react';
import './Exposures.css';

interface Exposure {
  tiles: string[];
  claimedTile?: string;
}

interface ExposuresProps {
  exposures: Exposure[];
  ownerPlayerId: number;
  currentPlayerId?: number;
  onJokerClick?: (ctx: { targetPlayer: number; exposureIndex: number; jokerIndex: number }) => void;
}

export function Exposures({ exposures, ownerPlayerId, currentPlayerId, onJokerClick }: ExposuresProps) {
  return (
    <div className="exposures-container">
      <h4 className="exposures-header">Player {ownerPlayerId} Exposures</h4>
      {exposures.length === 0 ? (
        <div className="no-exposures-message">No exposures yet</div>
      ) : (
        <div className="exposures-list">
          {exposures.map((exposure, idx) => (
            <div key={idx} className="exposure-section">
              <div className="exposure-tiles">
                {exposure.tiles.map((tile, tileIdx) => (
                  <div
                    key={tileIdx}
                    className={`exposure-tile ${tile === exposure.claimedTile ? 'claimed' : ''} ${tile === 'J' ? 'joker-tile' : ''} ${tile==='J' && onJokerClick && currentPlayerId!==undefined && currentPlayerId!==ownerPlayerId ? 'joker-clickable' : ''}`}
                    onClick={() => {
                      if (tile === 'J' && onJokerClick && currentPlayerId !== undefined && currentPlayerId !== ownerPlayerId) {
                        onJokerClick({ targetPlayer: ownerPlayerId, exposureIndex: idx, jokerIndex: tileIdx });
                      }
                    }}
                    title={tile === 'J' && currentPlayerId !== ownerPlayerId ? 'Exchange this Joker' : undefined}
                    role={tile==='J' && currentPlayerId!==ownerPlayerId ? 'button' : undefined}
                    aria-label={tile==='J' && currentPlayerId!==ownerPlayerId ? 'Exchange Joker' : undefined}
                  >
                    {tile}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

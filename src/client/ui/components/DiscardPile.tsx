// path: mahjong-ts/src/client/ui/components/DiscardPile.tsx
import React from 'react';
import Tile from './Tile';
import './DiscardPile.css';

interface DiscardedTile {
  player: number;
  tile: string;
}

interface DiscardPileProps {
  discards: DiscardedTile[];
  currentDiscard?: { player: number; tile: string } | null;
}

export function DiscardPile({ discards, currentDiscard }: DiscardPileProps) {
  // Get last 20 discards for display
  const recentDiscards = discards.slice(-20);

  return (
    <div className="discard-pile-container">
      <h4 className="discard-pile-header">Discard Pile</h4>
      {recentDiscards.length === 0 ? (
        <div className="empty-discard-message">No discards yet</div>
      ) : (
        <div className="discard-pile-tiles">
          {recentDiscards.map((discard, idx) => {
            const isCurrentDiscard =
              currentDiscard &&
              discard.tile === currentDiscard.tile &&
              discard.player === currentDiscard.player &&
              idx === recentDiscards.length - 1;

            return (
              <div
                key={idx}
                className={`discard-tile ${isCurrentDiscard ? 'claimable' : ''}`}
              >
                {discard.tile}
              </div>
            );
          })}
        </div>
      )}
      {discards.length > 20 && (
        <p className="text-xs text-gray-400 mt-2">
          Showing last 20 of {discards.length} discards
        </p>
      )}
    </div>
  );
}

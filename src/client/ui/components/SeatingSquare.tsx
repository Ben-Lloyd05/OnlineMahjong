// path: mahjong-ts/src/client/ui/components/SeatingSquare.tsx
import React from 'react';
import './SeatingSquare.css';

interface SeatingPlayer {
  username: string;
  isDealer: boolean;
  cardCount: number; // 13 or 14
  position: 'bottom' | 'left' | 'top' | 'right';
  hand?: string[]; // Only populated for bottom player (YOU)
}

interface SeatingSquareProps {
  players: SeatingPlayer[];
  yourHand?: string[]; // The actual tiles for YOU
  hideBottomHand?: boolean; // Hide bottom player's hand (for Charleston overlay)
  onReorderHand?: (newOrder: string[]) => void; // Callback when tiles are reordered
  onTileClick?: (tile: string) => void; // Callback when tile is clicked (for discard)
  allowTileClick?: boolean; // Whether tiles can be clicked
}

export const SeatingSquare: React.FC<SeatingSquareProps> = ({ players, yourHand, hideBottomHand, onReorderHand, onTileClick, allowTileClick }) => {
  const [draggedIndex, setDraggedIndex] = React.useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = React.useState<number | null>(null);

  // Find players by position
  const bottomPlayer = players.find(p => p.position === 'bottom');
  const leftPlayer = players.find(p => p.position === 'left');
  const topPlayer = players.find(p => p.position === 'top');
  const rightPlayer = players.find(p => p.position === 'right');

  const handleDragStart = (index: number) => (e: React.DragEvent) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.currentTarget.innerHTML);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const renderPlayer = (player: SeatingPlayer | undefined, position: string) => {
    if (!player) return null;

    const isVertical = position === 'left' || position === 'right';
    const isBottom = position === 'bottom';

    return (
      <div className={`seating-player seating-player-${position}`}>
        <div className={`player-info ${player.isDealer ? 'is-dealer' : ''}`}>
          <div className="player-name">
            {player.username} {player.isDealer && '⭐'}
          </div>
          {isBottom && <div className="you-indicator">YOU</div>}
        </div>
        {/* Don't show any cards for bottom player during Charleston */}
        {!(isBottom && hideBottomHand) && (
          <div className={`player-cards ${isVertical ? 'vertical' : 'horizontal'}`}>
            {isBottom && yourHand ? (
              // Show actual tiles for bottom player (YOU) with drag-and-drop
              yourHand.map((tile, i) => {
                const isJoker = tile === 'J';
                return (
                  <React.Fragment key={`${tile}-${i}`}>
                    {/* Drop zone before first tile */}
                    {i === 0 && (
                      <div
                        className={`tile-drop-zone ${dragOverIndex === -1 ? 'drop-zone-active' : ''}`}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          setDragOverIndex(-1);
                        }}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (draggedIndex === null || !yourHand || !onReorderHand) return;
                          
                          // Clear drag state immediately
                          const currentDragIndex = draggedIndex;
                          setDraggedIndex(null);
                          setDragOverIndex(null);
                          
                          const newHand = [...yourHand];
                          const [draggedTile] = newHand.splice(currentDragIndex, 1);
                          newHand.unshift(draggedTile);
                          onReorderHand(newHand);
                        }}
                      />
                    )}
                    
                    {/* The tile itself */}
                    <div 
                      className={`tile-card card-horizontal ${isJoker ? 'joker-tile' : ''} ${draggedIndex === i ? 'dragging' : ''} ${allowTileClick ? 'tile-clickable' : ''}`}
                      draggable
                      onDragStart={handleDragStart(i)}
                      onDragEnd={handleDragEnd}
                      onClick={() => {
                        if (allowTileClick && onTileClick) {
                          onTileClick(tile);
                        }
                      }}
                      style={allowTileClick ? { cursor: 'pointer' } : undefined}
                    >
                      {tile}
                    </div>

                    {/* Drop zone after this tile */}
                    <div
                      className={`tile-drop-zone ${dragOverIndex === i ? 'drop-zone-active' : ''}`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        setDragOverIndex(i);
                      }}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (draggedIndex === null || !yourHand || !onReorderHand) return;
                        
                        // Clear drag state immediately
                        const currentDragIndex = draggedIndex;
                        setDraggedIndex(null);
                        setDragOverIndex(null);
                        
                        const newHand = [...yourHand];
                        const [draggedTile] = newHand.splice(currentDragIndex, 1);
                        const insertPosition = currentDragIndex < i ? i : i + 1;
                        newHand.splice(insertPosition, 0, draggedTile);
                        onReorderHand(newHand);
                      }}
                    />
                  </React.Fragment>
                );
              })
            ) : (
              // Show blank cards for other players
              Array.from({ length: player.cardCount }).map((_, i) => (
                <div key={i} className={`blank-card ${isVertical ? 'card-vertical' : 'card-horizontal'}`} />
              ))
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="seating-square-container">
      <div className="seating-square">
        {/* Top player */}
        <div className="seating-position-top">
          {renderPlayer(topPlayer, 'top')}
        </div>

        {/* Middle row: left, center (empty space), right */}
        <div className="seating-middle-row">
          <div className="seating-position-left">
            {renderPlayer(leftPlayer, 'left')}
          </div>
          <div className="seating-center-space">
            {/* Empty table center */}
            <div className="table-center">
              <div className="table-center-text">Mahjong Table</div>
            </div>
          </div>
          <div className="seating-position-right">
            {renderPlayer(rightPlayer, 'right')}
          </div>
        </div>

        {/* Bottom player (YOU) */}
        <div className="seating-position-bottom">
          {renderPlayer(bottomPlayer, 'bottom')}
        </div>
      </div>
    </div>
  );
};

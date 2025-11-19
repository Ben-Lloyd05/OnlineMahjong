import React, { useState, useEffect, useMemo } from 'react';
import './CharlestonUI.css';

interface CharlestonUIProps {
  phase: string;
  message: string;
  playerStates: any[];
  yourPlayerId: number;
  yourHand: string[];
  canBlindPass: boolean;
  passNumber: number;
  allPlayers: { playerId: number; username: string }[];
  onSelectTiles: (tiles: string[], blindPass?: { enabled: boolean; count: 0 | 1 | 2 }) => void;
  onReady: () => void;
  onVote: (vote: 'yes' | 'no') => void;
  onCourtesyOffer: (tiles: string[], targetPlayer: number) => void;
  onReorderHand?: (newOrder: string[]) => void; // Callback when tiles are reordered
}

export default function CharlestonUI({
  phase,
  message,
  playerStates,
  yourPlayerId,
  yourHand,
  canBlindPass,
  passNumber,
  allPlayers,
  onSelectTiles,
  onReady,
  onVote,
  onCourtesyOffer,
  onReorderHand
}: CharlestonUIProps) {
  const [selectedTiles, setSelectedTiles] = useState<string[]>([]);
  const [blindPassEnabled, setBlindPassEnabled] = useState(false);
  const [blindPassCount, setBlindPassCount] = useState<0 | 1 | 2>(1);
  const [currentVote, setCurrentVote] = useState<'yes' | 'no' | null>(null);
  const [courtesyTarget, setCourtesyTarget] = useState<number | null>(null);
  const [showPassAnimation, setShowPassAnimation] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const yourState = playerStates.find(ps => ps.playerId === yourPlayerId) || playerStates[yourPlayerId];
  const isVotePhase = phase === 'vote';
  const isCourtesyPhase = phase === 'courtesy';
  const isPassPhase = !isVotePhase && !isCourtesyPhase && phase !== 'complete';
  
  // Safety check
  if (!yourState) {
    console.error('[CharlestonUI] Could not find your player state', { yourPlayerId, playerStates });
    return <div>Error: Could not find your player state</div>;
  }

  const maxSelectableTiles = useMemo(() => {
    if (isCourtesyPhase) return 3;
    if (blindPassEnabled) return blindPassCount; // Select X tiles, keep X from incoming
    return 3;
  }, [isCourtesyPhase, blindPassEnabled, blindPassCount]);

  const handleTileClick = (tile: string, index: number) => {
    if (tile === 'J') return;

    const tileWithIndex = `${tile}_${index}`;
    if (selectedTiles.includes(tileWithIndex)) {
      setSelectedTiles(selectedTiles.filter(t => t !== tileWithIndex));
    } else {
      if (selectedTiles.length < maxSelectableTiles) {
        setSelectedTiles([...selectedTiles, tileWithIndex]);
      }
    }
  };

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

  useEffect(() => {
    if (isPassPhase) {
      const tiles = selectedTiles.map(t => t.split('_')[0]);
      const blindPassData = blindPassEnabled ? { enabled: true, count: blindPassCount } : undefined;
      onSelectTiles(tiles, blindPassData);
    }
  }, [selectedTiles, blindPassEnabled, blindPassCount, isPassPhase]);

  useEffect(() => {
    if (isVotePhase && currentVote) {
      onVote(currentVote);
    }
  }, [currentVote, isVotePhase]);

  useEffect(() => {
    if (isCourtesyPhase && courtesyTarget !== null) {
      const tiles = selectedTiles.map(t => t.split('_')[0]);
      onCourtesyOffer(tiles, courtesyTarget);
    }
  }, [selectedTiles, courtesyTarget, isCourtesyPhase]);

  const handleReady = () => {
    if (!yourState.ready) {
      onReady();
    }
  };

  const canReady = useMemo(() => {
    if (yourState.ready) return false;
    if (isVotePhase) return currentVote !== null;
    if (isCourtesyPhase) return courtesyTarget !== null || selectedTiles.length === 0;
    if (isPassPhase) {
      if (blindPassEnabled) {
        return selectedTiles.length === blindPassCount;
      }
      return selectedTiles.length === 3;
    }
    return false;
  }, [yourState.ready, isVotePhase, isCourtesyPhase, isPassPhase, currentVote, selectedTiles, blindPassEnabled, blindPassCount, courtesyTarget]);

  useEffect(() => {
    setSelectedTiles([]);
    setBlindPassEnabled(false);
    setBlindPassCount(1);
    setCurrentVote(null);
    setCourtesyTarget(null);
    // Hide animation when phase changes (pass completed)
    setShowPassAnimation(false);
  }, [phase]);

  // Show pass animation when all players are ready (for pass phases)
  useEffect(() => {
    if (isPassPhase && playerStates.every(s => s.ready)) {
      setShowPassAnimation(true);
      // Animation will be hidden automatically when phase changes
    } else {
      setShowPassAnimation(false);
    }
  }, [isPassPhase, playerStates]);

  if (phase === 'complete') {
    return (
      <div className="charleston-complete">
        <h2>✅ Charleston Complete!</h2>
        <p>The game will begin shortly...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '100%', margin: '0 auto', padding: '1rem', background: 'transparent' }}>      {isVotePhase && (
        <div className="vote-section">
          <h3>Do you want a second Charleston?</h3>
          <div className="vote-buttons">
            <button
              className={`vote-button yes ${currentVote === 'yes' ? 'selected' : ''}`}
              onClick={() => setCurrentVote('yes')}
              disabled={yourState.ready}
            >
              👍 Yes
            </button>
            <button
              className={`vote-button no ${currentVote === 'no' ? 'selected' : ''}`}
              onClick={() => setCurrentVote('no')}
              disabled={yourState.ready}
            >
              👎 No
            </button>
          </div>
          <div className="vote-tally">
            {playerStates.map((state, idx) => (
              state.vote && (
                <div key={idx} className={`vote-indicator ${state.vote}`}>
                  {allPlayers[idx].username}: {state.vote === 'yes' ? '👍' : '👎'}
                  {state.voteSubmitted && ' (Locked)'}
                </div>
              )
            ))}
          </div>
        </div>
      )}

      {isCourtesyPhase && (
        <div className="courtesy-section">
          <h3>Select a player to trade with (0-3 tiles):</h3>
          <div className="target-selection">
            <button
              className={`target-option ${courtesyTarget === null ? 'selected' : ''}`}
              onClick={() => setCourtesyTarget(null)}
            >
              No Trade
            </button>
            {allPlayers
              .filter(p => p.playerId !== yourPlayerId)
              .map(player => (
                <button
                  key={player.playerId}
                  className={`target-option ${courtesyTarget === player.playerId ? 'selected' : ''}`}
                  onClick={() => setCourtesyTarget(player.playerId)}
                >
                  {player.username}
                  {playerStates[player.playerId].courtesyOffer?.targetPlayer === yourPlayerId && (
                    <span className="mutual-indicator"> (wants to trade!)</span>
                  )}
                </button>
              ))}
          </div>
        </div>
      )}

      {canBlindPass && isPassPhase && (
        <div className="blind-pass-section">
          <label className="blind-pass-checkbox">
            <input
              type="checkbox"
              checked={blindPassEnabled}
              onChange={(e) => {
                setBlindPassEnabled(e.target.checked);
                if (e.target.checked) {
                  // When enabling blind pass, ensure selected count doesn't exceed current blindPassCount
                  if (selectedTiles.length > blindPassCount) {
                    setSelectedTiles(selectedTiles.slice(0, blindPassCount));
                  }
                }
              }}
              disabled={yourState.ready}
            />
            <span>Blind Pass</span>
          </label>

          {blindPassEnabled && (
            <div className="blind-pass-slider">
              <label>Select {blindPassCount} tile{blindPassCount !== 1 ? 's' : ''} from your hand:</label>
              <input
                type="range"
                min="0"
                max="2"
                value={blindPassCount}
                onChange={(e) => {
                  const newCount = parseInt(e.target.value) as 0 | 1 | 2;
                  setBlindPassCount(newCount);
                  // Clear selections if we have too many
                  if (selectedTiles.length > newCount) {
                    setSelectedTiles(selectedTiles.slice(0, newCount));
                  }
                }}
                disabled={yourState.ready}
              />
              <div className="slider-labels">
                <span>0</span>
                <span>1</span>
                <span>2</span>
              </div>
              <p className="blind-pass-info">
                Keep {blindPassCount} random tile{blindPassCount !== 1 ? 's' : ''} from incoming, forward {3 - blindPassCount}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="hand-section">
        <h3>Your Hand - {isCourtesyPhase ? 'Select 0-3 tiles:' : `Select ${maxSelectableTiles} tile${maxSelectableTiles !== 1 ? 's' : ''}:`}</h3>
        <div className="charleston-hand">
          {yourHand.map((tile, idx) => {
            const tileWithIndex = `${tile}_${idx}`;
            const isSelected = selectedTiles.includes(tileWithIndex);
            const isJoker = tile === 'J';
            const canSelect = !isJoker && !yourState.ready;

            return (
              <React.Fragment key={tileWithIndex}>
                {/* Drop zone before first tile */}
                {idx === 0 && (
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
                      if (draggedIndex === null || !onReorderHand) return;
                      
                      // Clear drag state immediately
                      const currentDragIndex = draggedIndex;
                      setDraggedIndex(null);
                      setDragOverIndex(null);
                      
                      const newHand = [...yourHand];
                      const [draggedTile] = newHand.splice(currentDragIndex, 1);
                      newHand.unshift(draggedTile);
                      const updatedSelections = selectedTiles.map(sel => {
                        const [tileName, oldIdx] = sel.split('_');
                        const oldIndex = parseInt(oldIdx);
                        let newIdx = oldIndex;
                        if (oldIndex === currentDragIndex) newIdx = 0;
                        else if (oldIndex < currentDragIndex) newIdx = oldIndex + 1;
                        return `${tileName}_${newIdx}`;
                      });
                      setSelectedTiles(updatedSelections);
                      onReorderHand(newHand);
                    }}
                  />
                )}
                
                {/* The tile itself */}
                <div
                  className={`charleston-tile ${isSelected ? 'selected' : ''} ${isJoker ? 'joker-tile' : ''} ${canSelect ? 'clickable' : ''} ${draggedIndex === idx ? 'dragging' : ''}`}
                  draggable
                  onDragStart={handleDragStart(idx)}
                  onDragEnd={handleDragEnd}
                  onClick={() => canSelect && handleTileClick(tile, idx)}
                >
                  {tile}
                </div>

                {/* Drop zone after this tile */}
                <div
                  className={`tile-drop-zone ${dragOverIndex === idx ? 'drop-zone-active' : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    setDragOverIndex(idx);
                  }}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggedIndex === null || !onReorderHand) return;
                    
                    // Clear drag state immediately
                    const currentDragIndex = draggedIndex;
                    setDraggedIndex(null);
                    setDragOverIndex(null);
                    
                    const newHand = [...yourHand];
                    const [draggedTile] = newHand.splice(currentDragIndex, 1);
                    const insertPosition = currentDragIndex < idx ? idx : idx + 1;
                    newHand.splice(insertPosition, 0, draggedTile);
                    
                    const updatedSelections = selectedTiles.map(sel => {
                      const [tileName, oldIdx] = sel.split('_');
                      const oldIndex = parseInt(oldIdx);
                      let newIdx = oldIndex;
                      if (oldIndex === currentDragIndex) {
                        newIdx = insertPosition;
                      } else if (currentDragIndex < oldIndex && oldIndex <= idx) {
                        newIdx = oldIndex - 1;
                      } else if (currentDragIndex > oldIndex && oldIndex > idx) {
                        newIdx = oldIndex + 1;
                      }
                      return `${tileName}_${newIdx}`;
                    });
                    setSelectedTiles(updatedSelections);
                    onReorderHand(newHand);
                  }}
                />
              </React.Fragment>
            );
          })}
        </div>
        <div className="selection-count">
          Selected: {selectedTiles.length} / {maxSelectableTiles}
        </div>
      </div>

      <div className="charleston-actions">
        <button
          className={`ready-button ${canReady ? 'enabled' : 'disabled'}`}
          onClick={handleReady}
          disabled={!canReady}
        >
          {yourState.ready ? '✓ Ready' : isVotePhase ? 'Submit Vote' : 'Ready'}
        </button>
        {!canReady && !yourState.ready && (
          <p className="ready-hint">
            {isVotePhase && 'Select your vote'}
            {isCourtesyPhase && 'Select a player to trade with (or No Trade)'}
            {isPassPhase && !blindPassEnabled && 'Select 3 tiles'}
            {isPassPhase && blindPassEnabled && `Select ${blindPassCount} tile${blindPassCount !== 1 ? 's' : ''}`}
          </p>
        )}
      </div>

      {/* Pass execution animation overlay */}
      {showPassAnimation && (
        <div className="pass-execution-overlay">
          <div className="pass-animation-container">
            <div className="pass-animation-message">
              🔄 Passing Tiles...
            </div>
            <div className="flying-tiles">
              <div className="flying-tile"></div>
              <div className="flying-tile"></div>
              <div className="flying-tile"></div>
            </div>
            {playerStates.some(s => s.blindPass?.enabled) && (
              <div className="blind-pass-notification">
                {playerStates
                  .filter(s => s.blindPass?.enabled)
                  .map((s, idx) => (
                    <div key={idx}>
                      👁️ {allPlayers[s.playerId]?.username} is blind passing {s.blindPass?.count} tile{s.blindPass?.count !== 1 ? 's' : ''}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}



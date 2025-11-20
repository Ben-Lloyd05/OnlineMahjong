// path: mahjong-ts/src/client/ui/components/JokerExchangeModal.tsx
import React from 'react';

interface JokerExchangeContext {
  targetPlayer: number;
  exposureIndex: number;
  jokerIndex: number;
}

interface JokerExchangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  context: JokerExchangeContext | null;
  handTiles: string[];
  onConfirm: (replacementTile: string) => void;
  loading?: boolean;
}

export function JokerExchangeModal({ isOpen, onClose, context, handTiles, onConfirm, loading }: JokerExchangeModalProps) {
  const [selectedTile, setSelectedTile] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isOpen) {
      setSelectedTile(null);
    }
  }, [isOpen]);

  if (!isOpen || !context) return null;

  const naturalTiles = handTiles.filter(t => t !== 'J');
  const uniqueTiles = Array.from(new Set(naturalTiles));
  const tileCounts: Record<string, number> = {};
  for (const t of naturalTiles) tileCounts[t] = (tileCounts[t] || 0) + 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 border-2 border-emerald-600 rounded-xl shadow-2xl w-full max-w-lg p-6 space-y-5">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-xl font-bold text-emerald-300">Exchange Joker</h2>
          <button onClick={onClose} className="text-gray-300 hover:text-white text-2xl font-bold leading-none">×</button>
        </div>
        <p className="text-sm text-gray-300">Select a natural tile from your hand to replace the joker in Player {context.targetPlayer}'s exposure.</p>
        {uniqueTiles.length === 0 && (
          <div className="text-center text-red-400 font-medium">You have no natural tiles to exchange.</div>
        )}
        <div className="flex flex-wrap gap-2 max-h-48 overflow-auto p-1">
          {uniqueTiles.map(tile => (
            <button
              key={tile}
              disabled={loading}
              onClick={() => setSelectedTile(tile === selectedTile ? null : tile)}
              className={`px-3 py-2 rounded font-mono text-sm font-bold transition-all border ${tile === selectedTile ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-500/40 scale-105' : 'bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600'} disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {tile}
              <span className="ml-2 text-xs font-normal opacity-70">x{tileCounts[tile]}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white font-semibold transition-colors"
            disabled={loading}
          >Cancel</button>
          <button
            onClick={() => selectedTile && onConfirm(selectedTile)}
            disabled={!selectedTile || loading}
            className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded transition-colors"
          >{loading ? 'Exchanging...' : 'Exchange'}</button>
        </div>
      </div>
    </div>
  );
}

export default JokerExchangeModal;

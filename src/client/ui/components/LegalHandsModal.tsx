// path: mahjong-ts/src/client/ui/components/LegalHandsModal.tsx
import React from 'react';
import handsData from '../../../../nmjl_mahjong_hands_filled.json';

interface LegalHandsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LegalHandsModal({ isOpen, onClose }: LegalHandsModalProps) {
  if (!isOpen) return null;

  const categories = Object.keys(handsData);
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(null);

  const allHands: { index: number; name: string; category: string; sections: string[] }[] = [];
  let idx = 0;
  for (const category of categories) {
    const handsInCategory = (handsData as any)[category];
    for (const [handName, sections] of Object.entries(handsInCategory)) {
      allHands.push({ index: idx++, name: handName, category, sections: sections as string[] });
    }
  }

  const shownHands = selectedCategory ? allHands.filter(h => h.category === selectedCategory) : allHands;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 border-2 border-emerald-600 rounded-xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-emerald-700 to-emerald-800 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">Legal Hands (Rule Card)</h2>
          <button onClick={onClose} className="text-white text-3xl font-bold hover:scale-110 transition-transform">×</button>
        </div>
        {/* Category Filter */}
        <div className="px-6 py-3 border-b border-emerald-900 bg-gray-800">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${selectedCategory === null ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/50 scale-105' : 'bg-gray-700 text-gray-200 hover:bg-gray-600 border border-gray-600'}`}
            >All</button>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${selectedCategory === cat ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/50 scale-105' : 'bg-gray-700 text-gray-200 hover:bg-gray-600 border border-gray-600'}`}
              >{cat}</button>
            ))}
          </div>
        </div>
        {/* Content */}
        <div className="flex-1 overflow-auto p-6 space-y-6">
          {shownHands.map(hand => (
            <div key={hand.index} className="border border-emerald-700 rounded-lg p-4 bg-gray-850/40 hover:bg-gray-800 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold text-emerald-300">{hand.name}</h3>
                <span className="text-xs px-2 py-1 rounded bg-emerald-700 text-white uppercase tracking-wide">{hand.category}</span>
              </div>
              <div className="text-sm font-mono text-emerald-200 space-y-1">
                {hand.sections.map((s,i) => (
                  <div key={i}>{s}</div>
                ))}
              </div>
            </div>
          ))}
          {shownHands.length === 0 && (
            <div className="text-center text-gray-400">No hands for this category.</div>
          )}
        </div>
        {/* Footer */}
        <div className="px-6 py-3 bg-gray-900 border-t border-emerald-900 flex justify-end">
          <button onClick={onClose} className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition-colors">Close</button>
        </div>
      </div>
    </div>
  );
}

export default LegalHandsModal;

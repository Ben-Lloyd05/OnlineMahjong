// path: mahjong-ts/src/client/ui/components/HandSelector.tsx
import React, { useState } from 'react';
// Correct path to root JSON file (components -> ui -> client -> src -> root)
import handsData from '../../../../nmjl_mahjong_hands_filled.json';

interface HandSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectHand: (handIndex: number, handName: string, category: string) => void;
}

export function HandSelector({ isOpen, onClose, onSelectHand }: HandSelectorProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  if (!isOpen) return null;

  const categories = Object.keys(handsData);

  // Build a flat list of all hands with their indices
  const allHands: { index: number; name: string; category: string; sections: string[] }[] = [];
  let currentIndex = 0;

  for (const category of categories) {
    const handsInCategory = handsData[category as keyof typeof handsData];
    for (const [handName, sections] of Object.entries(handsInCategory)) {
      allHands.push({
        index: currentIndex++,
        name: handName,
        category,
        sections: sections as string[]
      });
    }
  }

  const filteredHands = selectedCategory
    ? allHands.filter(h => h.category === selectedCategory)
    : allHands;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-lg shadow-2xl max-w-4xl w-full max-h-[80vh] overflow-hidden flex flex-col border-2 border-emerald-600">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-700 to-emerald-800 text-white px-6 py-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-shadow">Select Your Hand</h2>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-200 text-3xl font-bold transition-all hover:scale-110"
          >
            ×
          </button>
        </div>

        {/* Category Filter */}
        <div className="px-6 py-4 border-b border-emerald-900 bg-gray-800">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                selectedCategory === null
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/50 scale-105'
                  : 'bg-gray-700 text-gray-200 hover:bg-gray-600 border border-gray-600'
              }`}
            >
              All Categories
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  selectedCategory === cat
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/50 scale-105'
                    : 'bg-gray-700 text-gray-200 hover:bg-gray-600 border border-gray-600'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Hands List */}
        <div className="flex-1 overflow-y-auto px-6 py-4 bg-gray-900">
          <div className="space-y-3">
            {filteredHands.map(hand => (
              <button
                key={hand.index}
                onClick={() => {
                  onSelectHand(hand.index, hand.name, hand.category);
                  onClose();
                }}
                className="w-full text-left p-4 border-2 border-gray-700 bg-gray-800 rounded-lg hover:border-emerald-500 hover:bg-gray-750 transition-all group hover:shadow-lg hover:shadow-emerald-500/20 hover:scale-[1.02]"
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-bold text-lg text-gray-100 group-hover:text-emerald-400 transition-colors">
                      {hand.name}
                    </h3>
                    <p className="text-sm text-emerald-500 uppercase tracking-wide">{hand.category}</p>
                  </div>
                </div>
                <div className="mt-2 font-mono text-sm text-gray-300">
                  {hand.sections.map((section, idx) => (
                    <div key={idx} className="mb-1">
                      <span className="bg-gray-900 border border-emerald-800 px-2 py-1 rounded">
                        {section}
                      </span>
                    </div>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-emerald-900 bg-gray-800 text-sm text-gray-300">
          <p>
            <strong className="text-emerald-400">Note:</strong> Once you select a hand, you can only expose tiles that match
            sections of this hand pattern. Choose carefully!
          </p>
        </div>
      </div>
    </div>
  );
}

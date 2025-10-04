import React, { useState } from 'react';
import Hand from './Hand';

type Props = {
  myHand: string[];
  onPass: (tiles: string[]) => void;
};

export default function CharlestonUI({ myHand, onPass }: Props) {
  const [sel, setSel] = useState<string[]>([]);
  const canPass = sel.length === 3 && !sel.includes('J');
  return (
    <div className="p-2">
      <div className="mb-2 text-sm">Select 3 tiles to pass</div>
      <Hand tiles={myHand} onSelect={setSel} />
      <button
        onClick={() => onPass(sel)}
        disabled={!canPass}
        className={`mt-2 px-3 py-1 rounded ${canPass ? 'bg-emerald-500' : 'bg-slate-600'} disabled:opacity-50`}
        aria-disabled={!canPass}
      >
        Pass 3
      </button>
    </div>
  );
}



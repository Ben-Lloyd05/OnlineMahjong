import React from 'react';

type Props = {
  tile: string;
  selected?: boolean;
  onClick?: () => void;
};

export default function Tile({ tile, selected, onClick }: Props) {
  return (
    <button
      aria-label={`tile ${tile}`}
      onClick={onClick}
      className={`w-12 h-14 min-w-12 max-w-12 rounded shadow mx-0.5 flex-shrink-0 flex items-center justify-center text-xs font-mono font-bold select-none transition-colors ${selected ? 'bg-amber-400 text-black' : 'bg-slate-700 text-white hover:bg-slate-600'}`}
      style={{ width: '3rem' }}
    >
      {tile}
    </button>
  );
}



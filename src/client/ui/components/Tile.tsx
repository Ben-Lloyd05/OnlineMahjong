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
      className={`w-10 h-14 rounded shadow mx-0.5 flex items-center justify-center text-sm font-semibold select-none ${selected ? 'bg-amber-400 text-black' : 'bg-slate-700'}`}
    >
      {tile}
    </button>
  );
}



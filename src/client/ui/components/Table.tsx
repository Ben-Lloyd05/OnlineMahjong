import React from 'react';
import Hand from './Hand';

type Props = {
  players: { hand: string[] }[];
  currentSeat: number;
};

export default function Table({ players, currentSeat }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4">
      <div className="md:col-span-3 text-center text-xl font-bold">Mahjong Table</div>
      {players.map((p, idx) => (
        <div key={idx} className={`rounded p-2 ${idx === currentSeat ? 'ring-2 ring-emerald-400' : 'ring-1 ring-slate-700'}`}>
          <div className="text-sm mb-2">Player {idx}</div>
          <Hand tiles={p.hand} />
        </div>
      ))}
    </div>
  );
}



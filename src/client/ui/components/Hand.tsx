import React, { useState } from 'react';
import Tile from './Tile';

type Props = {
  tiles: string[];
  onSelect?: (selected: string[]) => void;
};

export default function Hand({ tiles, onSelect }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const toggle = (t: string) => {
    const s = selected.includes(t) ? selected.filter(x => x !== t) : [...selected, t];
    setSelected(s);
    onSelect?.(s);
  };
  return (
    <div className="flex items-center overflow-x-auto py-2" role="list" aria-label="hand">
      {tiles.map((t, i) => (
        <Tile key={`${t}-${i}`} tile={t} selected={selected.includes(t)} onClick={() => toggle(t)} />
      ))}
    </div>
  );
}



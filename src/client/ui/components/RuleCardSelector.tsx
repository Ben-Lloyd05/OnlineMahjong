import React from 'react';

type Props = {
  value: 2024 | 2025;
  onChange: (v: 2024 | 2025) => void;
};

export default function RuleCardSelector({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="rc" className="text-sm">Rule Card</label>
      <select id="rc" value={value} onChange={e => onChange(Number(e.target.value) as any)} className="bg-slate-800 rounded px-2 py-1">
        <option value={2024}>NMJL 2024</option>
        <option value={2025}>NMJL 2025</option>
      </select>
    </div>
  );
}



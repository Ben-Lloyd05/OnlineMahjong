// path: mahjong-ts/src/client/ui/components/SelectedHandDisplay.tsx
import React from 'react';
import './SelectedHandDisplay.css';

interface SelectedHandDisplayProps {
  handName: string;
  category: string;
  sections: string[];
}

export function SelectedHandDisplay({ handName, category, sections }: SelectedHandDisplayProps) {
  return (
    <div className="selected-hand-display">
      <h3 className="hand-name">{handName}</h3>
      <p className="hand-category">{category}</p>
      <div className="hand-pattern">
        {sections.map((section, idx) => (
          <div key={idx} className="pattern-section">
            {section}
          </div>
        ))}
      </div>
    </div>
  );
}

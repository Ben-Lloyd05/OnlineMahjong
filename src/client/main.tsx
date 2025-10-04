import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import './ui/index.css';
import LobbyPage from './pages/LobbyPage';
import TablePage from './pages/TablePage';
import { useWS } from './ui/hooks/useWS';

function App() {
  const { messages, createTable, joinTable, leaveTable, clearHistory } = useWS('ws://localhost:8080', '');
  const navigate = useNavigate();

  // Auto-navigate to table when join/create happens, and back to lobby on leave
  useEffect(() => {
    let tableCreatedIndex = -1;
    let tableJoinedIndex = -1;
    let tableLeftIndex = -1;
    
    for (let i = messages.length - 1; i >= 0; i--) {
      if (tableCreatedIndex === -1 && messages[i].type === 'table_created') tableCreatedIndex = i;
      if (tableJoinedIndex === -1 && messages[i].type === 'table_joined') tableJoinedIndex = i;
      if (tableLeftIndex === -1 && messages[i].type === 'table_left') tableLeftIndex = i;
      if (tableCreatedIndex !== -1 && tableJoinedIndex !== -1 && tableLeftIndex !== -1) break;
    }
    
    const lastJoinIndex = Math.max(tableCreatedIndex, tableJoinedIndex);
    const inTable = lastJoinIndex >= 0 && (tableLeftIndex < 0 || lastJoinIndex > tableLeftIndex);
    
    // Get the invite code for the current table
    let inviteCode = '';
    if (inTable) {
      const currentTableMessage = lastJoinIndex === tableCreatedIndex 
        ? messages[tableCreatedIndex] as any 
        : messages[tableJoinedIndex] as any;
      inviteCode = currentTableMessage?.inviteCode || '';
    }
    
    // Navigate based on state
    if (inTable && !window.location.pathname.startsWith('/table/')) {
      navigate(`/table/${inviteCode}`);
    } else if (!inTable && window.location.pathname.startsWith('/table/')) {
      navigate('/');
    }
  }, [messages, navigate]);

  return (
    <Routes>
      <Route 
        path="/" 
        element={
          <LobbyPage
            messages={messages}
            onCreateTable={createTable}
            onJoinTable={joinTable}
          />
        } 
      />
      <Route 
        path="/table/:inviteCode" 
        element={
          <TablePage
            messages={messages}
            onLeaveTable={leaveTable}
          />
        } 
      />
    </Routes>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);



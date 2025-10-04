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
  const prevMessagesLengthRef = React.useRef(messages.length);

  // Auto-navigate to table when join/create happens, and back to lobby on leave
  useEffect(() => {
    // Only check navigation if we got a NEW message
    if (messages.length === prevMessagesLengthRef.current) {
      return;
    }
    prevMessagesLengthRef.current = messages.length;
    
    // Check the most recent message to see if it's a navigation trigger
    if (messages.length === 0) return;
    
    const lastMessage = messages[messages.length - 1] as any;
    const currentPath = window.location.pathname;
    
    console.log('[App] Navigation check - lastMessage:', lastMessage.type, 'currentPath:', currentPath);
    
    // If the last message was joining/creating a table, navigate to it
    if ((lastMessage.type === 'table_created' || lastMessage.type === 'table_joined') && currentPath === '/') {
      const inviteCode = lastMessage.inviteCode;
      console.log('[App] Navigating to table:', inviteCode);
      if (inviteCode) {
        navigate(`/table/${inviteCode}`);
      }
    }
    // If the last message was leaving a table, navigate back to lobby
    else if (lastMessage.type === 'table_left' && currentPath.startsWith('/table/')) {
      console.log('[App] Navigating back to lobby');
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



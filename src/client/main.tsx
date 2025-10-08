import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import './ui/index.css';
import LobbyPage from './pages/LobbyPage';
import TablePage from './pages/TablePage';
import AdminPage from './pages/AdminPage';
import AdminTableView from './pages/AdminTableView';
import { useWS } from './ui/hooks/useWS';

function App() {
  const { 
    messages, 
    send,
    createTable, 
    joinTable, 
    leaveTable, 
    clearHistory,
    adminAuth,
    adminListTables,
    adminJoinTable
  } = useWS('ws://localhost:8080', '');
  const navigate = useNavigate();
  const prevMessagesLengthRef = React.useRef(messages.length);

  // Auto-navigate to table when join/create happens, and back to lobby on leave
  useEffect(() => {
    // Only check navigation if we got NEW messages
    if (messages.length === prevMessagesLengthRef.current) {
      return;
    }
    
    const oldLength = prevMessagesLengthRef.current;
    prevMessagesLengthRef.current = messages.length;
    
    // Check all NEW messages (not just the last one, since multiple may arrive at once)
    if (messages.length === 0) return;
    
    const newMessages = messages.slice(oldLength);
    const currentPath = window.location.pathname;
    
    console.log('[App] Checking', newMessages.length, 'new messages for navigation. currentPath:', currentPath);
    
    // Look for navigation triggers in all new messages
    for (const msg of newMessages) {
      const message = msg as any;
      
      // If we got a table_created or table_joined message, navigate to it
      if (message.type === 'table_created' || message.type === 'table_joined') {
        if (currentPath === '/') {
          const inviteCode = message.inviteCode;
          console.log('[App] ✅ Found', message.type, 'message, inviteCode:', inviteCode);
          if (inviteCode) {
            console.log('[App] 🚀 Navigating to /table/' + inviteCode);
            navigate(`/table/${inviteCode}`);
            return; // Stop checking after first navigation
          } else {
            console.error('[App] ❌ No inviteCode found in message!');
          }
        } else {
          console.log('[App] ⚠️ Already on a table page, not navigating. currentPath:', currentPath);
        }
      }
      // If we got a table_left message, navigate back to lobby
      else if (message.type === 'table_left' && currentPath.startsWith('/table/')) {
        console.log('[App] Navigating back to lobby');
        navigate('/');
        return; // Stop checking after first navigation
      }
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
            onJoinTable={joinTable}
            onSendMessage={send}
          />
        } 
      />
      <Route 
        path="/admin" 
        element={
          <AdminPage
            messages={messages}
            onAdminAuth={adminAuth}
            onListTables={adminListTables}
          />
        } 
      />
      <Route 
        path="/admin/table/:inviteCode" 
        element={
          <AdminTableView
            messages={messages}
            onAdminJoinTable={adminJoinTable}
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



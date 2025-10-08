import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ServerToClient } from '../../server/ws/protocol';
import LobbyView from '../ui/components/LobbyView';

interface LobbyPageProps {
  messages: ServerToClient[];
  onCreateTable: (clientSeed?: string, username?: string) => void;
  onJoinTable: (inviteCode: string, clientSeed?: string, username?: string) => void;
}

export default function LobbyPage({ messages, onCreateTable, onJoinTable }: LobbyPageProps) {
  const navigate = useNavigate();

  const handleCreateTable = (clientSeed?: string, username?: string) => {
    onCreateTable(clientSeed, username);
    // Navigation will happen automatically when table_created message is received
  };

  const handleJoinTable = (inviteCode: string, clientSeed?: string, username?: string) => {
    onJoinTable(inviteCode, clientSeed, username);
    // Navigation will happen automatically when table_joined message is received
  };

  return (
    <LobbyView
      messages={messages}
      onCreateTable={handleCreateTable}
      onJoinTable={handleJoinTable}
    />
  );
}

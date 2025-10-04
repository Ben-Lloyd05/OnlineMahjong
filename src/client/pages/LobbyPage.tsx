import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ServerToClient } from '../../server/ws/protocol';
import LobbyView from '../ui/components/LobbyView';

interface LobbyPageProps {
  messages: ServerToClient[];
  onCreateTable: (clientSeed?: string) => void;
  onJoinTable: (inviteCode: string, clientSeed?: string) => void;
}

export default function LobbyPage({ messages, onCreateTable, onJoinTable }: LobbyPageProps) {
  const navigate = useNavigate();

  const handleCreateTable = (clientSeed?: string) => {
    onCreateTable(clientSeed);
    // Navigation will happen automatically when table_created message is received
  };

  const handleJoinTable = (inviteCode: string, clientSeed?: string) => {
    onJoinTable(inviteCode, clientSeed);
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

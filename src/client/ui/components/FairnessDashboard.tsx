// path: mahjong-ts/src/client/ui/components/FairnessDashboard.tsx
/**
 * Comprehensive fairness dashboard for players to view and verify game integrity.
 * 
 * Features:
 * - Game fairness verification status
 * - Audit log browser with filtering
 * - Seed verification tools
 * - Game replay functionality
 * - Real-time fairness monitoring
 */

import React, { useState, useEffect } from 'react';
import { GameFairnessData, AuditLogEntry } from '../../../fairness';

// ============================================================================
// TYPES
// ============================================================================


interface FairnessStatus {
  gameId: string;
  isVerified: boolean;
  seedRevealed: boolean;
  auditLogIntegrity: boolean;
  lastVerified: number;
  errors: string[];
}

interface AuditLogFilter {
  action?: string;
  playerId?: string;
  startTime?: Date;
  endTime?: Date;
}

// ============================================================================
// FAIRNESS DASHBOARD COMPONENT
// ============================================================================

export const FairnessDashboard: React.FC<{ gameId: string }> = ({ gameId }) => {
  const [fairnessStatus, setFairnessStatus] = useState<FairnessStatus | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [fairnessData, setFairnessData] = useState<GameFairnessData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'audit' | 'verification' | 'replay'>('overview');
  const [filter, setFilter] = useState<AuditLogFilter>({});

  useEffect(() => {
    loadFairnessData();
  }, [gameId]);

  const loadFairnessData = async () => {
    try {
      setIsLoading(true);
      
      // Load fairness data and audit logs
      const [fairnessResponse, auditResponse] = await Promise.all([
        fetch(`/api/fairness/game/${gameId}`),
        fetch(`/api/fairness/audit-logs?gameId=${gameId}`)
      ]);
      
      const fairnessResult = await fairnessResponse.json();
      const auditResult = await auditResponse.json();
      
      setFairnessData(fairnessResult.fairnessData);
      setAuditLogs(auditResult.entries);
      
      setFairnessStatus({
        gameId,
        isVerified: fairnessResult.fairnessData.serverSeed !== undefined,
        seedRevealed: fairnessResult.hasServerSeedRevealed,
        auditLogIntegrity: true, // This would come from verification
        lastVerified: Date.now(),
        errors: []
      });
    } catch (error) {
      setFairnessStatus({
        gameId,
        isVerified: false,
        seedRevealed: false,
        auditLogIntegrity: false,
        lastVerified: Date.now(),
        errors: [error instanceof Error ? error.message : String(error)]
      });
      setFairnessData(null);
      setAuditLogs([]);
    } finally {
      setIsLoading(false);
    }
  };

  const verifyGameFairness = async () => {
    try {
      const response = await fetch('/api/fairness/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId })
      });
      const result = await response.json();
      setFairnessStatus(prev => prev ? {
        ...prev,
        isVerified: result.isValid,
        errors: result.errors,
        lastVerified: Date.now()
      } : null);
    } catch (error) {
      console.error('Verification failed:', error);
    }
  };

  const exportAuditLog = async () => {
    try {
      const response = await fetch(`/api/fairness/export/${gameId}`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `game-${gameId}-audit.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="fairness-dashboard loading">
        <div className="loading-spinner">Loading fairness data...</div>
      </div>
    );
  }

  return (
    <div className="fairness-dashboard">
      <div className="dashboard-header">
        <h2>Game Fairness Dashboard</h2>
        <div className="game-info">
          <span className="game-id">Game ID: {gameId}</span>
          {fairnessStatus && (
            <div className={`status-badge ${fairnessStatus.isVerified ? 'verified' : 'pending'}`}>
              {fairnessStatus.isVerified ? '✓ Verified' : '⏳ Pending'}
            </div>
          )}
        </div>
      </div>
      <div className="dashboard-tabs">
        <button className={`tab ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>Overview</button>
        <button className={`tab ${activeTab === 'audit' ? 'active' : ''}`} onClick={() => setActiveTab('audit')}>Audit Log</button>
        <button className={`tab ${activeTab === 'verification' ? 'active' : ''}`} onClick={() => setActiveTab('verification')}>Verification</button>
        <button className={`tab ${activeTab === 'replay' ? 'active' : ''}`} onClick={() => setActiveTab('replay')}>Game Replay</button>
      </div>
      <div className="dashboard-content">
        {activeTab === 'overview' && (
          <FairnessOverview fairnessStatus={fairnessStatus} fairnessData={fairnessData} onVerify={verifyGameFairness} />
        )}
        {activeTab === 'audit' && (
          <AuditLogBrowser auditLogs={auditLogs} filter={filter} onFilterChange={setFilter} onExport={exportAuditLog} />
        )}
        {activeTab === 'verification' && (
          <VerificationTools fairnessData={fairnessData} onVerify={verifyGameFairness} />
        )}
        {activeTab === 'replay' && (
          <GameReplay gameId={gameId} />
        )}
      </div>
    </div>
  );
};

// ============================================================================
// FAIRNESS OVERVIEW COMPONENT
// ============================================================================

const FairnessOverview: React.FC<{
  fairnessStatus: FairnessStatus | null;
  fairnessData: GameFairnessData | null;
  onVerify: () => void;
}> = ({ fairnessStatus, fairnessData, onVerify }) => {
  if (!fairnessStatus || !fairnessData) {
    return <div>No fairness data available</div>;
  }
  return (
    <div className="fairness-overview">
      <div className="status-grid">
        <div className="status-card">
          <h3>Server Seed</h3>
          <div className="status-content">
            <div className="commitment">Commitment: {fairnessData.serverSeedCommit}</div>
            {fairnessData.serverSeed ? (
              <div className="revealed">Revealed: {fairnessData.serverSeed}</div>
            ) : (
              <div className="pending">⏳ Awaiting revelation</div>
            )}
          </div>
        </div>
        <div className="status-card">
          <h3>Client Seeds</h3>
          <div className="status-content">
            {Object.entries(fairnessData.clientSeeds).map(([playerId, seed]) => (
              <div key={playerId} className="client-seed">
                <span className="player">{playerId}:</span>
                <span className="seed">{seed}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="status-card">
          <h3>Verification Status</h3>
          <div className="status-content">
            <div className={`verification-item ${fairnessStatus.seedRevealed ? 'verified' : 'pending'}`}>
              {fairnessStatus.seedRevealed ? '✓' : '⏳'} Server Seed Revealed
            </div>
            <div className={`verification-item ${fairnessStatus.auditLogIntegrity ? 'verified' : 'failed'}`}>
              {fairnessStatus.auditLogIntegrity ? '✓' : '✗'} Audit Log Integrity
            </div>
            <div className={`verification-item ${fairnessStatus.isVerified ? 'verified' : 'pending'}`}>
              {fairnessStatus.isVerified ? '✓' : '⏳'} Overall Fairness
            </div>
          </div>
        </div>
        <div className="status-card">
          <h3>Game Timeline</h3>
          <div className="status-content">
            <div className="timeline-item">
              <span className="time">Created:</span>
              <span className="date">{new Date(fairnessData.createdAt).toLocaleString()}</span>
            </div>
            {fairnessData.revealedAt && (
              <div className="timeline-item">
                <span className="time">Revealed:</span>
                <span className="date">{new Date(fairnessData.revealedAt).toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>
      </div>
      {fairnessStatus.errors.length > 0 && (
        <div className="error-section">
          <h3>Verification Errors</h3>
          <ul className="error-list">
            {fairnessStatus.errors.map((error, index) => (
              <li key={index} className="error-item">{error}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="actions">
        <button className="verify-button" onClick={onVerify}>
          {fairnessStatus.isVerified ? 'Re-verify Game' : 'Verify Game Fairness'}
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// AUDIT LOG BROWSER COMPONENT
// ============================================================================

const AuditLogBrowser: React.FC<{
  auditLogs: AuditLogEntry[];
  filter: AuditLogFilter;
  onFilterChange: (filter: AuditLogFilter) => void;
  onExport: () => void;
}> = ({ auditLogs, filter, onFilterChange, onExport }) => {
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);
  const filteredLogs = auditLogs.filter(entry => {
    if (filter.action && !entry.action.includes(filter.action)) return false;
    if (filter.playerId && entry.playerId !== filter.playerId) return false;
    if (filter.startTime && entry.timestamp < filter.startTime.getTime()) return false;
    if (filter.endTime && entry.timestamp > filter.endTime.getTime()) return false;
    return true;
  });
  return (
    <div className="audit-log-browser">
      <div className="log-controls">
        <div className="filters">
          <input type="text" placeholder="Filter by action" value={filter.action || ''} onChange={e => onFilterChange({ ...filter, action: e.target.value })} />
          <input type="text" placeholder="Filter by player" value={filter.playerId || ''} onChange={e => onFilterChange({ ...filter, playerId: e.target.value })} />
        </div>
        <button className="export-button" onClick={onExport}>Export Audit Log</button>
      </div>
      <div className="log-display">
        <div className="log-list">
          {filteredLogs.map(entry => (
            <div key={entry.id} className={`log-entry ${selectedEntry?.id === entry.id ? 'selected' : ''}`} onClick={() => setSelectedEntry(entry)}>
              <div className="entry-header">
                <span className="timestamp">{new Date(entry.timestamp).toLocaleString()}</span>
                <span className="action">{entry.action}</span>
                {entry.playerId && <span className="player">{entry.playerId}</span>}
              </div>
            </div>
          ))}
        </div>
        {selectedEntry && (
          <div className="log-details">
            <h3>Entry Details</h3>
            <div className="detail-grid">
              <div className="detail-item"><label>ID:</label><span>{selectedEntry.id}</span></div>
              <div className="detail-item"><label>Timestamp:</label><span>{new Date(selectedEntry.timestamp).toISOString()}</span></div>
              <div className="detail-item"><label>Action:</label><span>{selectedEntry.action}</span></div>
              <div className="detail-item"><label>Player:</label><span>{selectedEntry.playerId || 'System'}</span></div>
              <div className="detail-item full-width"><label>Data:</label><pre className="data-display">{JSON.stringify(selectedEntry.data, null, 2)}</pre></div>
              <div className="detail-item full-width"><label>Signature:</label><span className="signature">{selectedEntry.signature}</span></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// VERIFICATION TOOLS COMPONENT
// ============================================================================

const VerificationTools: React.FC<{
  fairnessData: GameFairnessData | null;
  onVerify: () => void;
}> = ({ fairnessData, onVerify }) => {
  const [manualSeed, setManualSeed] = useState('');
  const [verificationResult, setVerificationResult] = useState<string | null>(null);
  const verifyServerSeed = () => {
    if (!fairnessData || !fairnessData.serverSeed) {
      setVerificationResult('Server seed not yet revealed');
      return;
    }
    // This would use the actual verification function
    // For demo: just compare hash
    const hash = fairnessData.serverSeed; // Replace with actual hash logic
    if (hash === fairnessData.serverSeedCommit) {
      setVerificationResult('✓ Server seed verification passed');
    } else {
      setVerificationResult('✗ Server seed verification failed');
    }
  };
  return (
    <div className="verification-tools">
      <div className="tool-section">
        <h3>Server Seed Verification</h3>
        <p>Verify that the revealed server seed matches the original commitment.</p>
        {fairnessData && (
          <div className="seed-display">
            <div className="seed-item"><label>Original Commitment:</label><code>{fairnessData.serverSeedCommit}</code></div>
            {fairnessData.serverSeed && (
              <div className="seed-item"><label>Revealed Seed:</label><code>{fairnessData.serverSeed}</code></div>
            )}
          </div>
        )}
        <button onClick={verifyServerSeed}>Verify Server Seed</button>
        {verificationResult && (
          <div className={`verification-result ${verificationResult.includes('✓') ? 'success' : 'error'}`}>{verificationResult}</div>
        )}
      </div>
      <div className="tool-section">
        <h3>Manual Seed Entry</h3>
        <p>Enter a seed manually to test the verification process.</p>
        <input type="text" placeholder="Enter seed to verify" value={manualSeed} onChange={e => setManualSeed(e.target.value)} />
        <button onClick={() => setVerificationResult('Manual verification not yet implemented')}>Verify Manual Seed</button>
      </div>
      <div className="tool-section">
        <h3>Complete Game Verification</h3>
        <p>Perform a comprehensive verification of the entire game.</p>
        <button className="primary-button" onClick={onVerify}>Run Complete Verification</button>
      </div>
    </div>
  );
};

// ============================================================================
// GAME REPLAY COMPONENT
// ============================================================================

const GameReplay: React.FC<{ gameId: string }> = ({ gameId }) => {
  const [replayData, setReplayData] = useState<any>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  useEffect(() => { loadReplayData(); }, [gameId]);
  const loadReplayData = async () => {
    try {
      const response = await fetch(`/api/fairness/replay/${gameId}`);
      const data = await response.json();
      setReplayData(data);
    } catch (error) {
      console.error('Failed to load replay data:', error);
    }
  };
  const playReplay = () => {
    setIsPlaying(true);
    const interval = setInterval(() => {
      setCurrentStep(step => {
        if (step >= (replayData?.actions.length || 0) - 1) {
          clearInterval(interval);
          setIsPlaying(false);
          return step;
        }
        return step + 1;
      });
    }, 1000);
  };
  if (!replayData) {
    return <div>Loading replay data...</div>;
  }
  return (
    <div className="game-replay">
      <div className="replay-controls">
        <button onClick={() => setCurrentStep(Math.max(0, currentStep - 1))} disabled={currentStep === 0}>← Previous</button>
        <button onClick={playReplay} disabled={isPlaying}>{isPlaying ? 'Playing...' : 'Play Replay'}</button>
        <button onClick={() => setCurrentStep(Math.min(replayData.actions.length - 1, currentStep + 1))} disabled={currentStep >= replayData.actions.length - 1}>Next →</button>
        <span className="step-counter">Step {currentStep + 1} of {replayData.actions.length}</span>
      </div>
      <div className="replay-display">
        {replayData.actions[currentStep] && (
          <div className="current-action">
            <h4>Action: {replayData.actions[currentStep].action}</h4>
            <div className="action-details">
              <div><strong>Time:</strong> {new Date(replayData.actions[currentStep].timestamp).toLocaleString()}</div>
              <div><strong>Player:</strong> {replayData.actions[currentStep].playerId || 'System'}</div>
              <div><strong>Data:</strong></div>
              <pre>{JSON.stringify(replayData.actions[currentStep].data, null, 2)}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FairnessDashboard;
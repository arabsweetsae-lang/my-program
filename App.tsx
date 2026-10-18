
import React, { useState, useEffect } from 'react';
import { AppState, Settings, BranchData } from './types';
import { INITIAL_SETTINGS } from './constants';
import Login from './components/Login';
import Dashboard from './components/Dashboard';

const App: React.FC = () => {
  const portalMode = new URLSearchParams(window.location.search).get('portal') === '1';
  const [state, setState] = useState<AppState>(() => {
    const saved = localStorage.getItem('app_state');
    if (saved) return JSON.parse(saved);
    return {
      isLoggedIn: false,
      settings: INITIAL_SETTINGS,
      dailyEntries: {},
    };
  });

  useEffect(() => {
    localStorage.setItem('app_state', JSON.stringify(state));
  }, [state]);

  const handleLogin = (password: string) => {
    if (password === state.settings.adminPassword) {
      setState(prev => ({ ...prev, isLoggedIn: true }));
      return true;
    }
    return false;
  };

  const handleLogout = () => {
    const portalBridge = (window as any).portalBridge;
    if (portalMode && portalBridge) {
      portalBridge.returnToLogin();
      return;
    }
    setState(prev => ({ ...prev, isLoggedIn: false }));
  };

  const updateSettings = (newSettings: Settings) => {
    setState(prev => ({ ...prev, settings: newSettings }));
  };

  const saveEntry = (branchName: string, date: string, data: BranchData) => {
    setState(prev => {
      const newEntries = { ...prev.dailyEntries };
      if (!newEntries[branchName]) newEntries[branchName] = {};
      newEntries[branchName][date] = data;
      return { ...prev, dailyEntries: newEntries };
    });
  };

  if (!state.isLoggedIn && !portalMode) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <Dashboard 
      state={state} 
      onLogout={handleLogout} 
      onUpdateSettings={updateSettings}
      onSaveEntry={saveEntry}
    />
  );
};

export default App;

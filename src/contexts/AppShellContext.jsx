import React, { createContext, useContext } from 'react';

/** @type {React.Context<import('../contracts/appShellContracts.js').AppShellContextValue|null>} */
const AppShellContext = createContext(null);

/** @param {{value: import('../contracts/appShellContracts.js').AppShellContextValue, children: React.ReactNode}} props */
export function AppShellProvider({ value, children }) {
  return (
    <AppShellContext.Provider value={value}>
      {children}
    </AppShellContext.Provider>
  );
}

export function useAppShell() {
  const ctx = useContext(AppShellContext);
  if (!ctx) {
    throw new Error('useAppShell must be used within AppShellProvider');
  }
  return ctx;
}

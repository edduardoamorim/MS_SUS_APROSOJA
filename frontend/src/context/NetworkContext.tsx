import React, { createContext, useContext } from 'react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

interface NetworkContextType {
  isOnline: boolean;
}

const NetworkContext = createContext<NetworkContextType>({
  isOnline: true
});

export const useNetwork = () => useContext(NetworkContext);

export const NetworkProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isOnline = useNetworkStatus();

  return (
    <NetworkContext.Provider value={{ isOnline }}>
      {children}
    </NetworkContext.Provider>
  );
};

export default NetworkContext;

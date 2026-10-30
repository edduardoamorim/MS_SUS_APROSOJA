import { useState, useEffect } from 'react';

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });

  useEffect(() => {
    const handleOnline = () => {
      console.log('[useNetworkStatus] Dispositivo ONLINE detectado');
      setIsOnline(true);
    };

    const handleOffline = () => {
      console.log('[useNetworkStatus] Dispositivo OFFLINE detectado (Modo Campo)');
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

export default useNetworkStatus;

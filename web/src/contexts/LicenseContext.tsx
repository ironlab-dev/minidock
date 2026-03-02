'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { NagwareModal } from '@/components/ui/NagwareModal';

interface LicenseContextType {
  isTrialExpired: boolean;
  showNagware: (message?: string) => void;
  dismissNagware: () => void;
}

const LicenseContext = createContext<LicenseContextType | undefined>(undefined);

export function LicenseProvider({ children }: { children: React.ReactNode }) {
  const [isTrialExpired, setIsTrialExpired] = useState(false);
  const [nagwareVisible, setNagwareVisible] = useState(false);

  // Check trial status on mount
  useEffect(() => {
    checkTrialStatus();
  }, []);

  const checkTrialStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/license/status');
      if (response.ok) {
        const data = await response.json();
        setIsTrialExpired(data.isTrialExpired || false);
      }
    } catch (error) {
      console.error('[LicenseProvider] Failed to check trial status:', error);
    }
  }, []);

  const showNagware = useCallback((/* message?: string */) => {
    setNagwareVisible(true);
  }, []);

  const dismissNagware = useCallback(() => {
    setNagwareVisible(false);
  }, []);

  return (
    <LicenseContext.Provider value={{ isTrialExpired, showNagware, dismissNagware }}>
      {children}
      {nagwareVisible && <NagwareModal isOpen={nagwareVisible} onClose={dismissNagware} />}
    </LicenseContext.Provider>
  );
}

export function useLicense() {
  const context = useContext(LicenseContext);
  if (context === undefined) {
    throw new Error('useLicense must be used within a LicenseProvider');
  }
  return context;
}

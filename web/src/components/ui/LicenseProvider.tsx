import React, { createContext, useContext, useEffect, useState } from 'react';
import { client } from '@/api/client';
import { NagwareModal } from './NagwareModal';

interface LicenseContextType {
    checkLicenseAfterAction: () => Promise<void>;
}

const LicenseContext = createContext<LicenseContextType>({
    checkLicenseAfterAction: async () => {},
});

export const useLicense = () => useContext(LicenseContext);

export const LicenseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [showNag, setShowNag] = useState(false);
    const [daysLeft, setDaysLeft] = useState(14);
    
    // We listen for a custom window event that API client might dispatch
    useEffect(() => {
        const handleNagEvent = (e: Event) => {
            const customEvent = e as CustomEvent;
            setDaysLeft(customEvent.detail?.daysLeft || 0);
            setShowNag(true);
        };
        
        window.addEventListener('trigger-license-nag', handleNagEvent);
        return () => window.removeEventListener('trigger-license-nag', handleNagEvent);
    }, []);

    const checkLicenseAfterAction = async () => {
        try {
            const res = await client.get<{ isActivated: boolean; isTrialExpired: boolean; trialDaysLeft: number }>('/license/status');
            if (!res.isActivated && res.isTrialExpired) {
                setDaysLeft(res.trialDaysLeft);
                setShowNag(true);
            }
        } catch (e) {
            console.error('License check failed', e);
        }
    };

    return (
        <LicenseContext.Provider value={{ checkLicenseAfterAction }}>
            {children}
            <NagwareModal 
                isOpen={showNag} 
                daysLeft={daysLeft}
                onClose={() => setShowNag(false)} 
            />
        </LicenseContext.Provider>
    );
};

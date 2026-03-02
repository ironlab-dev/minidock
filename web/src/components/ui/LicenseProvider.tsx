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

    // We listen for a custom window event that API client might dispatch
    useEffect(() => {
        const handleNagEvent = (e: Event) => {
            const customEvent = e as CustomEvent;
            if (customEvent.detail) {
                setShowNag(true);
            }
        };

        window.addEventListener('trigger-license-nag', handleNagEvent);
        return () => window.removeEventListener('trigger-license-nag', handleNagEvent);
    }, []);

    const checkLicenseAfterAction = async () => {
        try {
            const res = await client.get<{ isActivated: boolean; isTrialExpired: boolean }>('/license/status');
            if (!res.isActivated && res.isTrialExpired) {
                setShowNag(true);
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
                onClose={() => setShowNag(false)} 
            />
        </LicenseContext.Provider>
    );
};

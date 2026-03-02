import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { client } from '@/api/client';
import { useConfirm } from '@/hooks/useConfirm';

interface LicenseStatus {
    isActivated: boolean;
    maskedKey: string | null;
}

export const LicenseSettings: React.FC = () => {
    const [status, setStatus] = useState<LicenseStatus>({ isActivated: false, maskedKey: null });
    const [keyInput, setKeyInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const { confirm, ConfirmDialog } = useConfirm();

    const fetchStatus = useCallback(async () => {
        try {
            const res = await client.get<LicenseStatus>('/license/status');
            setStatus(res);
        } catch (err) {
            console.error('[LicenseSettings] Failed to fetch license status:', err);
        }
    }, []);

    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    const handleActivate = async () => {
        if (!keyInput.trim()) return;
        setLoading(true);
        setError(null);
        setSuccess(false);

        try {
            await client.post('/license/activate', { key: keyInput.trim() });
            setSuccess(true);
            setKeyInput('');
            await fetchStatus();
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Activation failed';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleDeactivate = async () => {
        const confirmed = await confirm({
            title: 'Unlink Device',
            message: 'Are you sure you want to unlink this device? You will need to re-activate with your license key.',
            confirmText: 'Unlink',
            variant: 'danger',
        });
        if (!confirmed) return;
        setLoading(true);
        setError(null);
        setSuccess(false);
        try {
            await client.post('/license/deactivate', {});
            await fetchStatus();
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Deactivation failed';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium text-white">License & Activation</h3>
                <p className="text-sm text-gray-400 mt-1">
                    Manage your MiniDock lifetime license and device activation.
                </p>
            </div>

            <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
                {status.isActivated ? (
                    <div className="space-y-4">
                        <div className="flex items-center space-x-3 text-green-500">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="font-medium text-lg">MiniDock is Activated</span>
                        </div>
                        <div className="text-sm text-gray-400">
                            License Key: <span className="font-mono text-gray-300">{status.maskedKey}</span>
                        </div>
                        <div className="pt-4 border-t border-white/10">
                            <Button variant="danger" onClick={handleDeactivate} disabled={loading}>
                                {loading ? 'Processing...' : 'Unlink Device'}
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="flex items-center space-x-3 text-yellow-500 mb-4">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="font-medium">Trial Mode / Not Activated</span>
                        </div>

                        {/* Get License CTA */}
                        <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                                <p className="text-sm font-medium text-white">Don&apos;t have a license?</p>
                                <p className="text-xs text-gray-500 mt-0.5">One-time purchase · All future updates included · $19</p>
                            </div>
                            <a
                                href="https://minidock.net/pro"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 hover:text-blue-300 text-sm font-semibold transition-all whitespace-nowrap flex-shrink-0"
                            >
                                Get License →
                            </a>
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="license-key-input" className="block text-sm font-medium text-gray-300">Enter License Key</label>
                            <input
                                id="license-key-input"
                                type="text"
                                value={keyInput}
                                onChange={(e) => setKeyInput(e.target.value)}
                                placeholder="MD-XXXX-XXXX-XXXX-XXXX"
                                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        {error && (
                            <div className="text-red-400 text-sm mt-2 bg-red-400/10 px-3 py-2 rounded-lg border border-red-400/20">
                                {error}
                            </div>
                        )}

                        {success && (
                            <div className="text-green-400 text-sm mt-2">
                                Successfully activated!
                            </div>
                        )}

                        <div className="pt-4">
                            <Button variant="primary" onClick={handleActivate} disabled={loading || !keyInput.trim()}>
                                {loading ? 'Verifying...' : 'Activate License'}
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* Support Footer */}
            <div className="flex items-center justify-between text-xs text-gray-600 px-1">
                <span>
                    Need help?{' '}
                    <a href="mailto:minidock@ironlab.cc" className="text-gray-500 hover:text-gray-300 transition-colors">minidock@ironlab.cc</a>
                </span>
                <a href="https://ironlab.cc" target="_blank" rel="noopener noreferrer" className="text-gray-700 hover:text-gray-500 transition-colors">by IronLab</a>
            </div>

            <ConfirmDialog />
        </div>
    );
};

export default LicenseSettings;

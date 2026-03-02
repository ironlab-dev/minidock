import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface NagwareModalProps {
    isOpen: boolean;
    onClose: () => void;
    onClose: () => void;
}

export const NagwareModal: React.FC<NagwareModalProps> = ({ isOpen, onClose }) => {
    const [countdown, setCountdown] = useState(5);

    useEffect(() => {
        if (isOpen) {
            setCountdown(5);
            const timer = setInterval(() => {
                setCountdown(prev => {
                    if (prev <= 1) {
                        clearInterval(timer);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
            return () => clearInterval(timer);
        }
    }, [isOpen]);

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                    />
                    
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="relative w-full max-w-md bg-[#1a1a1e] border border-white/10 rounded-2xl shadow-2xl p-6 overflow-hidden"
                    >
                        {/* Status bar */}
                        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-yellow-500 to-red-500" />
                        
                        <div className="text-center space-y-4">
                            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-yellow-500/10 text-yellow-500 mb-2">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            
                            <h3 className="text-xl font-medium text-white">Your Free Trial Has Ended</h3>
                            
                            <p className="text-gray-400 text-sm leading-relaxed">
                                MiniDock is independently built and maintained by IronLab. If this tool has
                                brought value to your workflow, a one-time lifetime license directly supports
                                continued development — forever.
                            </p>
                            
                            <div className="pt-6 flex flex-col space-y-3">
                                <a
                                    href="https://minidock.net/pro"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-full py-2.5 bg-white text-black rounded-xl font-medium hover:bg-gray-100 transition-colors text-center block"
                                >
                                    Get Lifetime License — $19
                                </a>
                                
                                <button
                                    onClick={onClose}
                                    disabled={countdown > 0}
                                    className={`w-full py-2.5 rounded-xl font-medium transition-colors ${
                                        countdown > 0 
                                            ? 'bg-white/5 text-gray-500 cursor-not-allowed' 
                                            : 'bg-white/10 text-white hover:bg-white/20'
                                    }`}
                                >
                                    {countdown > 0 ? `Maybe later (${countdown}s)` : 'Maybe later'}
                                </button>
                            </div>
                            <p className="text-[10px] text-gray-700 mt-4">
                                Questions? <a href="mailto:minidock@ironlab.cc" className="hover:text-gray-500 transition-colors">minidock@ironlab.cc</a>
                                <span className="mx-1">·</span>
                                <a href="https://ironlab.cc" target="_blank" rel="noopener noreferrer" className="hover:text-gray-500 transition-colors">IronLab</a>
                            </p>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

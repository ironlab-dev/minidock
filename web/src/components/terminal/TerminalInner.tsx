'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import '@xterm/xterm/css/xterm.css';
import { getBackendBaseUrl } from '@/api/client';

export interface TerminalComponentProps {
    title?: string;
    onClose?: () => void;
}

const TerminalComponent: React.FC<TerminalComponentProps> = ({ title, onClose }) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
    const [isMaximized, setIsMaximized] = useState(false);
    const [reconnectKey, setReconnectKey] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const isDirtyRef = useRef(false);

    // Initial message or banner
    const banner = `\r\n\x1b[38;2;96;165;250mMiniDock\x1b[0m Native Terminal Bridge\r\nConnecting to local macOS shell...\r\n\r\n`;

    const connect = useCallback(() => {
        if (!terminalRef.current) return;

        // Initialize xterm.js
        const term = new Terminal({
            cursorBlink: true,
            fontSize: 14,
            fontFamily: '"3270 Nerd Font", Menlo, Monaco, "Courier New", monospace',
            theme: {
                background: '#050505',
                foreground: '#ffffff',
                cursor: '#ffffff',
                selectionBackground: 'rgba(255, 255, 255, 0.3)',
            },
            allowProposedApi: true,
            disableStdin: false, // 确保输入不被禁用
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);

        // Clean up previous instance if any
        if (xtermRef.current) {
            xtermRef.current.dispose();
        }

        xtermRef.current = term;
        fitAddonRef.current = fitAddon;

        term.open(terminalRef.current);

        // Load WebGL addon for performance if possible
        let webglAddon: WebglAddon | null = null;
        try {
            webglAddon = new WebglAddon();
            webglAddon.onContextLoss(() => {
                // WebGL 上下文丢失时，尝试恢复
                webglAddon?.dispose();
                // 重新创建 WebGL addon
                try {
                    const newWebglAddon = new WebglAddon();
                    newWebglAddon.onContextLoss(() => {
                        newWebglAddon.dispose();
                    });
                    term.loadAddon(newWebglAddon);
                    webglAddon = newWebglAddon;
                } catch (err) {
                    console.warn('Failed to restore WebGL addon', err);
                }
            });
            term.loadAddon(webglAddon);
        } catch (e) {
            console.warn('WebGL addon failed to load, falling back to canvas', e);
        }

        fitAddon.fit();

        // Re-attachment logic
        const savedSessionId = sessionStorage.getItem('terminalSessionId');
        if (!savedSessionId) {
            term.write(banner);
        }

        // WebSocket Login
        // WebSocket cannot be proxied, so we always use direct backend URL
        const backendUrl = new URL(getBackendBaseUrl());
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        let wsUrl = `${protocol}//${backendUrl.host}/terminal/ws`;
        if (savedSessionId) {
            wsUrl += `?sessionId=${savedSessionId}`;
        }

        // 如果已有连接，先关闭
        if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
            wsRef.current.close();
        }
        
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        
        // 标记此 WebSocket 是否已被取代（用于 React Strict Mode）
        let isSuperseded = false;

        // 标记是否已收到 sessionId，只有收到后才允许发送输入
        let sessionIdReceived = false;
        const pendingInputs: string[] = [];
        
        // 用于跟踪输入和回显，检测输入无法显示的问题
        let lastInputTime = 0;
        let lastEchoTime = Date.now(); // 初始化为当前时间，避免初始误报
        const inputTimeout = 2000; // 2秒超时
        let inputTimeoutId: NodeJS.Timeout | null = null;

        ws.onopen = () => {
            setStatus('connected');
            if (!savedSessionId) {
                term.write('\r\n\x1b[32m✔ Connected.\x1b[0m\r\n');
            }
            // Send initial resize
            fitAddon.fit();
            ws.send(`resize:${term.cols},${term.rows}`);
            // 确保终端获得焦点 - 直接操作 xterm.js 的 textarea 元素
            requestAnimationFrame(() => {
                term.focus();
                // xterm.js 使用隐藏的 textarea 来接收输入，直接操作它
                const textarea = (term as unknown as { textarea: HTMLTextAreaElement | undefined }).textarea;
                if (textarea) {
                    textarea.focus();
                }
            });
            setTimeout(() => {
                const textarea = (term as unknown as { textarea: HTMLTextAreaElement | undefined }).textarea;
                // 如果焦点丢失，重新设置焦点
                if (textarea && document.activeElement !== textarea) {
                    textarea.focus();
                    term.refresh(0, term.rows - 1);
                }
            }, 200);
        };

        // 过滤掉控制消息前缀，只保留纯终端数据
        const filterControlMessages = (text: string): string => {
            // 控制消息模式：这些不应该显示在终端中
            const controlPatterns = [
                /terminal_reattached/g,
                /session_id:[0-9A-Fa-f-]+/g,
                /terminal_data:/g,
                /terminal_error:[^\r\n]*/g,
            ];
            
            let filtered = text;
            for (const pattern of controlPatterns) {
                filtered = filtered.replace(pattern, '');
            }
            return filtered;
        };

        ws.onmessage = async (event) => {
            // 处理消息：如果是 Blob/ArrayBuffer，先转换为字符串
            let messageData: string;
            if (typeof event.data === 'string') {
                messageData = event.data;
            } else if (event.data instanceof Blob) {
                messageData = await event.data.text();
            } else if (event.data instanceof ArrayBuffer) {
                const decoder = new TextDecoder();
                messageData = decoder.decode(event.data);
            } else {
                console.warn('[Terminal] Unknown message type:', typeof event.data);
                return;
            }
            
            // 处理消息
            if (messageData.startsWith('terminal_data:')) {
                const data = messageData.substring(14);
                // 更新回显时间，表示收到了后端数据
                lastEchoTime = Date.now();
                // 清除输入超时
                if (inputTimeoutId) {
                    clearTimeout(inputTimeoutId);
                    inputTimeoutId = null;
                }
                term.write(data);
                // 确保终端在写入后刷新显示，特别是在切换 tab 后
                requestAnimationFrame(() => {
                    // 如果终端容器可见，强制刷新显示
                    if (terminalRef.current && terminalRef.current.offsetParent !== null) {
                        // 先调整大小，然后刷新
                        fitAddon.fit();
                        term.refresh(0, term.rows - 1);
                    }
                });
            } else if (messageData.startsWith('terminal_error:')) {
                // 后端发送的错误消息
                const errorMsg = messageData.substring('terminal_error:'.length);
                term.write(`\r\n\x1b[31m✘ 后端错误：${errorMsg}\x1b[0m\r\n`);
                return;
            } else if (messageData.startsWith('session_id:')) {
                const id = messageData.substring(11);
                sessionStorage.setItem('terminalSessionId', id);
                sessionIdReceived = true;
                // 发送所有待处理的输入
                if (pendingInputs.length > 0) {
                    const inputsToSend = [...pendingInputs];
                    pendingInputs.length = 0;
                    inputsToSend.forEach((input) => {
                        ws.send(input);
                    });
                }
            } else if (messageData === 'terminal_reattached') {
                // 使用更可靠的刷新机制：多次刷新 + 延迟确保渲染完成
                requestAnimationFrame(() => {
                    fitAddon.fit();
                    // 延迟刷新，确保历史数据已完全写入
                    setTimeout(() => {
                        term.refresh(0, term.rows - 1);
                        // 再次刷新确保显示正确
                        requestAnimationFrame(() => {
                            term.refresh(0, term.rows - 1);
                            // 确保终端获得焦点 - 直接操作 textarea
                            term.focus();
                            const textarea = (term as unknown as { textarea: HTMLTextAreaElement | undefined }).textarea;
                            if (textarea) {
                                textarea.focus();
                            }
                        });
                    }, 100);
                });
            } else {
                // 未识别的消息，可能是纯终端输出（历史数据），尝试过滤后显示
                const filteredText = filterControlMessages(messageData);
                if (filteredText) {
                    term.write(filteredText);
                }
            }
        };

        ws.onerror = () => {
            // 忽略被取代的 WebSocket 的错误
            if (isSuperseded) return;
            setStatus('error');
            term.write('\r\n\x1b[31m✘ Connection Error.\x1b[0m\r\n');
        };

        ws.onclose = () => {
            // 忽略被取代的 WebSocket 的关闭事件
            if (isSuperseded) return;
            setStatus('disconnected');
            term.write('\r\n\x1b[33m⚠ Disconnected.\x1b[0m\r\n');
        };

        term.onData((data) => {
            if (ws.readyState === WebSocket.OPEN) {
                // 记录输入时间（使用外部定义的变量）
                lastInputTime = Date.now();
                
                // 清除之前的超时
                if (inputTimeoutId) {
                    clearTimeout(inputTimeoutId);
                    inputTimeoutId = null;
                }
                
                // 设置超时检测：如果2秒内没有收到回显，显示错误信息
                inputTimeoutId = setTimeout(() => {
                    const timeSinceInput = Date.now() - lastInputTime;
                    // 如果输入后2秒内没有收到新的回显（回显时间早于输入时间），且 WebSocket 状态正常，可能是后端问题
                    if (timeSinceInput >= inputTimeout && lastEchoTime < lastInputTime && ws.readyState === WebSocket.OPEN && sessionIdReceived) {
                        term.write('\r\n\x1b[33m⚠ 警告：输入可能未正确发送到后端，请尝试重新连接或刷新页面。\x1b[0m\r\n');
                    }
                }, inputTimeout);
                isDirtyRef.current = true;
                // 如果还没有收到 sessionId，先缓存输入
                if (!sessionIdReceived) {
                    pendingInputs.push(data);
                    // 即使缓存了，也先本地回显，让用户看到输入
                    term.write(data);
                } else {
                    ws.send(data);
                }
                // 确保终端在输入后保持焦点，并强制刷新显示
                requestAnimationFrame(() => {
                    const textarea = (term as unknown as { textarea: HTMLTextAreaElement | undefined }).textarea;
                    if (textarea && document.activeElement !== textarea) {
                        textarea.focus();
                    }
                    // 强制刷新终端显示，确保输入后立即显示
                    if (terminalRef.current && terminalRef.current.offsetParent !== null) {
                        fitAddon.fit();
                        // 多次刷新确保显示正确，特别是在 tab 切换后
                        term.refresh(0, term.rows - 1);
                        requestAnimationFrame(() => {
                            term.refresh(0, term.rows - 1);
                        });
                    }
                });
            } else {
                // WebSocket 未连接时，手动回显输入（本地回显）
                // 这确保用户能看到他们输入的内容，即使后端未连接
                term.write(data);
            }
        });

        term.onResize((size) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(`resize:${size.cols},${size.rows}`);
            }
        });

        // Handle window resize
        const handleResize = () => {
            fitAddon.fit();
        };

        // Before unload handler
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isDirtyRef.current) {
                e.preventDefault();
                e.returnValue = '';
            }
        };

        window.addEventListener('resize', handleResize);
        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            // 标记此 WebSocket 已被取代，防止触发 disconnected 状态
            isSuperseded = true;
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('beforeunload', handleBeforeUnload);
            ws.close();
            term.dispose();
        };
    }, []);

    useEffect(() => {
        const cleanup = connect();
        return () => {
            cleanup?.();
        };
    }, [connect, reconnectKey]);

    // Auto-fit when maximize changes or fonts load
    useEffect(() => {
        const handleFit = () => {
            fitAddonRef.current?.fit();
        };

        const timer = setTimeout(handleFit, 100);

        // Wait for Nerd Fonts to load if they are still loading
        document.fonts.ready.then(handleFit);

        return () => clearTimeout(timer);
    }, [isMaximized]);

    // 监听页面可见性变化和焦点变化，并在组件挂载后确保焦点
    useEffect(() => {
        // 使用 IntersectionObserver 监听终端容器的可见性变化
        let observer: IntersectionObserver | null = null;
        if (terminalRef.current && 'IntersectionObserver' in window) {
            observer = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    // 当容器从不可见变为可见时，刷新终端显示并恢复焦点
                    if (entry.isIntersecting && xtermRef.current) {
                        // 使用多个 requestAnimationFrame 确保渲染完成
                        requestAnimationFrame(() => {
                            requestAnimationFrame(() => {
                                setTimeout(() => {
                                    if (xtermRef.current && fitAddonRef.current) {
                                        // 先调整终端大小以适应容器
                                        fitAddonRef.current.fit();
                                        // 强制刷新整个终端显示，确保所有内容都可见
                                        // 使用多次刷新来确保 WebGL 上下文正确恢复
                                        xtermRef.current.refresh(0, xtermRef.current.rows - 1);
                                        // 延迟再次刷新，确保渲染完成
                                        setTimeout(() => {
                                            if (xtermRef.current) {
                                                xtermRef.current.refresh(0, xtermRef.current.rows - 1);
                                            }
                                        }, 50);
                                        // 恢复焦点到终端
                                        xtermRef.current.focus();
                                        const textarea = (xtermRef.current as unknown as { textarea: HTMLTextAreaElement | undefined }).textarea;
                                        if (textarea) {
                                            // 确保 textarea 可以接收输入
                                            if (textarea.disabled) {
                                                textarea.disabled = false;
                                            }
                                            if (textarea.readOnly) {
                                                textarea.readOnly = false;
                                            }
                                            // 确保 textarea 可见
                                            const textareaStyle = window.getComputedStyle(textarea);
                                            const wasHidden = textareaStyle.display === 'none' || textareaStyle.visibility === 'hidden';
                                            if (wasHidden) {
                                                textarea.style.display = 'block';
                                                textarea.style.visibility = 'visible';
                                            }
                                            // 恢复焦点
                                            textarea.focus();
                                            // 确保焦点确实在 textarea 上
                                            const focusAfter = document.activeElement === textarea;
                                            if (!focusAfter) {
                                                setTimeout(() => {
                                                    textarea.focus();
                                                }, 50);
                                            }
                                        }
                                        requestAnimationFrame(() => {
                                            if (xtermRef.current) {
                                                xtermRef.current.refresh(0, xtermRef.current.rows - 1);
                                                // 再次刷新确保 WebGL 上下文恢复
                                                requestAnimationFrame(() => {
                                                    if (xtermRef.current) {
                                                        xtermRef.current.refresh(0, xtermRef.current.rows - 1);
                                                        // 再次确保焦点
                                                        const textarea = (xtermRef.current as unknown as { textarea: HTMLTextAreaElement | undefined }).textarea;
                                                        if (textarea && document.activeElement !== textarea) {
                                                            textarea.focus();
                                                        }
                                                    }
                                                });
                                            }
                                        });
                                    }
                                }, 100);
                            });
                        });
                    }
                });
            }, { threshold: 0.1 });
            observer.observe(terminalRef.current);
        }
        
        // 组件挂载后，延迟设置焦点以确保 DOM 已准备好
        const focusTimer = setTimeout(() => {
            if (xtermRef.current && terminalRef.current) {
                xtermRef.current.focus();
                const textarea = (xtermRef.current as unknown as { textarea: HTMLTextAreaElement | undefined }).textarea;
                if (textarea) {
                    textarea.focus();
                }
            }
        }, 300);

        const handleVisibilityChange = () => {
            if (!document.hidden && xtermRef.current) {
                // 页面重新可见时，刷新终端并恢复焦点
                requestAnimationFrame(() => {
                    setTimeout(() => {
                        if (xtermRef.current) {
                            xtermRef.current.focus();
                            const textarea = (xtermRef.current as unknown as { textarea: HTMLTextAreaElement | undefined }).textarea;
                            if (textarea) {
                                textarea.focus();
                            }
                            fitAddonRef.current?.fit();
                            xtermRef.current.refresh(0, xtermRef.current.rows - 1);
                        }
                    }, 100);
                });
            }
        };

        const handleFocus = () => {
            if (xtermRef.current) {
                const textarea = (xtermRef.current as unknown as { textarea: HTMLTextAreaElement | undefined }).textarea;
                if (textarea && document.activeElement !== textarea) {
                    requestAnimationFrame(() => {
                        setTimeout(() => {
                            xtermRef.current?.focus();
                            textarea.focus();
                            fitAddonRef.current?.fit();
                        }, 50);
                    });
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', handleFocus);

        return () => {
            clearTimeout(focusTimer);
            if (observer) {
                observer.disconnect();
            }
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', handleFocus);
        };
    }, [reconnectKey]);

    const toggleMaximize = () => {
        setIsMaximized(!isMaximized);
    };

    const createNewSession = useCallback(() => {
        // 清除 session ID
        sessionStorage.removeItem('terminalSessionId');
        
        // 断开当前连接
        if (wsRef.current) {
            wsRef.current.close();
        }
        
        // 清理 terminal
        if (xtermRef.current) {
            xtermRef.current.dispose();
            xtermRef.current = null;
        }
        
        // 触发重新连接
        setStatus('connecting');
        setReconnectKey(prev => prev + 1);
    }, []);

    return (
        <div ref={containerRef} className={`flex flex-col bg-[#050505] transition-all duration-700 group overflow-hidden relative ${isMaximized ? 'fixed inset-0 z-[100]' : 'w-full h-full rounded-[inherit]'}`}>
            {/* Toolbar */}
            <div className={`flex items-center justify-between bg-white/[0.04] border-b border-white/[0.08] px-6 py-4 backdrop-blur-md ${isMaximized ? 'hidden' : ''}`}>
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gray-500/20 flex items-center justify-center text-gray-400">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                    </div>
                    <div>
                        <h3 className="text-white font-bold text-sm tracking-tight">{title || 'Terminal'}</h3>
                        <div className="flex items-center gap-2">
                            <div className={`w-1.5 h-1.5 rounded-full ${status === 'connected' ? 'bg-emerald-500' : status === 'connecting' ? 'bg-amber-500' : 'bg-red-500'}`} />
                            <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">{status}</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button 
                        onClick={createNewSession} 
                        className="p-2 text-gray-400 hover:text-white transition-all hover:bg-white/5 rounded-lg"
                        title="创建新 Session"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                    </button>
                    <button onClick={toggleMaximize} className="p-2 text-gray-400 hover:text-white transition-all hover:bg-white/5 rounded-lg">
                        {isMaximized ? (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9L4 4m0 0v4m0-4h4m12 0l-5 5m5-5v4m0-4h-4M4 20l5-5m-5 5v-4m0 4h4m11 0l-5-5m5 5v-4m0 4h-4" />
                            </svg>
                        ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                            </svg>
                        )}
                    </button>
                    {onClose && (
                        <button onClick={onClose} className="p-2 text-gray-400 hover:text-red-400 transition-all hover:bg-red-500/10 rounded-lg">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>

            <div className="flex-1 relative bg-[#050505] p-2">
                <div 
                    ref={terminalRef} 
                    className="w-full h-full"
                    onClick={() => {
                        // 点击终端容器时确保终端获得焦点
                        if (xtermRef.current) {
                            xtermRef.current.focus();
                            const textarea = (xtermRef.current as unknown as { textarea: HTMLTextAreaElement | undefined }).textarea;
                            if (textarea) {
                                textarea.focus();
                            }
                        }
                    }}
                />
            </div>
        </div>
    );
};
export default TerminalComponent;

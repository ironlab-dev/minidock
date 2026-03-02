import React, { useEffect, useRef } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { yaml } from '@codemirror/lang-yaml';
import { xml } from '@codemirror/lang-xml';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { vim } from '@replit/codemirror-vim';
import { EditorView, keymap } from '@codemirror/view';

export interface EditorProps {
    value: string;
    onChange: (value: string) => void;
    language?: string;
    readOnly?: boolean;
    vimMode?: boolean;
    className?: string;
    placeholder?: string;
    onSave?: () => void;
    onToggleVimMode?: () => void;
}

const EditorInner: React.FC<EditorProps> = ({
    value,
    onChange,
    language = 'text',
    readOnly = false,
    vimMode = false,
    className,
    placeholder,
    onSave,
    onToggleVimMode
}) => {
    // Custom dark theme optimized for Minidock's aesthetic
    const theme = EditorView.theme({
        "&": {
            backgroundColor: "transparent",
            height: "100%",
            fontSize: "12px",
        },
        ".cm-content": {
            caretColor: "#fff",
            fontFamily: "monospace",
        },
        ".cm-line": {
            padding: "0 0",
        },
        ".cm-gutters": {
            backgroundColor: "transparent",
            color: "#6b7280", // text-gray-500
            border: "none",
        },
        ".cm-activeLineGutter": {
            backgroundColor: "rgba(255, 255, 255, 0.05)",
        },
        "&.cm-focused .cm-cursor": {
            borderLeftColor: "#fff"
        },
        "&.cm-focused .cm-selectionBackground, ::selection": {
            backgroundColor: "rgba(59, 130, 246, 0.3)"
        },
        ".cm-vim-panel": {
            padding: "4px 8px",
            backgroundColor: "rgba(0, 0, 0, 0.4)",
            color: "#d1d5db",
            borderTop: "1px solid rgba(255, 255, 255, 0.1)",
            fontFamily: "monospace",
            fontSize: "11px"
        }
    }, { dark: true });

    const editorContainerRef = useRef<HTMLDivElement>(null);
    const lastEscTimeRef = useRef<number>(0);
    const escTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // 监听 ESC 键（使用全局事件监听器，确保能捕获到所有 ESC 事件）
    useEffect(() => {
        if (!onToggleVimMode) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;

            // 检查编辑器是否获得焦点
            const activeElement = document.activeElement;
            if (!activeElement) return;

            const container = editorContainerRef.current;
            if (!container) return;

            // 检查活动元素是否在编辑器内
            const isEditorFocused = container.contains(activeElement) ||
                activeElement.closest('.cm-editor') !== null ||
                activeElement.classList.contains('cm-content') ||
                activeElement.closest('.cm-content') !== null;

            if (!isEditorFocused) return;

            const now = Date.now();
            const timeSinceLastEsc = now - lastEscTimeRef.current;

            if (!vimMode) {
                // 非 vim 模式下：按 ESC 开启 vim 模式
                e.preventDefault();
                e.stopPropagation();
                onToggleVimMode();
            } else {
                // vim 模式下：如果 500ms 内连续按两次 ESC，切换关闭 vim 模式
                // 第一次 ESC 让 vim 处理（退出插入模式），第二次 ESC 切换关闭 vim
                if (timeSinceLastEsc < 500 && timeSinceLastEsc > 0) {
                    // 第二次 ESC，切换关闭 vim 模式
                    e.preventDefault();
                    e.stopPropagation();
                    onToggleVimMode();
                    lastEscTimeRef.current = 0;
                    if (escTimeoutRef.current) {
                        clearTimeout(escTimeoutRef.current);
                        escTimeoutRef.current = null;
                    }
                } else {
                    // 第一次按 ESC，记录时间但不阻止事件，让 vim 插件处理
                    lastEscTimeRef.current = now;
                    // 设置超时，如果 500ms 内没有第二次 ESC，清除记录
                    if (escTimeoutRef.current) {
                        clearTimeout(escTimeoutRef.current);
                    }
                    escTimeoutRef.current = setTimeout(() => {
                        lastEscTimeRef.current = 0;
                    }, 500);
                    // 不阻止事件，让 vim 插件正常处理 ESC（退出插入模式）
                }
            }
        };

        // 使用 capture 模式，在事件冒泡之前捕获
        document.addEventListener('keydown', handleKeyDown, true);

        return () => {
            document.removeEventListener('keydown', handleKeyDown, true);
            if (escTimeoutRef.current) {
                clearTimeout(escTimeoutRef.current);
            }
        };
    }, [vimMode, onToggleVimMode]);

    const extensions = React.useMemo(() => {
        const keymaps = [
            {
                key: 'Mod-s',
                run: () => {
                    if (onSave) {
                        onSave();
                        return true;
                    }
                    return false;
                },
                preventDefault: true
            }
        ];

        // 根据语言类型加载对应的语法高亮
        const languageExtensions = [];
        if (language === 'yaml') {
            languageExtensions.push(yaml());
        } else if (language === 'xml') {
            languageExtensions.push(xml());
        } else if (language === 'python') {
            languageExtensions.push(python());
        } else if (language === 'swift') {
            // Swift语法与JavaScript类似，使用javascript模式
            languageExtensions.push(javascript({ jsx: false, typescript: false }));
        } else if (language === 'shell' || language === 'bash' || language === 'sh' || language === 'zsh') {
            languageExtensions.push(javascript({ jsx: false, typescript: false }));
        } else if (language === 'html') {
            languageExtensions.push(xml());
        } else if (language === 'typescript' || language === 'ts') {
            languageExtensions.push(javascript({ jsx: false, typescript: true }));
        } else if (language === 'javascript' || language === 'js') {
            languageExtensions.push(javascript({ jsx: false, typescript: false }));
        }
        // 'text' 模式不添加语言扩展，使用纯文本模式

        return [
            theme,
            EditorView.lineWrapping,
            keymap.of(keymaps),
            ...languageExtensions,
            ...(vimMode ? [vim()] : [])
        ];
    }, [language, vimMode, onSave]);

    return (
        <div ref={editorContainerRef} className={`relative h-full w-full overflow-hidden ${className}`}>
            <CodeMirror
                value={value}
                height="100%"
                theme="dark" // Use built-in dark mode as base
                extensions={extensions}
                onChange={onChange}
                editable={!readOnly}
                placeholder={placeholder}
                className="h-full bg-transparent text-white/90"
                basicSetup={{
                    lineNumbers: true,
                    highlightActiveLineGutter: true,
                    highlightSpecialChars: true,
                    history: true,
                    foldGutter: true,
                    drawSelection: true,
                    dropCursor: true,
                    allowMultipleSelections: true,
                    indentOnInput: true,
                    syntaxHighlighting: true,
                    bracketMatching: true,
                    closeBrackets: true,
                    autocompletion: true,
                    rectangularSelection: true,
                    crosshairCursor: true,
                    highlightActiveLine: true,
                    highlightSelectionMatches: true,
                    closeBracketsKeymap: true,
                    defaultKeymap: true,
                    searchKeymap: true,
                    historyKeymap: true,
                    foldKeymap: true,
                    completionKeymap: true,
                    lintKeymap: true,
                }}
            />
            {vimMode && (
                <div className="absolute bottom-2 right-4 px-2 py-1 rounded bg-green-500/20 border border-green-500/30 text-[9px] font-bold text-green-400 pointer-events-none uppercase tracking-wider backdrop-blur-sm z-10">
                    VIM Mode On
                </div>
            )}
        </div>
    );
};
export default EditorInner;

import React from 'react';

interface DiffViewerProps {
    content: string;
    className?: string;
}

interface DiffLine {
    type: 'add' | 'remove' | 'context' | 'header' | 'meta';
    content: string;
    oldLineNumber?: number;
    newLineNumber?: number;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({ content, className = '' }) => {
    const parseDiff = (diffText: string): DiffLine[] => {
        if (!diffText || diffText.trim() === '') {
            return [];
        }

        const lines = diffText.split('\n');
        const parsed: DiffLine[] = [];
        let oldLineNum = 0;
        let newLineNum = 0;
        let inHunk = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // 文件头信息
            if (line.startsWith('diff --git') || line.startsWith('index ')) {
                parsed.push({ type: 'header', content: line });
                continue;
            }
            
            // 文件路径信息
            if (line.startsWith('--- a/') || line.startsWith('--- /dev/null')) {
                parsed.push({ type: 'header', content: line });
                continue;
            }
            
            if (line.startsWith('+++ b/') || line.startsWith('+++ /dev/null')) {
                parsed.push({ type: 'header', content: line });
                continue;
            }
            
            // 块头信息（@@ ... @@）
            if (line.startsWith('@@')) {
                const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
                if (match) {
                    oldLineNum = parseInt(match[1], 10);
                    newLineNum = parseInt(match[3], 10);
                    inHunk = true;
                }
                parsed.push({ type: 'meta', content: line });
                continue;
            }
            
            // 添加的行
            if (line.startsWith('+') && !line.startsWith('+++')) {
                parsed.push({
                    type: 'add',
                    content: line.substring(1),
                    newLineNumber: inHunk ? newLineNum++ : undefined
                });
                continue;
            }
            
            // 删除的行
            if (line.startsWith('-') && !line.startsWith('---')) {
                parsed.push({
                    type: 'remove',
                    content: line.substring(1),
                    oldLineNumber: inHunk ? oldLineNum++ : undefined
                });
                continue;
            }
            
            // 上下文行（以空格开头）
            if (line.startsWith(' ')) {
                parsed.push({
                    type: 'context',
                    content: line.substring(1),
                    oldLineNumber: inHunk ? oldLineNum++ : undefined,
                    newLineNumber: inHunk ? newLineNum++ : undefined
                });
                continue;
            }
            
            // 空行
            if (line.trim() === '') {
                parsed.push({
                    type: 'context',
                    content: '',
                    oldLineNumber: inHunk ? oldLineNum++ : undefined,
                    newLineNumber: inHunk ? newLineNum++ : undefined
                });
                continue;
            }
            
            // 其他情况（如 "No newline at end of file"）
            parsed.push({ type: 'context', content: line });
        }

        return parsed;
    };

    const lines = parseDiff(content);

    const renderLine = (line: DiffLine, index: number) => {
        const baseClasses = "px-4 py-1 font-mono text-xs leading-relaxed flex items-start gap-2 min-h-[20px]";
        
        switch (line.type) {
            case 'header':
                return (
                    <div key={index} className={`${baseClasses} text-gray-400 bg-white/[0.02] border-b border-white/5 sticky top-0 backdrop-blur-sm z-10`}>
                        <span className="flex-1 text-[11px]">{line.content}</span>
                    </div>
                );
            
            case 'meta':
                return (
                    <div key={index} className={`${baseClasses} text-blue-400/90 bg-blue-500/10 border-b border-blue-500/20 sticky top-0 backdrop-blur-sm z-10`}>
                        <span className="flex-1 font-semibold text-[11px]">{line.content}</span>
                    </div>
                );
            
            case 'add':
                return (
                    <div 
                        key={index} 
                        className={`${baseClasses} bg-emerald-500/8 hover:bg-emerald-500/12 transition-colors group border-l-2 border-emerald-500/40`}
                    >
                        <span className="text-emerald-400 font-bold select-none w-5 text-center flex-shrink-0 text-[11px]">+</span>
                        <span className="text-gray-500 w-14 text-right flex-shrink-0 select-none text-[10px] font-normal">
                            {line.newLineNumber !== undefined ? line.newLineNumber : ''}
                        </span>
                        <span className="flex-1 whitespace-pre break-words font-mono text-emerald-200/90 text-[11px]">
                            {line.content || ' '}
                        </span>
                    </div>
                );
            
            case 'remove':
                return (
                    <div 
                        key={index} 
                        className={`${baseClasses} bg-red-500/8 hover:bg-red-500/12 transition-colors group border-l-2 border-red-500/40`}
                    >
                        <span className="text-red-400 font-bold select-none w-5 text-center flex-shrink-0 text-[11px]">-</span>
                        <span className="text-gray-500 w-14 text-right flex-shrink-0 select-none text-[10px] font-normal">
                            {line.oldLineNumber !== undefined ? line.oldLineNumber : ''}
                        </span>
                        <span className="flex-1 whitespace-pre break-words font-mono text-red-200/90 line-through opacity-70 text-[11px]">
                            {line.content || ' '}
                        </span>
                    </div>
                );
            
            case 'context':
            default:
                return (
                    <div 
                        key={index} 
                        className={`${baseClasses} text-gray-400 hover:bg-white/[0.02] transition-colors`}
                    >
                        <span className="text-gray-600 select-none w-5 text-center flex-shrink-0 text-[11px]"> </span>
                        <span className="text-gray-500 w-14 text-right flex-shrink-0 select-none text-[10px] font-normal">
                            {line.oldLineNumber !== undefined && line.newLineNumber !== undefined 
                                ? (line.oldLineNumber === line.newLineNumber ? line.oldLineNumber : `${line.oldLineNumber} → ${line.newLineNumber}`)
                                : line.oldLineNumber !== undefined 
                                    ? line.oldLineNumber 
                                    : line.newLineNumber !== undefined 
                                        ? line.newLineNumber 
                                        : ''}
                        </span>
                        <span className="flex-1 whitespace-pre break-words font-mono text-[11px]">{line.content || ' '}</span>
                    </div>
                );
        }
    };

    if (!content || content.trim() === '') {
        return (
            <div className={`p-8 text-center text-gray-500 text-sm ${className}`}>
                无差异内容
            </div>
        );
    }

    return (
        <div className={`overflow-y-auto max-h-full ${className}`}>
            <div className="min-w-full font-mono text-xs">
                {lines.map((line, index) => renderLine(line, index))}
            </div>
        </div>
    );
};


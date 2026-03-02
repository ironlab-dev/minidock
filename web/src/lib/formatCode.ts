import prettier from 'prettier/standalone';
import * as yamlPlugin from 'prettier/plugins/yaml';
import * as xmlPlugin from '@prettier/plugin-xml';

export type SupportedLanguage = 'yaml' | 'xml' | 'json' | 'javascript' | 'typescript' | 'shell' | 'python' | 'swift' | 'text';

export interface FormatOptions {
    language: SupportedLanguage;
    content: string;
}

export interface FormatResult {
    success: boolean;
    formatted?: string;
    error?: string;
}

/**
 * 统一的代码格式化工具
 * 支持 YAML、XML、JSON、JavaScript、TypeScript、Shell、Python、Swift 等格式
 */
export async function formatCode(options: FormatOptions): Promise<FormatResult> {
    const { language, content } = options;

    if (!content || !content.trim()) {
        return { success: false, error: '内容为空' };
    }

    try {
        switch (language as string) {
            case 'yaml':
            case 'yml':
                return await formatYAML(content);

            case 'xml':
                return await formatXML(content);

            case 'json':
                return await formatJSON(content);

            case 'javascript':
            case 'js':
                return await formatJavaScript(content, false);

            case 'typescript':
            case 'ts':
                return await formatJavaScript(content, true);

            case 'shell':
            case 'bash':
            case 'sh':
            case 'zsh':
                // Shell 脚本格式化：简单的缩进和空行处理
                return { success: true, formatted: formatShell(content) };

            case 'python':
            case 'py':
                // Python 脚本格式化：简单的缩进和空行处理
                return { success: true, formatted: formatPython(content) };

            case 'swift':
                // Swift 脚本格式化：简单的缩进和空行处理
                return { success: true, formatted: formatSwift(content) };

            case 'text':
            default:
                return { success: false, error: '当前文件类型不支持格式化' };
        }
    } catch (err) {
        const error = err as Error;
        console.error('Format error:', error);
        return {
            success: false,
            error: error.message || '格式化失败'
        };
    }
}

/**
 * 格式化 YAML 文件
 */
async function formatYAML(content: string): Promise<FormatResult> {
    try {
        const plugin = (yamlPlugin as { default?: unknown }).default || yamlPlugin;
        const formatted = await prettier.format(content, {
            parser: 'yaml',
            plugins: [plugin],
            tabWidth: 2,
            useTabs: false,
        });
        return { success: true, formatted };
    } catch (err) {
        const error = err as Error;
        return {
            success: false,
            error: error.message || 'YAML 格式化失败'
        };
    }
}

/**
 * 格式化 XML/plist 文件
 */
async function formatXML(content: string): Promise<FormatResult> {
    try {
        // Handle potential ES module default export issues
        const plugin = (xmlPlugin as { default?: unknown }).default || xmlPlugin;
        const formatted = await prettier.format(content, {
            parser: 'xml',
            plugins: [plugin],
            tabWidth: 2,
            useTabs: false,
            xmlWhitespaceSensitivity: 'ignore',
            xmlSelfClosingSpace: true,
            xmlSortAttributesByKey: false,
        });
        return { success: true, formatted };
    } catch (err) {
        const error = err as Error;
        return {
            success: false,
            error: error.message || 'XML 格式化失败'
        };
    }
}

/**
 * 格式化 JSON 文件
 */
async function formatJSON(content: string): Promise<FormatResult> {
    try {
        // 先验证 JSON 格式
        JSON.parse(content);
        const formatted = await prettier.format(content, {
            parser: 'json',
            tabWidth: 2,
            useTabs: false,
        });
        return { success: true, formatted };
    } catch (err) {
        if (err instanceof SyntaxError) {
            return {
                success: false,
                error: 'JSON 格式错误：' + err.message
            };
        }
        const error = err as Error;
        return {
            success: false,
            error: error.message || 'JSON 格式化失败'
        };
    }
}

/**
 * 格式化 JavaScript/TypeScript 文件
 */
async function formatJavaScript(content: string, isTypeScript: boolean = false): Promise<FormatResult> {
    try {
        const formatted = await prettier.format(content, {
            parser: isTypeScript ? 'typescript' : 'babel',
            tabWidth: 2,
            useTabs: false,
            semi: true,
            singleQuote: true,
            trailingComma: 'es5',
        });
        return { success: true, formatted };
    } catch (err) {
        const error = err as Error;
        return {
            success: false,
            error: error.message || 'JavaScript 格式化失败'
        };
    }
}

/**
 * 简单的 Shell 脚本格式化
 * 主要处理缩进和空行
 */
function formatShell(content: string): string {
    const lines = content.split('\n');
    let indentLevel = 0;
    const indentSize = 2;

    return lines
        .map((line) => {
            const trimmed = line.trim();

            // 空行保持
            if (!trimmed) {
                return '';
            }

            // 减少缩进（在特定关键字后）
            if (trimmed.match(/^(fi|done|esac|})$/) && indentLevel > 0) {
                indentLevel--;
            }

            // 应用缩进
            const indented = ' '.repeat(indentLevel * indentSize) + trimmed;

            // 增加缩进（在特定关键字后）
            if (trimmed.match(/^(if|for|while|case|do|then|else|elif)\s/)) {
                indentLevel++;
            }

            return indented;
        })
        .join('\n');
}

/**
 * 简单的 Python 脚本格式化
 * 主要处理空行和基本缩进
 */
function formatPython(content: string): string {
    const lines = content.split('\n');
    return lines
        .map(line => {
            // 保持原有缩进，只清理行尾空格
            return line.replace(/\s+$/, '');
        })
        .filter((line, index, array) => {
            // 移除连续的空行，但保留单个空行
            if (!line.trim()) {
                return index === 0 || array[index - 1].trim() !== '';
            }
            return true;
        })
        .join('\n');
}

/**
 * 简单的 Swift 脚本格式化
 * 主要处理空行和基本缩进
 */
function formatSwift(content: string): string {
    const lines = content.split('\n');
    return lines
        .map(line => {
            // 保持原有缩进，只清理行尾空格
            return line.replace(/\s+$/, '');
        })
        .filter((line, index, array) => {
            // 移除连续的空行，但保留单个空行
            if (!line.trim()) {
                return index === 0 || array[index - 1].trim() !== '';
            }
            return true;
        })
        .join('\n');
}

/**
 * 根据文件扩展名或文件名推断语言类型
 */
export function detectLanguage(fileName: string, content?: string): SupportedLanguage {
    const lower = fileName.toLowerCase();
    const ext = lower.split('.').pop() || '';

    // 根据扩展名判断
    switch (ext) {
        case 'yml':
        case 'yaml':
            return 'yaml';
        case 'xml':
        case 'plist':
            return 'xml';
        case 'json':
            return 'json';
        case 'js':
            return 'javascript';
        case 'ts':
            return 'typescript';
        case 'sh':
        case 'bash':
        case 'zsh':
            return 'shell';
        case 'py':
            return 'python';
        case 'swift':
            return 'swift';
        default:
            // 尝试根据内容判断
            if (content) {
                if (content.trim().startsWith('<?xml')) {
                    return 'xml';
                }
                if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
                    try {
                        JSON.parse(content);
                        return 'json';
                    } catch {
                        // 不是有效的 JSON
                    }
                }
            }
            return 'text';
    }
}

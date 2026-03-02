"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useDockerManage, FileItem as DockerFileItem } from '@/hooks/useDockerManage';
import { useSystemFiles, FileItem as SystemFileItem, FileInfo as SystemFileInfo } from '@/hooks/useSystemFiles';
import { useTranslation } from '@/hooks/useTranslation';
import { useGitOps } from "@/hooks/useGitOps";
import { Editor } from '@/components/ui/Editor';
import { useToast } from '@/hooks/useToast';
import { formatCode, detectLanguage } from '@/lib/formatCode';
import { API_URL } from '@/api/client';
import {
    Folder, File, ChevronRight, Home, Save, RefreshCw,
    Search, Plus, LayoutGrid, List as ListIcon,
    ArrowLeft, Trash2, Edit2, FilePlus, FolderPlus, X,
    FileText, Code, Image as ImageIcon, Music, Video, Archive,
    Eye, EyeOff, Info, Copy, AlertCircle, ArrowUp, ArrowDown,
    Disc, Monitor, HardDrive, Container
} from 'lucide-react';

type FileItem = DockerFileItem | SystemFileItem;

interface FileBrowserProps {
    serviceName?: string;  // Docker 模式下必需
    mode?: 'docker' | 'system';  // 默认为 'docker'
    basePath?: string;  // 系统模式下的基础路径（可选）
    onClose?: () => void;
    onPathChange?: (path: string) => void;
}

// Text file extensions that can be edited
const TEXT_FILE_EXTENSIONS = ['.txt', '.json', '.yaml', '.yml', '.conf', '.env', '.ini', '.cfg', '.log', '.md', '.xml', '.sh', '.bash', '.zsh', '.py', '.js', '.ts', '.css', '.html', '.sql', '.dockerfile', 'dockerfile'];

// Image file extensions
const IMAGE_FILE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'];

function isTextFile(fileName: string): boolean {
    const lower = fileName.toLowerCase();
    if (TEXT_FILE_EXTENSIONS.some(ext => lower.endsWith(ext))) return true;
    if (!lower.includes('.')) return true; // Assume no extension is text
    return false;
}

function isImageFile(fileName: string): boolean {
    const ext = fileName.toLowerCase().split('.').pop();
    return ext ? IMAGE_FILE_EXTENSIONS.includes(ext) : false;
}

function formatFileSize(bytes?: number): string {
    if (bytes === undefined || bytes === null) return '-';
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function getFileIcon(fileName: string, isDirectory: boolean) {
    if (isDirectory) return <Folder className="w-5 h-5 text-blue-400 fill-blue-400/20" />;

    const ext = fileName.toLowerCase().split('.').pop();
    switch (ext) {
        case 'png': case 'jpg': case 'jpeg': case 'gif': case 'svg': case 'webp':
            return <ImageIcon className="w-5 h-5 text-purple-400" />;
        case 'mp3': case 'wav': case 'ogg':
            return <Music className="w-5 h-5 text-pink-400" />;
        case 'mp4': case 'mov': case 'webm':
            return <Video className="w-5 h-5 text-red-400" />;
        case 'zip': case 'tar': case 'gz': case 'rar': case '7z':
            return <Archive className="w-5 h-5 text-orange-400" />;
        case 'js': case 'ts': case 'py': case 'java': case 'c': case 'cpp': case 'h': case 'go': case 'rs': case 'php': case 'rb':
            return <Code className="w-5 h-5 text-green-400" />;
        case 'html': case 'css': case 'json': case 'xml': case 'yaml': case 'yml': case 'md': case 'txt':
            return <FileText className="w-5 h-5 text-gray-400" />;
        default:
            return <File className="w-5 h-5 text-gray-400" />;
    }
}

function getFileLanguage(fileName: string): 'yaml' | 'xml' | 'text' | 'shell' | 'python' | 'swift' | 'javascript' | 'typescript' | 'html' | 'css' | 'sql' {
    const ext = fileName.toLowerCase().split('.').pop();
    switch (ext) {
        case 'yaml': case 'yml': return 'yaml';
        case 'xml': case 'html': return 'xml'; // Monaco identifies xml/html
        case 'sh': case 'bash': case 'zsh': return 'shell';
        case 'py': return 'python';
        case 'swift': return 'swift';
        case 'js': return 'javascript';
        case 'ts': return 'typescript';
        case 'css': return 'css';
        case 'sql': return 'sql';
        case 'html': return 'html';
        default: return 'text';
    }
}

type DialogType = 'create_folder' | 'create_file' | 'rename' | 'delete' | null;

export default function FileBrowser({ serviceName, mode = 'docker', basePath, onPathChange }: FileBrowserProps) {
    const { t } = useTranslation();
    const { vmBasePath, dockerBasePath } = useGitOps();
    const dockerFileOps = useDockerManage();
    const systemFileOps = useSystemFiles();
    const toast = useToast();

    // 为 Docker 模式创建包装函数
    const dockerListDirectory = useCallback((path: string) => dockerFileOps.listDirectory(serviceName!, path), [dockerFileOps.listDirectory, serviceName]);
    const dockerReadFileByPath = useCallback((filePath: string) => dockerFileOps.readFileByPath(serviceName!, filePath), [dockerFileOps.readFileByPath, serviceName]);
    const dockerSaveFileByPath = useCallback((filePath: string, content: string) => dockerFileOps.saveFileByPath(serviceName!, filePath, content), [dockerFileOps.saveFileByPath, serviceName]);
    const dockerDeleteFile = useCallback((filePath: string) => dockerFileOps.deleteFile(serviceName!, filePath), [dockerFileOps.deleteFile, serviceName]);
    const dockerRenameFile = useCallback((oldName: string, newName: string) => dockerFileOps.renameFile(serviceName!, oldName, newName), [dockerFileOps.renameFile, serviceName]);
    const dockerCreateDirectory = useCallback((path: string) => dockerFileOps.createDirectory(serviceName!, path), [dockerFileOps.createDirectory, serviceName]);

    // 根据模式选择文件操作函数
    // 直接使用 hooks 返回的函数，它们应该是稳定的（使用 useCallback）
    const listDirectory = mode === 'system' ? systemFileOps.listDirectory : dockerListDirectory;
    const readFileByPath = mode === 'system' ? systemFileOps.readFileByPath : dockerReadFileByPath;
    const saveFileByPath = mode === 'system' ? systemFileOps.saveFileByPath : dockerSaveFileByPath;
    const deleteFile = mode === 'system' ? systemFileOps.deleteFile : dockerDeleteFile;
    const renameFile = mode === 'system' ? systemFileOps.renameFile : dockerRenameFile;
    const createDirectory = mode === 'system' ? systemFileOps.createDirectory : dockerCreateDirectory;

    // State
    const [currentPath, setCurrentPath] = useState<string>('');
    const [files, setFiles] = useState<FileItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
    const [fileContent, setFileContent] = useState<string>('');
    const [originalContent, setOriginalContent] = useState<string>('');
    const [isSaving, setIsSaving] = useState(false);
    const [vimMode, setVimMode] = useState(false);
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
    const [searchQuery, setSearchQuery] = useState('');
    const [imageError, setImageError] = useState(false);
    const [imageLoading, setImageLoading] = useState(false);
    const [pathInput, setPathInput] = useState('');
    const [showPathInput, setShowPathInput] = useState(false);
    const [showHiddenFiles, setShowHiddenFiles] = useState(false);
    const [showPropertiesDialog, setShowPropertiesDialog] = useState(false);
    const [fileInfo, setFileInfo] = useState<SystemFileInfo | null>(null);
    const [loadingFileInfo, setLoadingFileInfo] = useState(false);
    const [permissionErrorDialog, setPermissionErrorDialog] = useState(false);
    const [permissionErrorPath, setPermissionErrorPath] = useState<string>('');

    // 排序状态
    const [sortColumn, setSortColumn] = useState<'name' | 'type' | 'size'>('name');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

    // Dialog State
    const [dialogOpen, setDialogOpen] = useState<DialogType>(null);
    const [dialogTarget, setDialogTarget] = useState<FileItem | null>(null);
    const [dialogInput, setDialogInput] = useState('');
    const [dialogLoading, setDialogLoading] = useState(false);

    // Context Menu State
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, item: FileItem | null } | null>(null);

    // Load directory contents
    const loadDirectory = useCallback(async (path: string) => {
        setLoading(true);
        try {
            const items = await listDirectory(path);
            // 确保 items 是数组
            if (Array.isArray(items)) {
                setFiles(items);
            } else {
                console.warn('listDirectory returned non-array:', items);
                setFiles([]);
            }
        } catch (error) {
            console.error('Failed to load directory:', error);
            // 检测权限问题
            const isPermissionError = (error as Error).message && (
                (error as Error).message.includes('forbidden') ||
                (error as Error).message.includes('not allowed') ||
                (error as Error).message.includes('permission') ||
                (error as Error).message.includes('access denied')
            );

            const isUserDirectory = path && (
                path.includes('Downloads') ||
                path.includes('Documents') ||
                path.includes('Desktop') ||
                path.includes('Pictures') ||
                path.includes('Music') ||
                path.includes('Movies')
            );

            // 如果是用户目录的权限问题，显示权限引导对话框
            if (isPermissionError && isUserDirectory && mode === 'system') {
                setPermissionErrorPath(path);
                setPermissionErrorDialog(true);
            } else {
                // 其他错误显示 toast
                let errorMessage = t.docker.file_manager.load_failed;
                if ((error as Error).message) {
                    if ((error as Error).message.includes('forbidden') || (error as Error).message.includes('not allowed')) {
                        if ((error as Error).message.includes('system directory')) {
                            errorMessage = '访问被拒绝：系统目录不允许访问';
                        } else if ((error as Error).message.includes('user directory')) {
                            errorMessage = '访问被拒绝：该用户目录不允许访问';
                        } else {
                            errorMessage = '访问被拒绝：该目录不在允许访问的范围内';
                        }
                    } else if ((error as Error).message.includes('not found')) {
                        errorMessage = '路径不存在';
                    } else {
                        errorMessage = (error as Error).message;
                    }
                }
                toast.error(errorMessage);
            }
            setFiles([]);
        } finally {
            setLoading(false);
        }
    }, [listDirectory, t, toast]);

    // Initial load - 挂载以及 basePath 改变时执行
    useEffect(() => {
        if (mode === 'system') {
            const initialPath = basePath || '~';
            if (initialPath !== currentPath) {
                loadDirectory(initialPath);
                setCurrentPath(initialPath);
            }
        } else {
            loadDirectory('');
            setCurrentPath('');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, basePath, serviceName]);

    // 构建完整文件路径的辅助函数
    const getFullFilePath = useCallback((filePath: string) => {
        if (mode === 'system') {
            // 系统模式：根据当前路径构建完整文件路径
            if (currentPath === '/') {
                return filePath.startsWith('/') ? filePath : `/${filePath}`;
            } else if (currentPath === '~') {
                return `~/${filePath}`;
            } else if (currentPath.startsWith('~/')) {
                return `${currentPath}/${filePath}`;
            } else if (currentPath.startsWith('/')) {
                return `${currentPath}/${filePath}`;
            } else {
                return filePath;
            }
        } else {
            // Docker 模式：原有逻辑
            return currentPath ? `${currentPath}/${filePath}` : filePath;
        }
    }, [mode, currentPath]);

    // Load file content
    const loadFile = useCallback(async (file: FileItem) => {
        if (isImageFile(file.name)) {
            // For image files, just set the selected file and generate URL
            // 构建完整文件路径
            const filePath = getFullFilePath(file.path);
            setImageError(false);
            setImageLoading(true);
            setSelectedFile({ ...file, path: filePath });
            setFileContent('');
            return;
        }

        if (!isTextFile(file.name)) {
            // Only preview text files
            // 构建完整文件路径
            const filePath = getFullFilePath(file.path);
            setSelectedFile({ ...file, path: filePath }); // Show generic preview
            setFileContent('');
            return;
        }

        setLoading(true);
        try {
            // 构建文件完整路径
            const filePath = getFullFilePath(file.path);
            const response = await readFileByPath(filePath);
            setFileContent(response.content);
            setOriginalContent(response.content);
            // 存储完整路径到 selectedFile
            setSelectedFile({ ...file, path: filePath });
        } catch (error) {
            console.error('Failed to load file:', error);
            if ((error as Error).message?.includes('10MB')) {
                toast.error(t.docker.file_manager.file_too_large);
            } else {
                toast.error(t.docker.file_manager.load_failed);
            }
        } finally {
            setLoading(false);
        }
    }, [readFileByPath, t, toast, getFullFilePath]);

    // Handle Item Click
    const handleItemClick = useCallback((file: FileItem) => {
        if (file.type === 'directory') {
            let newPath: string;
            if (mode === 'system') {
                // 系统模式：根据当前路径类型构建新路径
                // 后端返回的 file.path 是相对路径（从当前目录）
                if (currentPath === '/') {
                    // 根目录：如果 file.path 是绝对路径，直接使用；否则拼接
                    newPath = file.path.startsWith('/') ? file.path : `/${file.path}`;
                } else if (currentPath === '~') {
                    // 用户主目录：拼接相对路径
                    newPath = `~/${file.path}`;
                } else if (currentPath.startsWith('~/')) {
                    // 用户主目录子目录：拼接相对路径
                    newPath = `${currentPath}/${file.path}`;
                } else if (currentPath.startsWith('/')) {
                    // 绝对路径：拼接相对路径
                    newPath = `${currentPath}/${file.path}`;
                } else {
                    // 其他情况：使用文件路径
                    newPath = file.path;
                }
            } else {
                // Docker 模式：原有逻辑
                newPath = currentPath ? `${currentPath}/${file.path}` : file.path;
            }
            loadDirectory(newPath);
            setCurrentPath(newPath);
            onPathChange?.(newPath);
            setSearchQuery('');
        } else {
            loadFile(file);
        }
    }, [loadDirectory, loadFile, mode, currentPath]);

    // Save File
    const handleSave = useCallback(async () => {
        if (!selectedFile || fileContent === originalContent) return;

        setIsSaving(true);
        try {
            // selectedFile.path 已经是完整路径（在 loadFile 时设置）
            await saveFileByPath(selectedFile.path, fileContent);
            setOriginalContent(fileContent);
            toast.success(t.docker.file_manager.save_success);
        } catch (error) {
            console.error('Failed to save file:', error);
            toast.error(t.docker.file_manager.save_failed);
        } finally {
            setIsSaving(false);
        }
    }, [selectedFile, fileContent, originalContent, saveFileByPath, t, toast]);

    // Format File
    const handleFormat = useCallback(async () => {
        if (!selectedFile || !isTextFile(selectedFile.name)) return;

        try {
            const language = detectLanguage(selectedFile.name, fileContent);
            if (language === 'text') {
                toast.error(t.common.format_not_supported);
                return;
            }

            const result = await formatCode({
                language,
                content: fileContent,
            });

            if (result.success && result.formatted) {
                setFileContent(result.formatted);
                toast.success(t.common.format_success);
            } else {
                toast.error(result.error || t.common.format_failed);
            }
        } catch (error) {
            console.error('Format error:', error);
            toast.error(t.common.format_failed + ': ' + ((error as Error).message || String(error)));
        }
    }, [selectedFile, fileContent, t, toast]);

    // Handle Properties
    const handleShowProperties = useCallback(async (file: FileItem) => {
        if (mode !== 'system') {
            toast.error('属性功能仅在系统文件模式下可用');
            return;
        }

        setLoadingFileInfo(true);
        setShowPropertiesDialog(true);
        try {
            const fullPath = getFullFilePath(file.path);
            const info = await systemFileOps.getFileInfo(fullPath);
            setFileInfo(info);
        } catch (error) {
            console.error('Failed to load file info:', error);
            toast.error('获取文件信息失败');
            setShowPropertiesDialog(false);
        } finally {
            setLoadingFileInfo(false);
        }
    }, [mode, systemFileOps.getFileInfo, getFullFilePath, toast]);

    // Copy path to clipboard
    const handleCopyPath = useCallback(async (path: string) => {
        try {
            await navigator.clipboard.writeText(path);
            toast.success(t.docker.file_manager.path_copied);
        } catch (error) {
            console.error('Failed to copy path:', error);
            toast.error('复制失败');
        }
    }, [toast, t]);

    // Open system settings
    const handleOpenSystemSettings = useCallback(() => {
        // macOS system settings URL scheme
        const settingsURL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_FilesAndFolders';
        window.location.href = settingsURL;
    }, []);

    // Dialog Actions
    const handleDialogSubmit = useCallback(async () => {
        setDialogLoading(true);
        try {
            if (dialogOpen === 'create_folder') {
                let path: string;
                if (mode === 'system') {
                    // 系统模式：根据当前路径构建路径
                    if (currentPath === '/' || currentPath.startsWith('/')) {
                        path = currentPath === '/' ? `/${dialogInput}` : `${currentPath}/${dialogInput}`;
                    } else if (currentPath === '~' || currentPath.startsWith('~/')) {
                        path = currentPath === '~' ? `~/${dialogInput}` : `${currentPath}/${dialogInput}`;
                    } else {
                        path = dialogInput;
                    }
                } else {
                    // Docker 模式：原有逻辑
                    path = currentPath ? `${currentPath}/${dialogInput}` : dialogInput;
                }
                await createDirectory(path);
                toast.success(t.common.operation_success);
            } else if (dialogOpen === 'create_file') {
                let path: string;
                if (mode === 'system') {
                    // 系统模式：根据当前路径构建路径
                    if (currentPath === '/' || currentPath.startsWith('/')) {
                        path = currentPath === '/' ? `/${dialogInput}` : `${currentPath}/${dialogInput}`;
                    } else if (currentPath === '~' || currentPath.startsWith('~/')) {
                        path = currentPath === '~' ? `~/${dialogInput}` : `${currentPath}/${dialogInput}`;
                    } else {
                        path = dialogInput;
                    }
                } else {
                    // Docker 模式：原有逻辑
                    path = currentPath ? `${currentPath}/${dialogInput}` : dialogInput;
                }
                await saveFileByPath(path, ''); // Create empty file
                toast.success(t.common.operation_success);
            } else if (dialogOpen === 'rename' && dialogTarget) {
                // 构建完整文件路径
                const fullPath = getFullFilePath(dialogTarget.path);
                await renameFile(fullPath, dialogInput);
                toast.success(t.common.operation_success);
            } else if (dialogOpen === 'delete' && dialogTarget) {
                // 构建完整文件路径
                const fullPath = getFullFilePath(dialogTarget.path);
                await deleteFile(fullPath);
                toast.success(t.common.operation_success);
                // If we deleted the currently open file, close it
                if (selectedFile?.path === fullPath) {
                    setSelectedFile(null);
                }
            }

            // Refresh and close
            await loadDirectory(currentPath);
            setDialogOpen(null);
            setDialogInput('');
            setDialogTarget(null);
        } catch (error) {
            console.error('Operation failed:', error);
            // 检测权限问题
            const isPermissionError = (error as Error).message && (
                (error as Error).message.includes('forbidden') ||
                (error as Error).message.includes('not allowed') ||
                (error as Error).message.includes('permission') ||
                (error as Error).message.includes('access denied')
            );

            const isUserDirectory = currentPath && (
                currentPath.includes('Downloads') ||
                currentPath.includes('Documents') ||
                currentPath.includes('Desktop') ||
                currentPath.includes('Pictures') ||
                currentPath.includes('Music') ||
                currentPath.includes('Movies')
            );

            // 如果是用户目录的权限问题，显示权限引导对话框
            if (isPermissionError && isUserDirectory && mode === 'system') {
                setPermissionErrorPath(currentPath);
                setPermissionErrorDialog(true);
            } else {
                // 其他错误显示 toast
                let errorMessage = t.common.operation_failed;
                if ((error as Error).message) {
                    if ((error as Error).message.includes('forbidden') || (error as Error).message.includes('not allowed')) {
                        if ((error as Error).message.includes('system directory')) {
                            errorMessage = '操作失败：系统目录不允许访问';
                        } else if ((error as Error).message.includes('user directory')) {
                            errorMessage = '操作失败：该用户目录不允许访问';
                        } else {
                            errorMessage = '操作失败：该目录不在允许访问的范围内';
                        }
                    } else {
                        errorMessage = (error as Error).message;
                    }
                }
                toast.error(errorMessage);
            }
        } finally {
            setDialogLoading(false);
        }
    }, [dialogOpen, dialogTarget, dialogInput, currentPath, mode, createDirectory, saveFileByPath, renameFile, deleteFile, loadDirectory, getFullFilePath, selectedFile, t, toast]);

    // Breadcrumbs - 优化支持根目录和用户主目录
    const breadcrumbs = useMemo(() => {
        if (!currentPath || currentPath === '') {
            return [{ name: mode === 'system' ? '~' : t.docker.file_manager.title, path: mode === 'system' ? '~' : '' }];
        }

        // 处理根目录
        if (currentPath === '/') {
            return [{ name: '/', path: '/' }];
        }

        // 处理用户主目录
        if (currentPath === '~' || currentPath.startsWith('~/')) {
            const parts = currentPath.replace(/^~\/?/, '').split('/').filter(Boolean);
            return [
                { name: '~', path: '~' },
                ...parts.map((part, index) => ({
                    name: part,
                    path: '~/' + parts.slice(0, index + 1).join('/')
                }))
            ];
        }

        // 处理绝对路径
        const parts = currentPath.split('/').filter(Boolean);
        return [
            { name: '/', path: '/' },
            ...parts.map((part, index) => ({
                name: part,
                path: '/' + parts.slice(0, index + 1).join('/')
            }))
        ];
    }, [currentPath, mode, t]);

    // Filter files
    const filteredFiles = useMemo(() => {
        let result = files;

        // 过滤隐藏文件
        if (!showHiddenFiles) {
            result = result.filter(f => !f.name.startsWith('.'));
        }

        // 搜索过滤
        if (searchQuery) {
            result = result.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
        }

        // 排序
        result = [...result].sort((a, b) => {
            let comparison = 0;

            switch (sortColumn) {
                case 'name':
                    // 名称排序：使用 localeCompare 进行本地化排序
                    comparison = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
                    break;

                case 'type':
                    // 类型排序：文件夹优先，然后按名称排序
                    if (a.type === 'directory' && b.type !== 'directory') {
                        comparison = -1;
                    } else if (a.type !== 'directory' && b.type === 'directory') {
                        comparison = 1;
                    } else {
                        // 同类型内按名称排序
                        comparison = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
                    }
                    break;

                case 'size':
                    // 大小排序：数值排序，文件夹（undefined）排在最后
                    if (a.type === 'directory' && b.type !== 'directory') {
                        comparison = 1; // 文件夹排在最后
                    } else if (a.type !== 'directory' && b.type === 'directory') {
                        comparison = -1;
                    } else if (a.type === 'directory' && b.type === 'directory') {
                        // 两个都是文件夹，按名称排序
                        comparison = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
                    } else {
                        // 两个都是文件，按大小排序
                        const sizeA = a.size ?? 0;
                        const sizeB = b.size ?? 0;
                        comparison = sizeA - sizeB;
                    }
                    break;
            }

            // 根据排序方向返回结果
            return sortDirection === 'asc' ? comparison : -comparison;
        });

        return result;
    }, [files, searchQuery, showHiddenFiles, sortColumn, sortDirection]);

    const hasUnsavedChanges = fileContent !== originalContent && selectedFile;

    // Handle Sort
    const handleSort = useCallback((column: 'name' | 'type' | 'size') => {
        if (sortColumn === column) {
            // 如果点击的是当前排序列，切换排序方向
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            // 如果点击的是新列，设置为该列，默认升序
            setSortColumn(column);
            setSortDirection('asc');
        }
    }, [sortColumn]);

    // Handle Context Menu
    const handleContextMenu = (e: React.MouseEvent, item: FileItem | null) => {
        e.preventDefault();
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            item
        });
    };

    // Close context menu on click elsewhere
    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        document.addEventListener('click', handleClick);
        return () => document.removeEventListener('click', handleClick);
    }, []);

    return (
        <div className="flex bg-[#0D0D0D] text-white h-[calc(100vh-120px)] rounded-xl overflow-hidden border border-white/10 shadow-2xl">

            {/* Sidebar Shortcuts */}
            {mode === 'system' && (
                <div className="w-56 border-r border-white/5 bg-black/20 flex flex-col p-4 shrink-0 hidden md:flex">
                    <div className="mb-6">
                        <h3 className="text-[10px] font-bold text-white/30 uppercase tracking-widest px-2 mb-3">
                            {t.storage.shortcuts.title}
                        </h3>
                        <div className="space-y-1">
                            {[
                                { name: t.sidebar?.dashboard || 'Home', path: '~', icon: <Home className="w-4 h-4" /> },
                                { name: t.sidebar?.files || 'System', path: '/', icon: <HardDrive className="w-4 h-4" /> },
                                { name: t.sidebar?.docker || 'Docker', path: dockerBasePath, icon: <Container className="w-4 h-4" /> },
                                { name: t.sidebar?.vms || 'VMs', path: vmBasePath, icon: <Monitor className="w-4 h-4" /> },
                                { name: 'ISOs', path: `${vmBasePath}/ISOs`, icon: <Disc className="w-4 h-4" /> },
                            ].map((shortcut) => (
                                <button
                                    key={shortcut.path}
                                    onClick={() => { loadDirectory(shortcut.path); setCurrentPath(shortcut.path); }}
                                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${currentPath === shortcut.path ? 'bg-primary/20 text-white font-medium' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                                >
                                    <span className={currentPath === shortcut.path ? 'text-primary' : ''}>
                                        {shortcut.icon}
                                    </span>
                                    {shortcut.name}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <div className={`flex flex-col flex-1 ${selectedFile ? 'w-1/2 hidden lg:flex' : 'w-full'}`}>
                {/* Toolbar */}
                <div className="h-12 bg-white/[0.03] border-b border-white/10 flex items-center px-4 justify-between gap-4">
                    <div className="flex items-center gap-2 overflow-hidden flex-1">
                        <button
                            onClick={() => {
                                if (mode === 'system') {
                                    // 系统模式：计算父目录
                                    if (currentPath === '/' || currentPath === '~' || currentPath === '') {
                                        return;
                                    }
                                    if (currentPath.startsWith('~/')) {
                                        const parts = currentPath.split('/');
                                        if (parts.length === 2) {
                                            loadDirectory('~');
                                            setCurrentPath('~');
                                        } else {
                                            const parent = parts.slice(0, -1).join('/');
                                            loadDirectory(parent);
                                            setCurrentPath(parent);
                                        }
                                    } else if (currentPath.startsWith('/')) {
                                        const parts = currentPath.split('/').filter(Boolean);
                                        if (parts.length === 1) {
                                            loadDirectory('/');
                                            setCurrentPath('/');
                                        } else {
                                            const parent = '/' + parts.slice(0, -1).join('/');
                                            loadDirectory(parent);
                                            setCurrentPath(parent);
                                        }
                                    }
                                } else {
                                    // Docker 模式：原有逻辑
                                    const parent = currentPath.split('/').slice(0, -1).join('/');
                                    loadDirectory(parent);
                                    setCurrentPath(parent);
                                }
                            }}
                            disabled={!currentPath || (mode === 'system' && (currentPath === '/' || currentPath === '~'))}
                            className="p-1.5 rounded-md hover:bg-white/10 disabled:opacity-30 transition-colors"
                        >
                            <ArrowLeft className="w-4 h-4" />
                        </button>

                        {showPathInput && mode === 'system' ? (
                            <div className="flex items-center gap-2 flex-1">
                                <input
                                    type="text"
                                    value={pathInput}
                                    onChange={(e) => setPathInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            const path = pathInput.trim() || '~';
                                            loadDirectory(path);
                                            setCurrentPath(path);
                                            setShowPathInput(false);
                                            setPathInput('');
                                        } else if (e.key === 'Escape') {
                                            setShowPathInput(false);
                                            setPathInput('');
                                        }
                                    }}
                                    placeholder="输入路径 (如: /, ~, /Users/Shared)"
                                    className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-white/30 transition-all"
                                    autoFocus
                                />
                                <button
                                    onClick={() => {
                                        const path = pathInput.trim() || '~';
                                        loadDirectory(path);
                                        setCurrentPath(path);
                                        setShowPathInput(false);
                                        setPathInput('');
                                    }}
                                    className="px-3 py-1.5 bg-primary/20 hover:bg-primary/30 rounded-lg text-xs transition-colors"
                                >
                                    跳转
                                </button>
                                <button
                                    onClick={() => {
                                        setShowPathInput(false);
                                        setPathInput('');
                                    }}
                                    className="p-1.5 rounded-md hover:bg-white/10 transition-colors"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-1 text-sm bg-black/20 px-3 py-1.5 rounded-lg flex-1 overflow-x-auto no-scrollbar whitespace-nowrap">
                                <Home
                                    className="w-3.5 h-3.5 text-gray-400 hover:text-white cursor-pointer"
                                    onClick={() => {
                                        if (mode === 'system') {
                                            loadDirectory('~');
                                            setCurrentPath('~');
                                            onPathChange?.('~');
                                        } else {
                                            loadDirectory('');
                                            setCurrentPath('');
                                            onPathChange?.('');
                                        }
                                    }}
                                />
                                {breadcrumbs.map((crumb, i) => (
                                    <div key={i} className="flex items-center gap-1">
                                        {i > 0 && <ChevronRight className="w-3 h-3 text-gray-600" />}
                                        <span
                                            className="cursor-pointer hover:text-white text-gray-400"
                                            onClick={() => {
                                                loadDirectory(crumb.path);
                                                setCurrentPath(crumb.path);
                                                onPathChange?.(crumb.path);
                                            }}
                                        >
                                            {crumb.name}
                                        </span>
                                    </div>
                                ))}
                                {mode === 'system' && (
                                    <div className="w-4" /> // Spacer
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input
                                type="text"
                                placeholder={t.docker.file_manager.search_placeholder}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-40 bg-black/20 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:border-white/30 transition-all"
                            />
                        </div>

                        <div className="h-4 w-[1px] bg-white/10 mx-1" />

                        <button
                            onClick={() => setShowHiddenFiles(!showHiddenFiles)}
                            className={`p-1.5 rounded-lg transition-colors ${showHiddenFiles
                                ? 'bg-white/10 text-white'
                                : 'text-gray-400 hover:text-white hover:bg-white/5'
                                }`}
                            title={showHiddenFiles ? t.docker.file_manager.hide_hidden_files : t.docker.file_manager.show_hidden_files}
                        >
                            {showHiddenFiles ? (
                                <Eye className="w-3.5 h-3.5" />
                            ) : (
                                <EyeOff className="w-3.5 h-3.5" />
                            )}
                        </button>

                        <div className="h-4 w-[1px] bg-white/10 mx-1" />

                        <div className="flex bg-black/20 rounded-lg p-0.5 border border-white/10">
                            <button
                                onClick={() => setViewMode('list')}
                                className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'}`}
                            >
                                <ListIcon className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'}`}
                            >
                                <LayoutGrid className="w-3.5 h-3.5" />
                            </button>
                        </div>

                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setContextMenu({ x: e.clientX, y: e.clientY + 20, item: null });
                            }}
                            className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* File List Area */}
                <div
                    className="flex-1 overflow-y-auto bg-[#0A0A0A]"
                    onContextMenu={(e) => handleContextMenu(e, null)}
                >
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-3">
                            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                            <span className="text-xs">{t.common.loading}</span>
                        </div>
                    ) : filteredFiles.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-2">
                            <Folder className="w-10 h-10 opacity-20" />
                            <span className="text-sm">{t.docker.file_manager.empty_folder}</span>
                        </div>
                    ) : (
                        viewMode === 'list' ? (
                            <table className="w-full text-left text-sm border-collapse">
                                <thead className="sticky top-0 bg-[#0D0D0D] z-10 text-xs font-medium text-gray-500 uppercase tracking-wider backdrop-blur-sm bg-opacity-90">
                                    <tr>
                                        <th
                                            className={`px-4 py-2 border-b border-white/10 w-1/2 cursor-pointer hover:bg-white/5 transition-colors select-none ${sortColumn === 'name' ? 'text-blue-400' : ''
                                                }`}
                                            onClick={() => handleSort('name')}
                                        >
                                            <div className="flex items-center gap-2">
                                                <span>{t.docker.file_manager.items}</span>
                                                {sortColumn === 'name' && (
                                                    sortDirection === 'asc' ? (
                                                        <ArrowUp className="w-3 h-3" />
                                                    ) : (
                                                        <ArrowDown className="w-3 h-3" />
                                                    )
                                                )}
                                            </div>
                                        </th>
                                        <th
                                            className={`px-4 py-2 border-b border-white/10 cursor-pointer hover:bg-white/5 transition-colors select-none ${sortColumn === 'type' ? 'text-blue-400' : ''
                                                }`}
                                            onClick={() => handleSort('type')}
                                        >
                                            <div className="flex items-center gap-2">
                                                <span>{t.docker.file_manager.kind}</span>
                                                {sortColumn === 'type' && (
                                                    sortDirection === 'asc' ? (
                                                        <ArrowUp className="w-3 h-3" />
                                                    ) : (
                                                        <ArrowDown className="w-3 h-3" />
                                                    )
                                                )}
                                            </div>
                                        </th>
                                        <th
                                            className={`px-4 py-2 border-b border-white/10 text-right cursor-pointer hover:bg-white/5 transition-colors select-none ${sortColumn === 'size' ? 'text-blue-400' : ''
                                                }`}
                                            onClick={() => handleSort('size')}
                                        >
                                            <div className="flex items-center justify-end gap-2">
                                                <span>{t.docker.file_manager.size}</span>
                                                {sortColumn === 'size' && (
                                                    sortDirection === 'asc' ? (
                                                        <ArrowUp className="w-3 h-3" />
                                                    ) : (
                                                        <ArrowDown className="w-3 h-3" />
                                                    )
                                                )}
                                            </div>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredFiles.map((file) => (
                                        <tr
                                            key={file.path}
                                            onClick={() => handleItemClick(file)}
                                            onContextMenu={(e) => {
                                                e.stopPropagation();
                                                handleContextMenu(e, file);
                                            }}
                                            className={`
                                                group cursor-pointer transition-colors border-b border-white/[0.02] last:border-0
                                                ${selectedFile?.path === file.path ? 'bg-blue-500/20' : 'hover:bg-white/[0.03]'}
                                            `}
                                        >
                                            <td className="px-4 py-2">
                                                <div className="flex items-center gap-3">
                                                    {getFileIcon(file.name, file.type === 'directory')}
                                                    <span className={`truncate ${selectedFile?.path === file.path ? 'text-blue-100' : 'text-gray-300 group-hover:text-white'}`}>
                                                        {file.name}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-2 text-xs text-gray-500">
                                                {file.type === 'directory' ? t.docker.file_manager.folder : t.docker.file_manager.file}
                                            </td>
                                            <td className="px-4 py-2 text-xs text-gray-500 text-right font-mono">
                                                {file.type === 'directory' ? '--' : formatFileSize(file.size)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4 p-4">
                                {filteredFiles.map((file) => (
                                    <div
                                        key={file.path}
                                        onClick={() => handleItemClick(file)}
                                        onContextMenu={(e) => {
                                            e.stopPropagation();
                                            handleContextMenu(e, file);
                                        }}
                                        className={`
                                            group flex flex-col items-center gap-3 p-4 rounded-xl cursor-pointer transition-all border
                                            ${selectedFile?.path === file.path
                                                ? 'bg-blue-500/20 border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.15)]'
                                                : 'bg-white/[0.03] border-white/5 hover:bg-white/[0.06] hover:border-white/10 hover:shadow-lg hover:-translate-y-0.5'
                                            }
                                        `}
                                    >
                                        <div className="p-2 rounded-lg bg-black/20">
                                            {file.type === 'directory' ? (
                                                <Folder className="w-8 h-8 text-blue-400 fill-blue-400/20" />
                                            ) : (
                                                <div className="text-gray-400">
                                                    {getFileIcon(file.name.split('.').pop() || '', false)}
                                                </div>
                                            )}
                                        </div>
                                        <div className="text-center w-full">
                                            <div className="text-sm font-medium truncate w-full text-gray-300 group-hover:text-white">
                                                {file.name}
                                            </div>
                                            <div className="text-xs text-gray-600 mt-1">
                                                {file.type === 'directory' ? formatFileSize(file.size) : formatFileSize(file.size)}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )
                    )}
                </div>
            </div>

            {/* Editor Pane (Split View) */}
            {
                selectedFile && !selectedFile.type.includes('dir') && (
                    <div className="flex-1 flex flex-col border-l border-white/10 bg-[#0D0D0D] w-full lg:w-1/2">
                        <div className="h-14 border-b border-white/10 flex items-center justify-between px-4 bg-white/[0.03]">
                            <div className="flex items-center gap-2 overflow-hidden flex-1">
                                <File className="w-4 h-4 text-gray-400 shrink-0" />
                                <span className="text-sm font-medium text-white/90 truncate mr-2" title={selectedFile.name}>
                                    {selectedFile.name}
                                </span>
                                {hasUnsavedChanges && (
                                    <span className="w-2 h-2 rounded-full bg-yellow-500 shrink-0" title={t.docker.file_manager.unsaved_changes} />
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                {isTextFile(selectedFile.name) && (
                                    <>
                                        <button
                                            onClick={handleFormat}
                                            className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all bg-white/[0.05] hover:bg-white/[0.1] text-gray-400 hover:text-white border border-transparent"
                                        >
                                            {t.common.format}
                                        </button>
                                        <button
                                            onClick={() => setVimMode(!vimMode)}
                                            className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border transition-colors ${vimMode
                                                ? 'bg-green-500/10 text-green-400 border-green-500/30'
                                                : 'bg-white/5 text-gray-500 border-white/10 hover:text-gray-300'
                                                }`}
                                        >
                                            VIM
                                        </button>
                                    </>
                                )}
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving || !hasUnsavedChanges}
                                    className="p-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                    title={t.common.save}
                                >
                                    <Save className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => setSelectedFile(null)}
                                    className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 relative overflow-hidden">
                            {isImageFile(selectedFile.name) ? (
                                <div className="flex flex-col items-center justify-center h-full p-4 sm:p-6 bg-[#0A0A0A] overflow-auto">
                                    {imageLoading && !imageError && (
                                        <div className="absolute inset-0 flex items-center justify-center z-10">
                                            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                                        </div>
                                    )}
                                    {imageError ? (
                                        <div className="flex flex-col items-center justify-center gap-4 text-gray-500">
                                            <div className="p-6 rounded-2xl bg-white/5">
                                                {getFileIcon(selectedFile.name, false)}
                                            </div>
                                            <div className="text-center">
                                                <p className="text-white/80 font-medium mb-1">{selectedFile.name}</p>
                                                <p className="text-xs text-red-400">{t.docker.file_manager.image_load_failed}</p>
                                                <p className="text-xs mt-1 text-gray-500">{formatFileSize(selectedFile.size)}</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="relative w-full h-full flex items-center justify-center min-h-0">
                                            <img
                                                src={mode === 'system'
                                                    ? `${API_URL}/files?file=${encodeURIComponent(selectedFile.path)}`
                                                    : `${API_URL}/docker/services/${serviceName}/files?file=${encodeURIComponent(selectedFile.path)}`
                                                }
                                                alt={selectedFile.name}
                                                className="max-w-full max-h-full w-auto h-auto object-contain rounded-xl shadow-2xl"
                                                onLoad={() => {
                                                    setImageLoading(false);
                                                    setImageError(false);
                                                }}
                                                onError={() => {
                                                    setImageLoading(false);
                                                    setImageError(true);
                                                }}
                                                style={{ display: imageLoading ? 'none' : 'block' }}
                                            />
                                        </div>
                                    )}
                                </div>
                            ) : isTextFile(selectedFile.name) ? (
                                <Editor
                                    value={fileContent}
                                    onChange={setFileContent}
                                    language={getFileLanguage(selectedFile.name)}
                                    vimMode={vimMode}
                                    onSave={handleSave}
                                    className="h-full"
                                />
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-4">
                                    <div className="p-6 rounded-2xl bg-white/5">
                                        {getFileIcon(selectedFile.name, false)}
                                    </div>
                                    <div className="text-center">
                                        <p className="text-white/80 font-medium mb-1">{selectedFile.name}</p>
                                        <p className="text-xs">{t.docker.file_manager.binary_file}</p>
                                        <p className="text-xs mt-1">{formatFileSize(selectedFile.size)}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

            {/* Context Menu */}
            {
                contextMenu && (
                    <div
                        className="fixed z-50 min-w-[160px] bg-[#1A1A1A] border border-white/10 rounded-lg shadow-2xl py-1 transform scale-100 opacity-100 transition-all"
                        style={{ top: contextMenu.y, left: contextMenu.x }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {contextMenu.item ? (
                            <>
                                {mode === 'system' && (
                                    <button
                                        onClick={() => { handleShowProperties(contextMenu.item!); setContextMenu(null); }}
                                        className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-blue-600 hover:text-white flex items-center gap-2"
                                    >
                                        <Info className="w-3.5 h-3.5" />
                                        {t.docker.file_manager.properties}
                                    </button>
                                )}
                                <button
                                    onClick={() => { setDialogOpen('rename'); setDialogTarget(contextMenu.item); setDialogInput(contextMenu.item!.name); setContextMenu(null); }}
                                    className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-blue-600 hover:text-white flex items-center gap-2"
                                >
                                    <Edit2 className="w-3.5 h-3.5" />
                                    {t.docker.file_manager.rename}
                                </button>
                                <button
                                    onClick={() => { setDialogOpen('delete'); setDialogTarget(contextMenu.item); setContextMenu(null); }}
                                    className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-600 hover:text-white flex items-center gap-2"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    {t.docker.file_manager.delete}
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    onClick={() => { setDialogOpen('create_folder'); setDialogInput(''); setContextMenu(null); }}
                                    className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-blue-600 hover:text-white flex items-center gap-2"
                                >
                                    <FolderPlus className="w-3.5 h-3.5" />
                                    {t.docker.file_manager.new_folder}
                                </button>
                                <button
                                    onClick={() => { setDialogOpen('create_file'); setDialogInput(''); setContextMenu(null); }}
                                    className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-blue-600 hover:text-white flex items-center gap-2"
                                >
                                    <FilePlus className="w-3.5 h-3.5" />
                                    {t.docker.file_manager.new_file}
                                </button>
                                <div className="h-[1px] bg-white/10 my-1" />
                                <button
                                    onClick={() => { loadDirectory(currentPath); setContextMenu(null); }}
                                    className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-blue-600 hover:text-white flex items-center gap-2"
                                >
                                    <RefreshCw className="w-3.5 h-3.5" />
                                    {t.docker.file_manager.refresh}
                                </button>
                            </>
                        )}
                    </div>
                )
            }

            {/* Properties Dialog */}
            {
                showPropertiesDialog && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                        <div className="bg-[#1A1A1A] border border-white/10 rounded-xl shadow-2xl p-6 w-[500px] max-w-[90vw] max-h-[80vh] overflow-y-auto animate-in fade-in zoom-in duration-200">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-medium text-white">
                                    {fileInfo?.type === 'directory' ? t.docker.file_manager.folder_properties : t.docker.file_manager.file_properties}
                                </h3>
                                <button
                                    onClick={() => { setShowPropertiesDialog(false); setFileInfo(null); }}
                                    className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            {loadingFileInfo ? (
                                <div className="flex flex-col items-center justify-center py-8 text-gray-500 gap-3">
                                    <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                                    <span className="text-xs">{t.common.loading}</span>
                                </div>
                            ) : fileInfo ? (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4 text-sm">
                                        <div className="flex flex-col gap-1">
                                            <span className="text-gray-500 text-xs uppercase tracking-wide">{t.docker.file_manager.full_path}</span>
                                            <div className="flex items-center gap-2">
                                                <span className="text-white font-mono text-xs break-all">{fileInfo.path}</span>
                                                <button
                                                    onClick={() => handleCopyPath(fileInfo.path)}
                                                    className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors flex-shrink-0"
                                                    title={t.docker.file_manager.copy_path}
                                                >
                                                    <Copy className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <span className="text-gray-500 text-xs uppercase tracking-wide">{t.docker.file_manager.file_type}</span>
                                            <span className="text-white">{fileInfo.type === 'directory' ? t.docker.file_manager.folder : t.docker.file_manager.file}</span>
                                        </div>
                                        {fileInfo.size !== undefined && fileInfo.size !== null && (
                                            <div className="flex flex-col gap-1">
                                                <span className="text-gray-500 text-xs uppercase tracking-wide">{t.docker.file_manager.file_size}</span>
                                                <span className="text-white">{formatFileSize(fileInfo.size)}</span>
                                            </div>
                                        )}
                                        {fileInfo.owner && (
                                            <div className="flex flex-col gap-1">
                                                <span className="text-gray-500 text-xs uppercase tracking-wide">{t.docker.file_manager.owner}</span>
                                                <span className="text-white">{fileInfo.owner}</span>
                                            </div>
                                        )}
                                        {fileInfo.created && (
                                            <div className="flex flex-col gap-1">
                                                <span className="text-gray-500 text-xs uppercase tracking-wide">{t.docker.file_manager.created_time}</span>
                                                <span className="text-white">{new Date(fileInfo.created).toLocaleString('zh-CN')}</span>
                                            </div>
                                        )}
                                        {fileInfo.modified && (
                                            <div className="flex flex-col gap-1">
                                                <span className="text-gray-500 text-xs uppercase tracking-wide">{t.docker.file_manager.modified_time}</span>
                                                <span className="text-white">{new Date(fileInfo.modified).toLocaleString('zh-CN')}</span>
                                            </div>
                                        )}
                                        {fileInfo.permissions && (
                                            <div className="flex flex-col gap-1">
                                                <span className="text-gray-500 text-xs uppercase tracking-wide">{t.docker.file_manager.permissions}</span>
                                                <span className="text-white font-mono">{fileInfo.permissions}</span>
                                            </div>
                                        )}
                                        {fileInfo.extension && (
                                            <div className="flex flex-col gap-1">
                                                <span className="text-gray-500 text-xs uppercase tracking-wide">{t.docker.file_manager.file_extension}</span>
                                                <span className="text-white">.{fileInfo.extension}</span>
                                            </div>
                                        )}
                                        {fileInfo.mimeType && (
                                            <div className="flex flex-col gap-1">
                                                <span className="text-gray-500 text-xs uppercase tracking-wide">{t.docker.file_manager.mime_type}</span>
                                                <span className="text-white">{fileInfo.mimeType}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : null}

                            <div className="flex justify-end mt-6">
                                <button
                                    onClick={() => { setShowPropertiesDialog(false); setFileInfo(null); }}
                                    className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 transition-colors text-sm font-medium"
                                >
                                    {t.common.cancel}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Permission Error Dialog */}
            {
                permissionErrorDialog && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                        <div className="bg-[#1A1A1A] border border-yellow-500/30 rounded-xl shadow-2xl p-6 w-[500px] max-w-[90vw] animate-in fade-in zoom-in duration-200">
                            <div className="flex items-start gap-4 mb-4">
                                <div className="p-2 rounded-lg bg-yellow-500/10">
                                    <AlertCircle className="w-6 h-6 text-yellow-400" />
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-lg font-medium text-white mb-2">
                                        {t.docker.file_manager.permission_required}
                                    </h3>
                                    <p className="text-sm text-gray-400 mb-4">
                                        {t.docker.file_manager.permission_required_desc}
                                    </p>
                                    {permissionErrorPath && (
                                        <div className="mb-4">
                                            <span className="text-xs text-gray-500 block mb-1">{t.docker.file_manager.permission_path_label}</span>
                                            <div className="flex items-center gap-2 bg-black/30 rounded-lg px-3 py-2">
                                                <span className="text-white font-mono text-xs break-all flex-1">{permissionErrorPath}</span>
                                                <button
                                                    onClick={() => handleCopyPath(permissionErrorPath)}
                                                    className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors flex-shrink-0"
                                                    title={t.docker.file_manager.copy_path}
                                                >
                                                    <Copy className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                    <div className="bg-black/30 rounded-lg p-3 mb-4">
                                        <p className="text-xs font-medium text-gray-300 mb-2">{t.docker.file_manager.permission_guide_steps}</p>
                                        <ol className="text-xs text-gray-400 space-y-1 list-decimal list-inside">
                                            <li>{t.docker.file_manager.permission_step_1}</li>
                                            <li>{t.docker.file_manager.permission_step_2}</li>
                                            <li>{t.docker.file_manager.permission_step_3}</li>
                                        </ol>
                                    </div>
                                </div>
                            </div>
                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={() => { setPermissionErrorDialog(false); setPermissionErrorPath(''); }}
                                    className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 transition-colors text-sm font-medium"
                                >
                                    {t.common.cancel}
                                </button>
                                <button
                                    onClick={handleOpenSystemSettings}
                                    className="px-4 py-2 rounded-lg bg-yellow-600 hover:bg-yellow-500 text-white transition-colors text-sm font-medium shadow-lg shadow-yellow-900/20"
                                >
                                    {t.docker.file_manager.open_system_settings}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Dialogs */}
            {
                dialogOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                        <div className="bg-[#1A1A1A] border border-white/10 rounded-xl shadow-2xl p-6 w-[360px] animate-in fade-in zoom-in duration-200">
                            <h3 className="text-lg font-medium text-white mb-4">
                                {dialogOpen === 'create_folder' && t.docker.file_manager.create_folder_title}
                                {dialogOpen === 'create_file' && t.docker.file_manager.create_file_title}
                                {dialogOpen === 'rename' && t.docker.file_manager.rename_title}
                                {dialogOpen === 'delete' && t.docker.file_manager.delete}
                            </h3>

                            {dialogOpen === 'delete' ? (
                                <p className="text-gray-400 mb-6 text-sm leading-relaxed">
                                    {t.docker.file_manager.delete_confirm.replace('{name}', dialogTarget?.name || '')}
                                </p>
                            ) : (
                                <div className="mb-6">
                                    <label className="block text-xs text-gray-500 mb-2 uppercase tracking-wide">{t.docker.file_manager.enter_name}</label>
                                    <input
                                        type="text"
                                        value={dialogInput}
                                        onChange={(e) => setDialogInput(e.target.value)}
                                        className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all font-mono text-sm"
                                        autoFocus
                                        onKeyDown={(e) => e.key === 'Enter' && handleDialogSubmit()}
                                    />
                                </div>
                            )}

                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={() => setDialogOpen(null)}
                                    className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 transition-colors text-sm font-medium"
                                    disabled={dialogLoading}
                                >
                                    {t.common.cancel}
                                </button>
                                <button
                                    onClick={handleDialogSubmit}
                                    className={`px-4 py-2 rounded-lg text-white transition-all text-sm font-medium shadow-lg hover:shadow-xl ${dialogOpen === 'delete'
                                        ? 'bg-red-600 hover:bg-red-500 shadow-red-900/20'
                                        : 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/20'
                                        }`}
                                    disabled={dialogLoading || (dialogOpen !== 'delete' && !dialogInput.trim())}
                                >
                                    {dialogLoading ? t.common.loading : t.common.confirm}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}

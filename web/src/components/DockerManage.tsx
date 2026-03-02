import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDockerManage, DockerServiceItem, GitCommit } from '@/hooks/useDockerManage';
import { useTranslation } from '@/hooks/useTranslation';
import { Editor } from '@/components/ui/Editor';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useGitOps } from "@/hooks/useGitOps";
import { DiffViewer } from '@/components/ui/DiffViewer';
import { formatCode } from '@/lib/formatCode';
import EnvironmentGuard from './EnvironmentGuard';
import { getTemplatesByFile, getTemplatesByCategory, DockerConfigTemplate } from '@/lib/dockerConfigTemplates';
import { Trash2, Info, RefreshCw, ExternalLink, FolderOpen, FileText, MessageCircle } from 'lucide-react';
import { Tabs } from '@/components/ui/Tabs';
import Link from 'next/link';
import { DockerLogViewer } from '@/components/DockerLogViewer';
import { useToast } from '@/hooks/useToast';
import FileBrowser from './FileBrowser';
import { communityApps } from '@/lib/communityApps';
import { useServiceItems } from '@/hooks/useServiceItems';
import { ServiceItem } from '@/types/service';


export default function DockerManage({ initialServiceName, onViewCommunityApp }: { initialServiceName?: string, onViewCommunityApp?: (appId: string) => void }) {
    const { services, loading, isRefreshing, fetchServices, getFile, saveFile, validateFile, performAction, fetchLogs, fetchHistory, fetchDiff, deleteService } = useDockerManage();
    const { dockerBasePath } = useGitOps();
    const toast = useToast();
    // Force re-render
    const { t } = useTranslation();
    const { items: containerItems } = useServiceItems('docker-engine');
    const [selectedService, setSelectedService] = useState<DockerServiceItem | null>(null);
    const [containerInfo, setContainerInfo] = useState<ServiceItem | null>(null);
    const [editFile, setEditFile] = useState<string | null>(null);
    const [content, setContent] = useState('');
    const [originalContent, setOriginalContent] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [newServiceName, setNewServiceName] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [logs, setLogs] = useState('');
    const [showLogs, setShowLogs] = useState(false);
    const [history, setHistory] = useState<GitCommit[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [selectedCommit, setSelectedCommit] = useState<string | null>(null);
    const [diffContent, setDiffContent] = useState('');
    const [showDiff, setShowDiff] = useState(false);
    const [isActionLoading, setIsActionLoading] = useState(false);
    const [isInitialLoading, setIsInitialLoading] = useState(() => services.length === 0);

    // 使用 loading 状态来控制初始加载：只在首次加载完成时关闭
    useEffect(() => {
        if (!loading && isInitialLoading) {
            setIsInitialLoading(false);
        }
    }, [loading, isInitialLoading]);
    const [vimMode, setVimMode] = useState(false);
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['ports', 'volumes']));
    const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; serviceName: string | null }>({ isOpen: false, serviceName: null });
    const [isDeleting, setIsDeleting] = useState(false);
    const [autoRefreshLogs, setAutoRefreshLogs] = useState(true);
    const logsEndRef = useRef<HTMLDivElement>(null);
    const [isComponentMounted, setIsComponentMounted] = useState(false);
    const lastInitialServiceNameRef = useRef<string | undefined>(undefined);
    const [viewMode, setViewMode] = useState<'editor' | 'files'>('editor');
    const isFilesMode = viewMode === 'files';

    useEffect(() => {
        setIsComponentMounted(true);
    }, []);

    // Scroll to bottom when logs update
    useEffect(() => {
        if (showLogs && logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs, showLogs]);

    // Auto-refresh logs
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (showLogs && selectedService && autoRefreshLogs) {
            interval = setInterval(() => {
                fetchLogs(selectedService.name).then(res => {
                    if (isComponentMounted) { // Simple guard
                        setLogs(res.content);
                    }
                }).catch(console.error);
            }, 3000);
        }
        return () => clearInterval(interval);
    }, [showLogs, selectedService, autoRefreshLogs, fetchLogs, isComponentMounted]);

    // Handle background task completion
    useEffect(() => {
        const handleFinished = () => {
            if (isComponentMounted) {
                fetchServices();
            }
        };

        window.addEventListener('minidock:instruction_finished', handleFinished);
        return () => window.removeEventListener('minidock:instruction_finished', handleFinished);
    }, [fetchServices, isComponentMounted]);

    // 智能插入配置模板
    const insertConfigTemplate = (template: DockerConfigTemplate) => {
        if (!editFile) return;

        setContent(prev => {
            if (editFile === 'docker-compose.yml' || editFile.endsWith('.yml') || editFile.endsWith('.yaml')) {
                return insertYamlConfig(prev, template);
            } else if (editFile === 'Dockerfile') {
                return insertDockerfileConfig(prev, template);
            } else if (editFile === '.env') {
                return insertEnvConfig(prev, template);
            }
            return prev + "\n" + template.code;
        });
    };

    // 插入 YAML 配置（docker-compose.yml）
    const insertYamlConfig = (content: string, template: DockerConfigTemplate): string => {
        const lines = content.split('\n');

        // 如果内容为空或只有 version，插入完整的服务配置
        if (!content.trim() || content.trim().startsWith('version:')) {
            const hasServices = content.includes('services:');
            if (!hasServices) {
                return content + (content ? '\n\n' : '') + 'services:\n  app:\n    image: nginx:alpine\n    ' + template.code.split('\n').join('\n    ');
            }
        }

        // 查找 services 部分
        let servicesIndex = -1;
        let firstServiceIndex = -1;
        let firstServiceIndent = 0;

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim() === 'services:') {
                servicesIndex = i;
            }
            if (servicesIndex >= 0 && firstServiceIndex === -1) {
                const trimmed = lines[i].trim();
                if (trimmed && !trimmed.startsWith('#') && trimmed !== 'services:') {
                    firstServiceIndex = i;
                    firstServiceIndent = lines[i].length - lines[i].trimStart().length;
                    break;
                }
            }
        }

        // 如果找到了服务，插入到服务配置中
        if (firstServiceIndex >= 0) {
            const serviceIndent = firstServiceIndent;
            const configIndent = serviceIndent + 2; // 服务配置项需要额外缩进

            // 查找服务配置的结束位置（下一个同级别缩进或更少缩进的行）
            let insertIndex = firstServiceIndex + 1;
            for (let i = firstServiceIndex + 1; i < lines.length; i++) {
                const line = lines[i];
                const lineIndent = line.length - line.trimStart().length;
                if (line.trim() && lineIndent <= serviceIndent && !line.trim().startsWith('#')) {
                    insertIndex = i;
                    break;
                }
                insertIndex = i + 1;
            }

            // 检查是否已存在相同类型的配置
            const configKey = template.code.split(':')[0].trim();
            const hasExisting = lines.slice(firstServiceIndex, insertIndex).some(line =>
                line.trim().startsWith(configKey + ':') || line.trim().startsWith(configKey)
            );

            if (hasExisting) {
                // 如果已存在，追加到现有配置
                for (let i = firstServiceIndex; i < insertIndex; i++) {
                    if (lines[i].trim().startsWith(configKey + ':') || lines[i].trim().startsWith(configKey)) {
                        const existingIndent = lines[i].length - lines[i].trimStart().length;
                        const itemIndent = existingIndent + 2;

                        // 查找配置块的结束位置（下一个同级别或更少缩进的非空行）
                        let configEndIndex = i + 1;
                        for (let j = i + 1; j < insertIndex; j++) {
                            const line = lines[j];
                            const lineIndent = line.length - line.trimStart().length;
                            if (line.trim() && lineIndent <= existingIndent && !line.trim().startsWith('#')) {
                                configEndIndex = j;
                                break;
                            }
                            configEndIndex = j + 1;
                        }

                        // 解析模板代码，提取列表项（跳过第一行的key:）
                        const templateLines = template.code.split('\n');
                        const listItems: string[] = [];
                        let skipFirst = true;
                        for (const line of templateLines) {
                            const trimmed = line.trim();
                            if (skipFirst && trimmed.startsWith(configKey + ':')) {
                                skipFirst = false;
                                continue;
                            }
                            if (trimmed.startsWith('-')) {
                                listItems.push(trimmed);
                            }
                        }

                        // 如果模板包含列表项，追加到现有列表
                        if (listItems.length > 0) {
                            // 在配置块末尾插入新项
                            const insertPos = configEndIndex;
                            const newLines = listItems.map(item =>
                                ' '.repeat(itemIndent) + item
                            );
                            lines.splice(insertPos, 0, ...newLines);
                            return lines.join('\n');
                        } else {
                            // 如果没有列表项，按原逻辑处理
                            const newLines = template.code.split('\n').map((line, idx) => {
                                if (idx === 0 && template.code.includes(':')) {
                                    return ' '.repeat(itemIndent) + line.trim();
                                }
                                return ' '.repeat(itemIndent) + line.trim();
                            });
                            lines.splice(i + 1, 0, ...newLines);
                            return lines.join('\n');
                        }
                    }
                }
            }

            // 插入新配置
            const indentedCode = template.code.split('\n').map(line =>
                ' '.repeat(configIndent) + line.trim()
            ).join('\n');
            lines.splice(insertIndex, 0, indentedCode);
            return lines.join('\n');
        }

        // 如果是顶层配置（如 volumes, networks），插入到 services 之后
        if (template.category === 'volumes' && template.id.includes('top-level')) {
            if (servicesIndex >= 0) {
                // 查找 services 块的结束位置
                let servicesEndIndex = servicesIndex + 1;
                const servicesIndent = lines[servicesIndex].length - lines[servicesIndex].trimStart().length;
                for (let i = servicesIndex + 1; i < lines.length; i++) {
                    const line = lines[i];
                    const lineIndent = line.length - line.trimStart().length;
                    if (line.trim() && lineIndent <= servicesIndent && !line.trim().startsWith('#')) {
                        servicesEndIndex = i;
                        break;
                    }
                    servicesEndIndex = i + 1;
                }
                lines.splice(servicesEndIndex, 0, '', template.code);
                return lines.join('\n');
            }
        }
        if (template.category === 'network' && template.id.includes('top-level')) {
            if (servicesIndex >= 0) {
                let servicesEndIndex = servicesIndex + 1;
                const servicesIndent = lines[servicesIndex].length - lines[servicesIndex].trimStart().length;
                for (let i = servicesIndex + 1; i < lines.length; i++) {
                    const line = lines[i];
                    const lineIndent = line.length - line.trimStart().length;
                    if (line.trim() && lineIndent <= servicesIndent && !line.trim().startsWith('#')) {
                        servicesEndIndex = i;
                        break;
                    }
                    servicesEndIndex = i + 1;
                }
                lines.splice(servicesEndIndex, 0, '', template.code);
                return lines.join('\n');
            }
        }

        // 默认追加到末尾
        return content + (content.endsWith('\n') ? '' : '\n') + '\n' + template.code;
    };

    // 插入 Dockerfile 配置
    const insertDockerfileConfig = (content: string, template: DockerConfigTemplate): string => {
        if (!content.trim()) {
            return template.code;
        }
        return content + '\n' + template.code;
    };

    // 插入 .env 配置
    const insertEnvConfig = (content: string, template: DockerConfigTemplate): string => {
        if (!content.trim() || content.trim().startsWith('#')) {
            return content + (content ? '\n' : '') + template.code;
        }
        return content + '\n' + template.code;
    };

    const toggleCategory = (category: string) => {
        setExpandedCategories(prev => {
            const newSet = new Set(prev);
            if (newSet.has(category)) {
                newSet.delete(category);
            } else {
                newSet.add(category);
            }
            return newSet;
        });
    };

    useEffect(() => {
        // 确保 fetchServices 被调用并完成（只在组件挂载时运行一次）
        let isMounted = true;
        fetchServices(true)
            .catch((e) => {
                console.error("Failed to fetch services:", e);
            })
            .finally(() => {
                if (isMounted) {
                    setIsInitialLoading(false);
                }
            });
        // Load Vim mode preference
        const savedVimMode = localStorage.getItem('minidock_vim_mode');
        if (savedVimMode !== null) {
            setVimMode(savedVimMode === 'true');
        }
        return () => {
            isMounted = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // 只在组件挂载时运行一次，避免无限循环

    const loadContent = useCallback(async (serviceName: string, fileName: string) => {
        try {
            const res = await getFile(serviceName, fileName);
            let fileContent = res.content;
            if (fileName === '.env' && !fileContent) {
                fileContent = "# Environment Variables\n# Base service path: ${MINIDOCK_SERVICE_PATH}\n\n# Example:\n# DB_PASSWORD=my-secret\n";
            }
            setContent(fileContent);
            setOriginalContent(fileContent);
        } catch {
            setContent('');
            setOriginalContent('');
        }
    }, [getFile]);

    const handleSelectService = useCallback((service: DockerServiceItem) => {
        setSelectedService(service);
        setEditFile(null);
        setContent('');
        setOriginalContent('');

        // 查找对应的容器信息
        const matchingContainer = containerItems.find(item => {
            // 通过服务名称或项目名称匹配
            const serviceName = item.metadata?.service_name || item.metadata?.project;
            return serviceName === service.name || item.name === service.name || item.name === `/${service.name}`;
        });
        setContainerInfo(matchingContainer || null);

        // Best practice: auto-select the main configuration file
        if (service.isManaged) {
            setEditFile('docker-compose.yml');
            // We need to fetch the content. Since state updates are async, 
            // `editFile` won't be set yet if we just call handleEditFile which relies on it or state.
            // So we call a helper that takes args directly.
            loadContent(service.name, 'docker-compose.yml');
        }
    }, [loadContent, containerItems]);

    // Handle initial service selection from props
    // 当 initialServiceName 变化时处理
    // 自动选择第一个运行中的服务 (Default Selection)
    useEffect(() => {
        // 只有当没有选中服务、没有 initialServiceName、且服务列表已加载时运行
        if (!selectedService && !initialServiceName && services.length > 0 && !loading && !isInitialLoading) {
            // 查找第一个运行中的服务
            const firstRunning = services.find(s => s.isRunning);
            if (firstRunning) {
                handleSelectService(firstRunning);
            } else if (services.length > 0) {
                // 如果没有运行中的，选第一个
                handleSelectService(services[0]);
            }
        }
    }, [services, loading, isInitialLoading, selectedService, initialServiceName, handleSelectService]);

    useEffect(() => {
        // 如果 initialServiceName 没有变化，跳过处理
        if (lastInitialServiceNameRef.current === initialServiceName) {
            return;
        }

        if (initialServiceName && services.length > 0) {
            // 先尝试精确匹配
            let service = services.find(s => s.name === initialServiceName);

            // 如果精确匹配失败，尝试部分匹配（服务名称以 initialServiceName 开头或包含它）
            if (!service) {
                service = services.find(s =>
                    s.name.startsWith(initialServiceName) ||
                    s.name.includes(initialServiceName) ||
                    initialServiceName.includes(s.name)
                );
            }

            // 如果找到了服务，则重新选择
            if (service) {
                lastInitialServiceNameRef.current = initialServiceName;
                handleSelectService(service);
            } else if (!loading && !isInitialLoading) {
                // 如果没有找到服务，且当前没有在加载，尝试进行一次静默刷新
                // 这处理了社区安装后重定向到编辑页，但编辑页的 services 列表还是旧的情况

                fetchServices(true);
            }
        } else if (initialServiceName && !loading && !isInitialLoading && services.length === 0) {
            // 如果 initialServiceName 存在但列表为空（且未加载），也尝试刷新
            fetchServices(true);
        } else if (!initialServiceName) {
            // 当 initialServiceName 被清除时，重置 ref
            lastInitialServiceNameRef.current = undefined;
        }
    }, [initialServiceName, services, loading, isInitialLoading, handleSelectService, fetchServices]);

    // 当 services 更新时，如果当前有选中的服务，更新 selectedService 为最新数据
    // 这确保保存和部署后，配置不匹配状态能够及时更新
    useEffect(() => {
        if (selectedService && services.length > 0) {
            const updatedService = services.find(s => s.name === selectedService.name);
            if (updatedService) {
                // 只有当服务数据确实发生变化时才更新，避免不必要的重新渲染
                const hasChanges =
                    updatedService.configChanged !== selectedService.configChanged ||
                    updatedService.isImageMismatch !== selectedService.isImageMismatch ||
                    updatedService.isPortMismatch !== selectedService.isPortMismatch ||
                    updatedService.isRunning !== selectedService.isRunning ||
                    updatedService.configDifferences !== selectedService.configDifferences;

                if (hasChanges) {
                    setSelectedService(updatedService);
                }
            }
        }
    }, [services, selectedService?.name]); // 依赖 services 和 selectedService.name

    // 当容器列表更新时，更新当前选中服务的容器信息
    useEffect(() => {
        if (selectedService && containerItems.length > 0) {
            const matchingContainer = containerItems.find(item => {
                const serviceName = item.metadata?.service_name || item.metadata?.project;
                return serviceName === selectedService.name || item.name === selectedService.name || item.name === `/${selectedService.name}`;
            });
            setContainerInfo(matchingContainer || null);
        }
    }, [containerItems, selectedService]);

    // Find matching community app
    const matchedCommunityApp = useMemo(() => {
        if (!selectedService) return null;

        // 尝试通过镜像名称匹配 (移除 tag 后)
        const getCleanImage = (img: string) => img.split(':')[0].split('@')[0];

        const expectedClean = selectedService.expectedImage ? getCleanImage(selectedService.expectedImage) : null;
        const actualClean = selectedService.actualImage ? getCleanImage(selectedService.actualImage) : null;

        return communityApps.find(app => {
            const appClean = getCleanImage(app.primaryImage);
            return (expectedClean && appClean === expectedClean) || (actualClean && appClean === actualClean);
        }) || null;
    }, [selectedService]);


    const toggleVimMode = () => {
        const newMode = !vimMode;
        setVimMode(newMode);
        localStorage.setItem('minidock_vim_mode', String(newMode));
    };

    // Global shortcut listener for fallback outside editor (optional but "best practice" feel)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // 只在 Editor 外部（非 CodeMirror 编辑器）处理快捷键
            // Editor 内部已经有 Mod-s 快捷键处理，这里只作为备用
            // 检查事件目标是否在 Editor 内部
            const target = e.target as HTMLElement;
            if (target.closest('.cm-editor')) {
                // 在 Editor 内部，让 Editor 的快捷键处理
                return;
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                handleSave();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedService, editFile, content]); // Dependencies for closure freshness


    // 检测服务是否缺少推荐的卷映射
    const hasRecommendedVolumes = (): boolean => {
        if (!content || editFile !== 'docker-compose.yml') return false;
        const hasConfig = content.includes('./config') || content.includes('./config:');
        const hasData = content.includes('./data') || content.includes('./data:');
        return hasConfig && hasData;
    };

    // 一键添加推荐的卷映射
    const addRecommendedVolumes = () => {
        if (!content || editFile !== 'docker-compose.yml') return;

        const lines = content.split('\n');
        let insertIndex = -1;
        let serviceIndent = 0;

        // 查找第一个服务的配置位置
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim().startsWith('services:')) {
                // 找到 services 后的第一个服务
                for (let j = i + 1; j < lines.length; j++) {
                    const trimmed = lines[j].trim();
                    if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('services:')) {
                        // 检查是否是服务名（通常没有缩进或只有少量缩进）
                        const indent = lines[j].length - lines[j].trimStart().length;
                        if (indent <= 2) {
                            serviceIndent = indent;
                            // 找到服务配置块的结束位置
                            for (let k = j + 1; k < lines.length; k++) {
                                const lineIndent = lines[k].length - lines[k].trimStart().length;
                                if (lines[k].trim() && lineIndent <= serviceIndent && !lines[k].trim().startsWith('#')) {
                                    insertIndex = k;
                                    break;
                                }
                                insertIndex = k + 1;
                            }
                            break;
                        }
                    }
                }
                break;
            }
        }

        if (insertIndex === -1) {
            // 如果找不到合适的位置，追加到末尾
            insertIndex = lines.length;
        }

        // 检查是否已有 volumes 配置
        const hasVolumes = content.includes('volumes:');
        const configIndent = serviceIndent + 4;

        if (hasVolumes) {
            // 如果已有 volumes，追加到 volumes 列表
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].trim().startsWith('volumes:')) {
                    const volumesIndent = lines[i].length - lines[i].trimStart().length;
                    const itemIndent = volumesIndent + 2;
                    // 查找 volumes 列表的结束位置
                    let volumesEndIndex = i + 1;
                    for (let j = i + 1; j < lines.length; j++) {
                        const lineIndent = lines[j].length - lines[j].trimStart().length;
                        if (lines[j].trim() && lineIndent <= volumesIndent && !lines[j].trim().startsWith('#')) {
                            volumesEndIndex = j;
                            break;
                        }
                        volumesEndIndex = j + 1;
                    }
                    // 检查是否已存在推荐映射
                    const existingVolumes = lines.slice(i, volumesEndIndex).join('\n');
                    const newLines: string[] = [];
                    if (!existingVolumes.includes('./config')) {
                        newLines.push(' '.repeat(itemIndent) + '- ./config:/app/config');
                    }
                    if (!existingVolumes.includes('./data')) {
                        newLines.push(' '.repeat(itemIndent) + '- ./data:/app/data');
                    }
                    if (newLines.length > 0) {
                        lines.splice(volumesEndIndex, 0, ...newLines);
                        setContent(lines.join('\n'));
                        displayStatus("已添加推荐的卷映射", 'success');
                    } else {
                        displayStatus("推荐的卷映射已存在", 'info');
                    }
                    return;
                }
            }
        }

        // 如果没有 volumes 配置，添加完整的 volumes 块
        const newLines = [
            ' '.repeat(configIndent) + 'volumes:',
            ' '.repeat(configIndent + 2) + '- ./config:/app/config',
            ' '.repeat(configIndent + 2) + '- ./data:/app/data'
        ];
        lines.splice(insertIndex, 0, ...newLines);
        setContent(lines.join('\n'));
        displayStatus("已添加推荐的卷映射", 'success');
    };

    const handleEditFile = async (name: string, file: string) => {
        setEditFile(file);
        loadContent(name, file);
    };

    const handleFormat = async () => {
        if (!content || !editFile) return;

        try {
            // 特殊处理 .env 文件
            if (editFile === '.env') {
                const formatted = content
                    .split('\n')
                    .map(line => line.trim())
                    .filter(line => line.length > 0)
                    .join('\n');
                setContent(formatted);
                displayStatus(t.common.format_success, 'success');
                return;
            }

            // 使用统一的格式化工具
            const language = editFile.endsWith('.yml') || editFile.endsWith('.yaml') ? 'yaml' : 'text';
            if (language === 'text') {
                displayStatus(t.common.format_not_supported, 'error');
                return;
            }

            const result = await formatCode({
                language,
                content,
            });

            if (result.success && result.formatted) {
                setContent(result.formatted);
                displayStatus(t.common.format_success, 'success');
            } else {
                displayStatus(result.error || t.common.format_failed, 'error');
            }
        } catch (e) {
            console.error("Format error:", e);
            displayStatus(t.common.format_failed + ': ' + ((e as Error).message || String(e)), 'error');
        }
    };

    const handleSave = async () => {
        if (!selectedService || !editFile || !selectedService.isManaged) return;

        // Prevent saving if no changes
        if (content === originalContent) {
            displayStatus("No changes to save", 'info');
            return;
        }

        // 防止重复保存
        if (isSaving) {
            return;
        }

        // 如果是docker-compose.yml，先验证格式
        if (editFile === 'docker-compose.yml' || editFile.endsWith('.yml') || editFile.endsWith('.yaml')) {
            try {
                const validation = await validateFile(selectedService.name, editFile, content);
                if (!validation.valid) {
                    // 美化错误信息，移除技术细节，提供用户友好的提示
                    const friendlyErrors = validation.errors?.map(err => formatValidationError(err)) || ['配置格式不正确'];
                    displayStatus({
                        title: '配置验证失败',
                        message: friendlyErrors.join('\n'),
                        type: 'error'
                    });
                    return; // 阻止保存
                }
                // 验证成功，继续保存（不显示额外消息，避免闪烁）
            } catch (err) {
                const e = err as { message?: string };
                // 如果验证端点返回404，说明后端可能不支持验证（向后兼容）
                const errorMessage = e?.message || String(e);
                if (errorMessage.includes('404') || errorMessage.includes('Not Found')) {
                    // 后端不支持验证，继续保存（向后兼容）
                    console.warn('Validation endpoint not available, proceeding with save');
                } else {
                    // 其他验证错误（如网络错误），也阻止保存以确保安全
                    displayStatus({
                        title: '验证过程出错',
                        message: '无法连接到验证服务，请稍后重试',
                        type: 'error'
                    });
                    return; // 阻止保存
                }
            }
        }

        setIsSaving(true);
        try {
            await saveFile(selectedService.name, editFile, content);
            setOriginalContent(content); // Update original content to match saved

            // 等待后端重新计算配置状态（后端需要重新检查容器状态）
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Re-fetch services to get updated mismatch status
            await fetchServices();

            // 从最新的 services 状态中获取更新后的服务信息
            // 使用 useEffect 来响应 services 的变化并更新 selectedService
            // 这里先触发刷新，然后在 useEffect 中更新 selectedService

            displayStatus(t.settings?.save_success || "保存成功", 'success');
        } catch (err) {
            const e = err as { message?: string; response?: { data?: { reason?: string } } };
            // 改进错误消息，提供用户友好的提示
            const errorMessage = e?.message || String(e);

            // 检测 Git 相关错误，提供更友好的提示
            if (errorMessage.includes('index.lock') || errorMessage.includes('cannot lock ref') || errorMessage.includes('Unable to create')) {
                displayStatus({
                    title: 'Git 同步失败',
                    message: '文件已保存到本地，但 Git 同步失败。系统已自动重试，如果问题持续，请稍后手动同步。\n' + errorMessage,
                    type: 'error'
                });
            } else if (errorMessage.includes('authentication') || errorMessage.includes('permission')) {
                displayStatus({
                    title: 'Git 认证失败',
                    message: '文件已保存到本地，但无法推送到远程仓库。请检查 Git 远程仓库的访问权限。\n' + errorMessage,
                    type: 'error'
                });
            } else {
                displayStatus({
                    title: t.settings?.save_error || '保存失败',
                    message: errorMessage,
                    type: 'error'
                });
            }
        } finally {
            setIsSaving(false);
        }
    };

    const handleCreateService = async () => {
        if (!newServiceName) return;
        try {
            await saveFile(newServiceName, 'docker-compose.yml', 'version: "3.8"\nservices:\n  app:\n    image: nginx:alpine\n');
            setNewServiceName('');
            setShowCreate(false);
            fetchServices();
            // Optimistic select
            setSelectedService({ name: newServiceName, isManaged: true, isRunning: false });
            displayStatus("Service created successfully", 'success');
        } catch (err) {
            const e = err as { message?: string; response?: { data?: { reason?: string } } };
            // 检查是否是重名冲突错误
            const errorMessage = e?.message || e?.response?.data?.reason || String(e);
            if (errorMessage.includes('已存在') || errorMessage.includes('already exists')) {
                displayStatus(t.docker.service_name_exists.replace('{name}', newServiceName) + ' ' + t.docker.service_name_exists_desc, 'error');
            } else {
                displayStatus("Create failed: " + errorMessage, 'error');
            }
        }
    };

    const handleAction = async (action: 'start' | 'stop' | 'restart' | 'down') => {
        if (!selectedService) return;
        setIsActionLoading(true);
        try {
            const res = await performAction(selectedService.name, action);
            if (res.content.startsWith('instruction_id:')) {
                // Background task started
                displayStatus(action === 'start' ? "部署任务已启动，请在任务中心查看进度" : "重启任务已启动，请在任务中心查看进度", 'info');
                // No need to show logs here as they will be in the Task Center
                return;
            }

            if (action === 'down') {
                setSelectedService(null);
            } else {
                setLogs(prev => prev + `\n--- Action: ${action} ---\n` + res.content);
                setShowLogs(true);

                // 等待容器启动/重启完成，让后端有时间重新检查容器状态
                await new Promise(resolve => setTimeout(resolve, 2000));

                // 重新获取服务列表以更新 mismatch 状态
                await fetchServices();

                // 显示成功消息
                if (action === 'start') {
                    displayStatus("服务部署成功", 'success');
                } else {
                    displayStatus(`操作 ${action} 执行成功`, 'success');
                }
            }
        } catch (e) {
            displayStatus("Action failed: " + e, 'error');
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleFetchLogs = async () => {
        if (!selectedService) return;
        try {
            const res = await fetchLogs(selectedService.name);
            setLogs(res.content);
            setShowLogs(true);
        } catch (e) {
            displayStatus("Failed to fetch logs: " + e, 'error');
        }
    };

    const handleShowCreate = () => {
        setSelectedService(null);
        setEditFile(null);
        setContent('');
        setShowCreate(true);
        setShowLogs(false);
        setShowHistory(false);
    };

    // 格式化验证错误信息，使其更用户友好
    const formatValidationError = (error: string): string => {
        // 移除文件路径和临时文件名
        let formatted = error
            .replace(/validating\s+[^\s]+\s*:/gi, '')
            .replace(/\/Users\/[^\s]+\s*/g, '')
            .replace(/\.docker-compose\.yml\.tmp/gi, '')
            .trim();

        // 转换常见的错误信息为用户友好的提示
        const errorMappings: { [key: string]: string } = {
            'must be a number': '必须是数字',
            'must be a string': '必须是文本',
            'must be a boolean': '必须是 true 或 false',
            'must be an array': '必须是列表格式',
            'must be an object': '必须是对象格式',
            'required': '缺少必需的配置项',
            'invalid': '格式不正确',
            'not found': '未找到',
            'duplicate': '重复的配置项',
        };

        // 解析服务名和配置路径（如 services.sui2.ports.1）
        const pathMatch = formatted.match(/services\.(\w+)\.(.+?)(?:\s|$)/);
        if (pathMatch) {
            const [, serviceName, configPath] = pathMatch;
            const pathParts = configPath.split('.');

            // 构建友好的路径描述
            let pathDescription = '';
            if (pathParts[0] === 'ports') {
                const portIndex = pathParts[1] ? parseInt(pathParts[1]) : null;
                if (portIndex !== null) {
                    pathDescription = `端口映射的第 ${portIndex + 1} 项`;
                } else {
                    pathDescription = '端口映射配置';
                }
            } else if (pathParts[0] === 'volumes') {
                pathDescription = '卷映射配置';
            } else if (pathParts[0] === 'environment') {
                pathDescription = '环境变量配置';
            } else {
                pathDescription = pathParts.join(' → ');
            }

            // 提取错误原因
            let errorReason = formatted.replace(/services\.\w+\.(.+?)(?:\s|$)/, '').trim();
            for (const [key, value] of Object.entries(errorMappings)) {
                if (errorReason.toLowerCase().includes(key)) {
                    errorReason = value;
                    break;
                }
            }

            return `服务 "${serviceName}" 的 ${pathDescription}：${errorReason}`;
        }

        // 如果没有匹配到路径，尝试直接转换错误信息
        for (const [key, value] of Object.entries(errorMappings)) {
            if (formatted.toLowerCase().includes(key)) {
                formatted = formatted.replace(new RegExp(key, 'gi'), value);
            }
        }

        return formatted || '配置格式不正确';
    };

    const displayStatus = (input: string | { title?: string, message?: string, type: 'success' | 'error' | 'info' }, type?: 'success' | 'error' | 'info') => {
        const message = typeof input === 'string' ? input : (input.message || '');
        const title = typeof input === 'string' ? undefined : input.title;
        const finalType = typeof input === 'string' ? (type || 'info') : (input.type || 'info');

        if (finalType === 'success') {
            toast.success(message, title);
        } else if (finalType === 'error') {
            toast.error(message, title);
        } else {
            toast.info(message, title);
        }
    };

    const handleDeleteService = async () => {
        if (!deleteConfirm.serviceName) return;

        setIsDeleting(true);
        try {
            await deleteService(deleteConfirm.serviceName);
            displayStatus("服务已删除", 'success');

            // 如果删除的是当前选中的服务，清除选择
            if (selectedService?.name === deleteConfirm.serviceName) {
                setSelectedService(null);
                setEditFile(null);
                setContent('');
                setOriginalContent('');
            }

            // 刷新服务列表
            await fetchServices();
            setDeleteConfirm({ isOpen: false, serviceName: null });
        } catch (e) {
            displayStatus("删除失败: " + (e instanceof Error ? e.message : String(e)), 'error');
        } finally {
            setIsDeleting(false);
        }
    };



    return (
        <EnvironmentGuard
            feature="docker"
            title="Docker Engine Required"
            description="MiniDock needs Docker to manage containers. We can install Docker and Colima for you automatically."
        >
            {/* Loading Overlay */}
            {isInitialLoading && services.length === 0 && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-3xl animate-in fade-in duration-300">
                    <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-white/[0.05] border border-white/10 shadow-2xl">
                        <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
                        <p className="text-sm font-bold text-gray-300 tracking-wider uppercase animate-pulse">Loading Services...</p>
                    </div>
                </div>
            )}

            <div className="flex flex-col h-full gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-4 overflow-x-auto no-scrollbar py-2">
                    {/* 刷新按钮 */}
                    <button
                        onClick={() => {
                            fetchServices();
                            if (selectedService && editFile) {
                                loadContent(selectedService.name, editFile);
                            }
                        }}
                        disabled={isRefreshing || loading}
                        className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl transition-all bg-white/[0.03] text-gray-400 hover:text-white border border-white/5 hover:border-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={t.common.refresh || "刷新"}
                    >
                        <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                    </button>
                    {services.map(s => {
                        const hasMismatch = s.configChanged || s.isImageMismatch || s.isPortMismatch;
                        const isSelected = selectedService?.name === s.name && !showCreate;
                        return (
                            <button
                                key={s.name}
                                onClick={() => { handleSelectService(s); setShowCreate(false); }}
                                className={`relative z-0 h-9 px-4 rounded-xl text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2 flex-shrink-0 max-w-[160px] ${isSelected
                                    ? 'bg-brand-purple text-white shadow-lg shadow-brand-purple/20 ring-1 ring-white/10'
                                    : 'bg-white/[0.03] text-gray-400 hover:text-white border border-white/5 hover:bg-white/[0.05]'
                                    }`}
                                title={s.name}
                            >
                                <span className={`w-1.5 h-1.5 flex-shrink-0 rounded-full ${s.isRunning ? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.4)]' : 'bg-red-500/50'}`}></span>
                                <span className="truncate">{s.name}</span>
                                {hasMismatch && (
                                    <div className="relative group/tooltip flex-shrink-0">
                                        <div className="flex items-center justify-center w-4 h-4 rounded bg-orange-500/20 text-orange-400 cursor-help ml-1">
                                            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                            </svg>
                                        </div>
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-zinc-900 border border-orange-500/30 rounded-lg text-[11px] text-zinc-300 font-medium whitespace-nowrap opacity-0 group-hover/tooltip:opacity-100 pointer-events-none transition-all duration-200 z-50 shadow-xl backdrop-blur-md">
                                            <div className="flex items-center gap-2 mb-1 text-orange-400">
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                                </svg>
                                                <span className="font-bold uppercase tracking-wider text-[10px]">配置已更改</span>
                                            </div>
                                            <div className="text-gray-400 text-[10px]">
                                                {s.configDifferences || (s.isImageMismatch && s.isPortMismatch ? "镜像和端口不匹配" : s.isImageMismatch ? "镜像不匹配" : s.isPortMismatch ? "端口不匹配" : "配置已更改")}
                                            </div>
                                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-zinc-900" />
                                        </div>
                                    </div>
                                )}
                                {!s.isManaged && <span className="ml-1 px-1 py-0.5 rounded bg-amber-500/20 text-amber-500 text-[8px] flex-shrink-0">EXT</span>}
                            </button>
                        );
                    })}
                    <button
                        onClick={handleShowCreate}
                        className={`w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl transition-all font-bold ${showCreate ? 'bg-green-500 text-white shadow-lg shadow-green-500/20' : 'bg-green-500/10 text-green-500 border border-green-500/20 hover:bg-green-500/20'}`}
                        title={t.dashboard.add_service || "添加服务"}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                    </button>

                    <div className="h-6 w-[1px] bg-white/10 mx-1 flex-shrink-0" />

                    {/* View Mode Switcher */}
                    {selectedService && (
                        <div className="flex-shrink-0">
                            <Tabs
                                tabs={[
                                    {
                                        id: "editor",
                                        label: t.docker.edit_service || "编辑器",
                                        icon: FileText
                                    },
                                    {
                                        id: "files",
                                        label: t.docker.file_manager.title || "文件管理",
                                        icon: FolderOpen
                                    }
                                ]}
                                activeTab={viewMode}
                                onChange={(id) => setViewMode(id as 'editor' | 'files')}
                                variant="gray"
                                className="!p-0 !bg-transparent !border-0"
                                sticky={false}
                            />
                        </div>
                    )}
                </div>

                {showCreate && (
                    <div className="p-6 rounded-2xl bg-white/[0.03] border border-green-500/20 backdrop-blur-xl flex gap-4 animate-in zoom-in-95 duration-200">
                        <input
                            type="text"
                            value={newServiceName}
                            onChange={(e) => setNewServiceName(e.target.value)}
                            placeholder="Service Name (lowercase, no spaces)"
                            className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-green-500/50"
                        />
                        <button
                            onClick={handleCreateService}
                            className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-all active:scale-95"
                        >
                            Create
                        </button>
                        <button
                            onClick={() => setShowCreate(false)}
                            className="px-4 py-2 text-xs font-bold uppercase tracking-widest text-gray-500 hover:text-white transition-all"
                        >
                            {t.automation.cancel}
                        </button>
                    </div>
                )}

                {selectedService ? (
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-full min-h-[500px]">
                        {!isFilesMode && (
                            <div className="lg:col-span-1 space-y-4 animate-in fade-in slide-in-from-left-4 duration-300">
                                {(selectedService.configChanged || selectedService.isImageMismatch || selectedService.isPortMismatch) && (
                                    <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 space-y-3">
                                        <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-tight">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                            </svg>
                                            配置不匹配
                                        </div>
                                        {selectedService.configDifferences && (
                                            <div className="text-xs text-amber-400/80 pb-2 border-b border-amber-500/10">
                                                {selectedService.configDifferences}
                                            </div>
                                        )}

                                        {selectedService.isImageMismatch && (
                                            <div className="space-y-2 pt-2 border-t border-amber-500/10">
                                                <div className="text-label opacity-80">Image</div>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div className="space-y-1">
                                                        <div className="text-[9px] opacity-60 uppercase font-bold">Planned</div>
                                                        <div className="text-xs font-mono break-all bg-black/20 p-1.5 rounded border border-white/5">{selectedService.expectedImage}</div>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <div className="text-[9px] opacity-60 uppercase font-bold">Running</div>
                                                        <div className="text-xs font-mono break-all bg-black/20 p-1.5 rounded border border-white/5">{selectedService.actualImage}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {selectedService.isPortMismatch && (
                                            <div className="space-y-2 pt-2 border-t border-amber-500/10">
                                                <div className="text-label opacity-80">Ports</div>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div className="space-y-1">
                                                        <div className="text-[9px] opacity-60 uppercase font-bold">Planned</div>
                                                        <div className="text-xs font-mono break-all bg-black/20 p-1.5 rounded border border-white/5">{selectedService.expectedPorts || "None"}</div>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <div className="text-[9px] opacity-60 uppercase font-bold">Running</div>
                                                        <div className="text-xs font-mono break-all bg-black/20 p-1.5 rounded border border-white/5">{selectedService.actualPorts || "None"}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        <button
                                            onClick={() => handleAction('start')}
                                            disabled={isActionLoading}
                                            className="w-full mt-2 py-2 bg-amber-500 text-black text-xs font-bold rounded-lg hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                        >
                                            {isActionLoading && (
                                                <div className="w-3 h-3 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                                            )}
                                            {isActionLoading ? "部署中..." : "部署更改"}
                                        </button>
                                    </div>
                                )}

                                {/* 容器执行信息 */}
                                {containerInfo && (containerInfo.metadata?.working_dir || containerInfo.metadata?.entrypoint || containerInfo.metadata?.cmd) && (
                                    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-3 mb-4">
                                        <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-tight text-gray-400">
                                            <Info size={14} />
                                            {t.docker.manage_section.container_info}
                                        </div>
                                        
                                        {containerInfo.metadata?.working_dir && (
                                            <div className="space-y-1">
                                                <div className="text-[9px] opacity-60 uppercase font-bold text-gray-500">{t.docker.manage_section.working_dir}</div>
                                                <div className="text-xs font-mono break-all bg-black/20 p-1.5 rounded border border-white/5 text-gray-300">
                                                    {containerInfo.metadata.working_dir}
                                                </div>
                                            </div>
                                        )}

                                        {(containerInfo.metadata?.entrypoint || containerInfo.metadata?.cmd) && (
                                            <div className="space-y-2 pt-2 border-t border-white/5">
                                                <div className="text-[9px] opacity-60 uppercase font-bold text-gray-500">{t.docker.manage_section.execution_info}</div>
                                                {containerInfo.metadata?.entrypoint && (
                                                    <div className="space-y-1">
                                                        <div className="text-[9px] opacity-50 uppercase font-bold text-gray-500">{t.docker.manage_section.entrypoint}</div>
                                                        <div className="text-xs font-mono break-all bg-black/20 p-1.5 rounded border border-white/5 text-gray-300">
                                                            {containerInfo.metadata.entrypoint}
                                                        </div>
                                                    </div>
                                                )}
                                                {containerInfo.metadata?.cmd && (
                                                    <div className="space-y-1">
                                                        <div className="text-[9px] opacity-50 uppercase font-bold text-gray-500">{t.docker.manage_section.cmd}</div>
                                                        <div className="text-xs font-mono break-all bg-black/20 p-1.5 rounded border border-white/5 text-gray-300">
                                                            {containerInfo.metadata.cmd}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <div className="flex items-center justify-between mb-4 ml-2">
                                        <p className="text-section">Configuration Files</p>
                                    </div>
                                    {!selectedService.isManaged && (
                                        <div className="px-4 py-4 rounded-xl text-xs font-mono bg-amber-500/10 border border-amber-500/20 text-amber-400 mb-4">
                                            This service is unmanaged (external). Configuration files are not available.
                                        </div>
                                    )}
                                    {selectedService.isManaged && viewMode === 'editor' &&
                                        ['docker-compose.yml', 'Dockerfile', '.env'].map(file => (
                                            <button
                                                key={file}
                                                onClick={() => handleEditFile(selectedService.name, file)}
                                                className={`w-full text-left px-4 py-4 rounded-xl text-xs font-mono transition-all border ${editFile === file ? 'bg-blue-500/10 border-blue-500/50 text-blue-400' : 'bg-white/[0.02] border-white/5 text-gray-400 hover:bg-white/[0.05] hover:border-white/10'}`}
                                            >
                                                <div className="flex justify-between items-center">
                                                    <span>{file}</span>
                                                    {editFile === file && content !== originalContent && (
                                                        <span className="text-xs text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded ml-2">MODIFIED</span>
                                                    )}
                                                </div>
                                            </button>
                                        ))
                                    }

                                    {/* 最佳实践提示卡片 */}
                                    {selectedService && selectedService.isManaged && editFile === 'docker-compose.yml' && !hasRecommendedVolumes() && (
                                        <div className="mt-8 mb-4 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 backdrop-blur-sm">
                                            <div className="flex items-start gap-3">
                                                <div className="flex-shrink-0 mt-0.5">
                                                    <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-xs font-semibold text-blue-300 mb-1.5">最佳实践建议</div>
                                                    <div className="text-[11px] text-blue-400/90 leading-relaxed mb-3">
                                                        系统已自动创建 <code className="px-1 py-0.5 rounded bg-blue-500/20 text-blue-300">config</code> 和 <code className="px-1 py-0.5 rounded bg-blue-500/20 text-blue-300">data</code> 目录。
                                                        <br />
                                                        <span className="text-[10px] opacity-80 mt-1 block">
                                                            • <code>config</code> 目录：存放配置文件，会自动添加到 Git 管理
                                                            <br />
                                                            • <code>data</code> 目录：存放运行时数据，会被 Git 忽略
                                                        </span>
                                                    </div>
                                                    <button
                                                        onClick={addRecommendedVolumes}
                                                        className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 text-xs font-semibold rounded-lg transition-colors border border-blue-500/30"
                                                    >
                                                        一键添加推荐映射
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div className="mt-8 rounded-2xl bg-white/[0.02] border border-white/5 overflow-hidden backdrop-blur-xl">
                                        <div className="p-4 border-b border-white/5 bg-white/[0.01]">
                                            <p className="text-section text-gray-400 mb-0.5">配置模板</p>
                                            <p className="text-[10px] text-gray-500/80 mt-1 leading-relaxed">点击模板可一键插入到编辑器</p>
                                        </div>
                                        <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
                                            {(() => {
                                                const applicableTemplates = getTemplatesByFile(editFile);
                                                const groupedTemplates = getTemplatesByCategory(applicableTemplates);
                                                const categoryNames: Record<string, string> = {
                                                    'ports': '端口映射',
                                                    'volumes': '卷映射',
                                                    'environment': '环境变量',
                                                    'network': '网络配置',
                                                    'deploy': '部署配置',
                                                    'other': '其他配置'
                                                };

                                                if (applicableTemplates.length === 0) {
                                                    return (
                                                        <div className="p-6 text-xs text-gray-500 text-center">
                                                            <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-center">
                                                                <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                                </svg>
                                                            </div>
                                                            请先选择一个配置文件
                                                        </div>
                                                    );
                                                }

                                                return Object.entries(groupedTemplates).map(([category, templates]) => (
                                                    <div key={category} className="border-b border-white/5 last:border-b-0">
                                                        <button
                                                            onClick={() => toggleCategory(category)}
                                                            className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-white/[0.03] active:bg-white/[0.02] transition-all duration-200 group/header focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:ring-inset rounded-t-lg"
                                                        >
                                                            <span className="text-xs font-semibold text-gray-400 group-hover/header:text-gray-300 transition-colors uppercase tracking-wider">
                                                                {categoryNames[category] || category}
                                                            </span>
                                                            <svg
                                                                className={`w-4 h-4 text-gray-500 group-hover/header:text-gray-400 transition-all duration-300 ease-out ${expandedCategories.has(category) ? 'rotate-180' : ''}`}
                                                                fill="none"
                                                                stroke="currentColor"
                                                                viewBox="0 0 24 24"
                                                                strokeWidth={2}
                                                            >
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                                            </svg>
                                                        </button>
                                                        <div
                                                            className={`overflow-hidden transition-all duration-300 ease-out ${expandedCategories.has(category)
                                                                ? 'max-h-[2000px] opacity-100'
                                                                : 'max-h-0 opacity-0'
                                                                }`}
                                                        >
                                                            <div className="px-4 pb-4 pt-1 space-y-2.5">
                                                                {templates.map(template => (
                                                                    <button
                                                                        key={template.id}
                                                                        onClick={() => insertConfigTemplate(template)}
                                                                        className="w-full text-left group p-3.5 rounded-xl bg-white/[0.02] border border-white/5 hover:border-blue-500/40 hover:bg-blue-500/8 active:scale-[0.98] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:ring-inset"
                                                                    >
                                                                        <div className="flex items-start justify-between gap-2">
                                                                            <div className="flex-1 min-w-0">
                                                                                <div className="text-xs font-semibold text-gray-300 group-hover:text-blue-400 transition-colors mb-1.5 leading-snug">
                                                                                    {template.name}
                                                                                </div>
                                                                                <div className="text-[10px] text-gray-500/90 mb-2.5 leading-relaxed">
                                                                                    {template.description}
                                                                                </div>
                                                                                <pre className="text-[10px] font-mono text-gray-500 bg-black/40 backdrop-blur-sm px-3 py-2 rounded-lg border border-white/5 overflow-x-auto group-hover:border-white/10 transition-colors">
                                                                                    <code className="text-gray-400">{template.code}</code>
                                                                                </pre>
                                                                            </div>
                                                                        </div>
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ));
                                            })()}
                                        </div>
                                        <div className="p-3.5 border-t border-white/5 bg-white/[0.01] backdrop-blur-sm">
                                            <div className="flex items-center gap-2 text-[10px] text-gray-500/80">
                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/60"></div>
                                                <span>保存操作会自动触发 Git 提交</span>
                                            </div>
                                        </div>
                                    </div>
                                    {/* Community & External Links Section */}
                                    {selectedService && (
                                        <div className="mt-8 space-y-3">
                                            <p className="text-section mb-2 px-2">Resources</p>

                                            {matchedCommunityApp && (
                                                <button
                                                    onClick={() => onViewCommunityApp?.(matchedCommunityApp.id)}
                                                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-brand-blue/10 border border-brand-blue/20 text-brand-blue hover:bg-brand-blue/20 transition-all group"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <MessageCircle size={14} />
                                                        <span className="text-[11px] font-bold uppercase tracking-wider">{t.docker.manage_section.view_in_community}</span>
                                                    </div>
                                                    <svg className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                    </svg>
                                                </button>
                                            )}

                                            <div className="flex flex-col gap-1">
                                                {matchedCommunityApp?.website && (
                                                    <a
                                                        href={matchedCommunityApp.website}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs text-gray-400 hover:text-white hover:bg-white/[0.05] transition-all"
                                                    >
                                                        <ExternalLink size={14} className="opacity-50" />
                                                        <span>{t.docker.manage_section.official_website}</span>
                                                    </a>
                                                )}

                                                {selectedService.actualImage && (
                                                    <a
                                                        href={(() => {
                                                            const cleanImage = selectedService.actualImage.split(':')[0].split('@')[0];
                                                            const repoPath = cleanImage.includes('/') ? cleanImage : `library/${cleanImage}`;
                                                            return `https://hub.docker.com/r/${repoPath}`;
                                                        })()}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs text-gray-400 hover:text-white hover:bg-white/[0.05] transition-all"
                                                    >
                                                        <div className="opacity-50 scale-90">
                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                <path d="M22 7.7c0-1.1-.9-2-2-2h-3.3c-.6 0-1.1-.5-1.1-1.1V1h-4.4v3.3c0 .6-.5 1.1-1.1 1.1H6.7c-1.1 0-2 .9-2 2v3.3h-4v4.4h4v3.3c0 1.1.9 2 2 2h3.3c.6 0 1.1.5 1.1 1.1V22h4.4v-3.3c0-.6.5-1.1 1.1-1.1h3.3c1.1 0 2-.9 2-2v-3.3h4V7.7h-4z" />
                                                            </svg>
                                                        </div>
                                                        <span>{t.docker.community.visit_dockerhub}</span>
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className={isFilesMode ? "lg:col-span-4 h-full flex flex-col min-h-[600px] animate-in fade-in duration-500" : "lg:col-span-3 flex flex-col gap-4"}>
                            {isFilesMode ? (
                                <div className="flex-1 flex flex-col rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden backdrop-blur-md min-h-[600px]">
                                    <FileBrowser serviceName={selectedService.name} />
                                </div>
                            ) : (
                                <div className="flex-1 flex flex-col rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden backdrop-blur-md">
                                    <div className="flex items-center justify-between px-6 py-3 border-b border-white/5 bg-white/[0.02]">
                                        <span className="text-section">Configuration</span>
                                        {editFile && (

                                            <div className="flex gap-2">
                                                <button
                                                    onClick={toggleVimMode}
                                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${vimMode ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-white/[0.05] hover:bg-white/[0.1] text-gray-400 border border-transparent'}`}
                                                >
                                                    VIM {vimMode ? 'ON' : 'OFF'}
                                                </button>
                                                <button
                                                    onClick={handleFormat}
                                                    className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all bg-white/[0.05] hover:bg-white/[0.1] text-gray-400 hover:text-white border border-transparent"
                                                >
                                                    {t.common.format}
                                                </button>
                                                <button

                                                    onClick={handleSave}
                                                    disabled={isSaving}
                                                    className="px-4 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs font-bold uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50"
                                                >
                                                    {isSaving ? "Saving..." : t.common.save}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 w-full relative">
                                        {editFile ? (
                                            <Editor
                                                value={content}
                                                onChange={setContent}
                                                language="yaml"
                                                readOnly={!selectedService.isManaged}
                                                vimMode={vimMode}
                                                placeholder={!selectedService.isManaged ? "Unmanaged Service: View Only" : ""}
                                                className="absolute inset-0"
                                                onSave={handleSave}
                                                onToggleVimMode={toggleVimMode}
                                            />
                                        ) : (
                                            <div className="absolute inset-0 flex items-center justify-center text-gray-500 bg-white/[0.01]">
                                                {selectedService ? "Select a configuration file from the left to start editing..." : "Select a service to begin..."}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Lifecycle Controls */}
                            <div className="flex items-center gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/5 backdrop-blur-md">
                                <button
                                    onClick={() => handleAction('start')}
                                    disabled={isActionLoading}
                                    className="flex-1 px-4 py-3 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all text-xs font-bold uppercase tracking-wider disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {isActionLoading && (
                                        <div className="w-3 h-3 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                                    )}
                                    {t.common.start}
                                </button>
                                <button
                                    onClick={() => handleAction('stop')}
                                    disabled={isActionLoading}
                                    className="flex-1 px-4 py-3 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20 hover:bg-amber-500/20 transition-all text-xs font-bold uppercase tracking-wider disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {isActionLoading && (
                                        <div className="w-3 h-3 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                                    )}
                                    {t.common.stop}
                                </button>
                                <button
                                    onClick={() => handleAction('restart')}
                                    disabled={isActionLoading}
                                    className="flex-1 px-4 py-3 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-all text-xs font-bold uppercase tracking-wider disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {isActionLoading && (
                                        <div className="w-3 h-3 border-2 border-blue-500/30 border-t-blue-400 rounded-full animate-spin" />
                                    )}
                                    {t.common.restart}
                                </button>
                                <button
                                    onClick={handleFetchLogs}
                                    className="flex-1 px-4 py-3 rounded-xl bg-white/[0.05] text-gray-300 border border-white/10 hover:bg-white/[0.1] transition-all text-xs font-bold uppercase tracking-wider"
                                >
                                    {t.common.details} (Logs)
                                </button>
                                {(() => {
                                    // 对于内部管理的容器，使用配置目录
                                    // 对于外部容器，使用容器工作目录（如果存在）
                                    let filePath = `${dockerBasePath}/${selectedService.name}`;
                                    
                                    // 只有外部容器才使用容器工作目录
                                    if (!selectedService.isManaged) {
                                        const workingDir = containerInfo?.metadata?.working_dir;
                                        if (workingDir) {
                                            // 检查是否是宿主机路径（排除容器内路径如 /、/app 等）
                                            // 宿主机路径通常包含：/Users、/Volumes、/var、/opt、/tmp 等
                                            const isHostPath = workingDir.startsWith('/Users/') || 
                                                              workingDir.startsWith('/Volumes/') ||
                                                              workingDir.startsWith('/var/') || 
                                                              workingDir.startsWith('/opt/') || 
                                                              workingDir.startsWith('/tmp/') ||
                                                              workingDir.startsWith('/home/') ||
                                                              workingDir.startsWith(dockerBasePath);
                                            
                                            // 排除常见的容器内路径
                                            const isContainerPath = workingDir === '/' || 
                                                                   workingDir.startsWith('/app/') ||
                                                                   workingDir.startsWith('/usr/') ||
                                                                   workingDir.startsWith('/etc/');
                                            
                                            if (isHostPath && !isContainerPath) {
                                                filePath = workingDir;
                                            } else if (workingDir.startsWith(dockerBasePath)) {
                                                // 如果工作目录在 dockerBasePath 下，直接使用
                                                filePath = workingDir;
                                            }
                                        }
                                    }
                                    
                                    return (
                                        <Link
                                            href={`/files?tab=files&path=${encodeURIComponent(filePath)}`}
                                            className="flex-1 px-4 py-3 rounded-xl bg-white/[0.05] text-gray-300 border border-white/10 hover:bg-white/[0.1] transition-all text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 group"
                                            title={!selectedService.isManaged && containerInfo?.metadata?.working_dir && filePath !== `${dockerBasePath}/${selectedService.name}` ? `${t.storage.tabs.files} (${t.docker.manage_section.working_dir})` : t.storage.tabs.files}
                                        >
                                            <FolderOpen size={14} className="group-hover:scale-110 transition-transform" />
                                            <span>{t.storage.tabs.files}</span>
                                        </Link>
                                    );
                                })()}
                                <button
                                    onClick={async () => {
                                        if (!selectedService || !selectedService.isManaged) return;
                                        try {
                                            const commits = await fetchHistory(selectedService.name);
                                            setHistory(commits);
                                            setShowHistory(true);
                                            setShowLogs(false);
                                            setShowDiff(false);
                                        } catch {
                                            displayStatus(t.docker.manage_section.failed_to_fetch_history, 'error');
                                        }
                                    }}
                                    className="flex-1 px-4 py-3 rounded-xl bg-white/[0.05] text-gray-300 border border-white/10 hover:bg-white/[0.1] transition-all text-xs font-bold uppercase tracking-wider"
                                >
                                    {t.docker.manage_section.history_git}
                                </button>
                                {selectedService?.isManaged && (
                                    <button
                                        onClick={() => setDeleteConfirm({ isOpen: true, serviceName: selectedService.name })}
                                        disabled={isActionLoading}
                                        className="px-4 py-3 rounded-xl bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20 transition-all text-xs font-bold uppercase tracking-wider disabled:opacity-50 flex items-center gap-2"
                                    >
                                        <Trash2 size={14} />
                                        删除
                                    </button>
                                )}
                            </div>

                            {/* Logs Terminal Area */}
                            {showLogs && (
                                <DockerLogViewer
                                    title={selectedService?.name || 'Output'}
                                    logs={logs}
                                    showLogs={showLogs}
                                    onClose={() => setShowLogs(false)}
                                    onRefresh={handleFetchLogs}
                                    autoRefresh={autoRefreshLogs}
                                    onToggleAutoRefresh={() => setAutoRefreshLogs(!autoRefreshLogs)}
                                    status={autoRefreshLogs ? 'active' : 'inactive'}
                                />
                            )}


                            {/* History Area */}
                            {showHistory && (
                                <div className="flex flex-col rounded-2xl border border-white/5 bg-black/40 overflow-hidden animate-in slide-in-from-bottom-2 duration-300 max-h-[400px]">
                                    <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-white/[0.02]">
                                        <span className="text-xs font-mono text-gray-500 uppercase tracking-widest">{t.docker.manage_section.git_history_log}</span>
                                        <button onClick={() => {
                                            setShowHistory(false);
                                            setShowDiff(false);
                                            setSelectedCommit(null);
                                        }} className="text-gray-500 hover:text-white text-xs">✕</button>
                                    </div>
                                    {!showDiff ? (
                                        <div className="overflow-y-auto">
                                            {history.length > 0 ? (
                                                <div className="divide-y divide-white/5">
                                                    {history.map((commit, idx) => (
                                                        <button
                                                            key={idx}
                                                            onClick={async () => {
                                                                if (!selectedService) return;
                                                                try {
                                                                    setSelectedCommit(commit.hash);
                                                                    const diff = await fetchDiff(selectedService.name, commit.hash);
                                                                    setDiffContent(diff.content);
                                                                    setShowDiff(true);
                                                                } catch {
                                                                    displayStatus(t.docker.manage_section.failed_to_fetch_diff, 'error');
                                                                }
                                                            }}
                                                            className="w-full px-4 py-3 text-left hover:bg-white/[0.03] transition-colors group"
                                                        >
                                                            <div className="flex items-start justify-between gap-3">
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex items-center gap-2 mb-1">
                                                                        <span className="font-mono text-xs text-emerald-400/80">{commit.hash}</span>
                                                                        <span className="text-xs text-gray-500">{new Date(commit.date).toLocaleString('zh-CN')}</span>
                                                                    </div>
                                                                    <div className="text-sm text-gray-300 group-hover:text-white transition-colors line-clamp-2">
                                                                        {commit.message}
                                                                    </div>
                                                                    <div className="text-xs text-gray-500 mt-1">
                                                                        {commit.author}
                                                                    </div>
                                                                </div>
                                                                <svg className="w-4 h-4 text-gray-500 group-hover:text-gray-300 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                                </svg>
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="p-4 text-center text-gray-500 text-sm">{t.docker.manage_section.no_history_entries}</div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="flex flex-col h-full">
                                            <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-white/[0.02]">
                                                <button
                                                    onClick={() => {
                                                        setShowDiff(false);
                                                        setSelectedCommit(null);
                                                    }}
                                                    className="text-xs text-gray-500 hover:text-white flex items-center gap-1"
                                                >
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                                    </svg>
                                                    {t.common.back}
                                                </button>
                                                <span className="text-xs font-mono text-gray-500">{t.docker.manage_section.diff}: {selectedCommit}</span>
                                            </div>
                                            <div className="overflow-hidden max-h-[300px] rounded-lg border border-white/5 bg-black/30 backdrop-blur-sm">
                                                <DiffViewer content={diffContent || ''} className="max-h-[300px]" />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 rounded-3xl border border-white/5 bg-white/5 p-12 text-center backdrop-blur-xl flex flex-col items-center justify-center border-dashed">
                        <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-center mb-4 text-gray-500">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                        </div>
                        <h3 className="text-white/90 font-bold text-lg mb-2">Unified Docker Management</h3>
                        <p className="text-gray-500 text-xs max-w-sm font-medium leading-relaxed">
                            Select a service above to manage its configurations, or create a new one to get started with Git-versioned DockerOps.
                        </p>
                    </div>
                )}
            </div>

            {/* Delete Confirmation Dialog */}
            <ConfirmDialog
                isOpen={deleteConfirm.isOpen}
                onClose={() => setDeleteConfirm({ isOpen: false, serviceName: null })}
                onConfirm={handleDeleteService}
                title="删除 Docker 服务"
                message={`确定要删除服务 "${deleteConfirm.serviceName}" 吗？\n\n此操作将：\n• 停止并删除该服务的所有容器\n• 删除服务配置文件和目录\n• 提交删除操作到 Git（如果已配置同步）\n\n此操作不可撤销。`}
                confirmText="删除"
                cancelText="取消"
                variant="danger"
                isLoading={isDeleting}
            />
        </EnvironmentGuard >
    );
}

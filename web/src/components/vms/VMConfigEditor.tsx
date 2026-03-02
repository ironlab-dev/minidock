"use client";

import { useState, useEffect, useCallback, memo, useRef } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { Button } from '@/components/ui/Button';
import { Monitor, Cpu, Network, Share2, Disc, Info, Plus, Trash2, ChevronUp, ChevronDown, GripVertical, Settings, Check, Layers, Usb, Camera, RotateCcw, X, Keyboard, MousePointer2, LucideIcon, Terminal, Volume2, Minimize2 } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion, AnimatePresence } from 'framer-motion';
import { client } from '@/api/client';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/hooks/useToast';
import { useConfirm } from '@/hooks/useConfirm';
import { generateUUID } from '@/lib/uuid';
import { checkRsyncAvailability, uploadWithRsync } from '@/api/rsyncClient';

interface NetworkConfig {
    NetworkMode: string;
    BridgeInterface?: string;
    HardwareAddress?: string;
}

interface SerialConfig {
    Mode: string;
    Target?: string;
    Address?: string;
    Port?: number;
    Telnet?: boolean;
    WaitForConnection?: boolean;
    TerminalStyle?: {
        Theme?: string;
        FontSize?: number;
        TextColor?: string;
        BackgroundColor?: string;
        FontFamily?: string;
        BlinkCursor?: boolean;
    };
}

interface SoundConfig {
    Hardware: string;
    AudioInput?: boolean;
}

interface VMConfig {
    Information: {
        Name: string;
        UUID: string;
    };
    System: {
        Architecture: string;
        MemorySize: number;
        CPUCount?: number;
        Target: string;
        UEFIBoot?: boolean;
        BootDevice?: string;
        AutoStart?: boolean;
        QEMUArguments?: string;
    };
    Network?: NetworkConfig | NetworkConfig[];
    Sharing?: {
        DirectoryShareFolders: { Path: string; Tag: string }[];
    };
    Drives?: {
        Result: { ImageName: string; Interface: string; Size?: number; IsISO?: boolean; ImagePath?: string; ReadOnly?: boolean; BootOrder?: number }[];
    };
    Display?: {
        EmulatedDisplayCard?: string;
        VGAMemoryMB?: number;
        UpscalingFilter?: string;
        DownscalingFilter?: string;
        RetinaMode?: boolean;
    };
    USBDevices?: { VendorID: string; ProductID: string; Name?: string }[];
    Serial?: SerialConfig[];
    Sound?: SoundConfig[];
    NetworkSettings?: {
        VNCBindAll?: boolean;
    };
    Backend?: string;
    ConfigurationVersion?: number;
}

interface VMConfigEditorProps {
    config: string;
    onChange: (config: string) => void;
    vmName?: string;
    readOnly?: boolean;
}



export function VMConfigEditor({ config, onChange, vmName, readOnly = false }: VMConfigEditorProps) {
    const { t } = useTranslation();
    const toast = useToast();
    const { confirm, ConfirmDialog: ConfirmDialogComponent } = useConfirm();
    const [parsedConfig, setParsedConfig] = useState<VMConfig | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<string>('information');
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    // Disk Management States
    const [showAddDiskDialog, setShowAddDiskDialog] = useState(false);
    const [showResizeDialog, setShowResizeDialog] = useState<string | null>(null);
    const [newDiskName, setNewDiskName] = useState('');
    const [newDiskSize, setNewDiskSize] = useState(20);
    const [newDiskInterface, setNewDiskInterface] = useState('virtio');
    const [resizeValue, setResizeValue] = useState(0);
    const [isUploading, setIsUploading] = useState(false);
    const [diskImportMode, setDiskImportMode] = useState<'create' | 'import'>('create');
    const [availableDisks, setAvailableDisks] = useState<Array<{name: string, sizeGB: number, sizeBytes: number}>>([]);
    const [isLoadingDisks, setIsLoadingDisks] = useState(false);
    const [selectedDiskName, setSelectedDiskName] = useState<string>('');

    // 拖拽传感器配置（必须在组件顶层）
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    // Parse Plist XML (Simplified version for our specific structure)
    useEffect(() => {
        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(config, 'text/xml');

            const parseDict = (dictEl: Element): Record<string, unknown> & { [key: string]: unknown } => {
                const obj: Record<string, unknown> = {};
                const children = Array.from(dictEl.children);
                for (let i = 0; i < children.length; i += 2) {
                    const key = children[i]?.textContent;
                    const valEl = children[i + 1];
                    if (key && valEl) {
                        if (valEl.tagName === 'dict') {
                            obj[key] = parseDict(valEl);
                        } else if (valEl.tagName === 'array') {
                            obj[key] = Array.from(valEl.children).map(child => {
                                if (child.tagName === 'dict') {
                                    // 递归解析字典，确保能正确解析嵌套的键值对
                                    return parseDict(child);
                                }
                                if (child.tagName === 'integer') return parseInt(child.textContent || '0');
                                if (child.tagName === 'string') return child.textContent || '';
                                if (child.tagName === 'true') return true;
                                if (child.tagName === 'false') return false;
                                return child.textContent;
                            });
                        } else if (valEl.tagName === 'integer') {
                            obj[key] = parseInt(valEl.textContent || '0');
                        } else if (valEl.tagName === 'true') {
                            obj[key] = true;
                        } else if (valEl.tagName === 'false') {
                            obj[key] = false;
                        } else {
                            obj[key] = valEl.textContent;
                        }
                    }
                }
                return obj;
            };

            const plistRoot = xmlDoc.querySelector('plist > dict');
            if (!plistRoot) {
                setError(t.vms.config_editor.common.invalid_plist);
                return;
            }

            // PlistData is parsed XML structure with dynamic keys; cast for ergonomic access
            const data = parseDict(plistRoot) as Record<string, unknown> & Record<string, { [key: string]: unknown }>;

            // Normalize Network to array
            // 支持 UTM 格式（Mode, MacAddress）和 MiniDock 格式（NetworkMode, HardwareAddress）
            let normalizedNetwork: NetworkConfig[] = [];
            if (Array.isArray(data.Network)) {
                normalizedNetwork = (data.Network as Array<Record<string, unknown>>).map((net: Record<string, unknown>): NetworkConfig => {
                    // 转换 UTM 格式到 MiniDock 格式
                    if (net.Mode) {
                        return {
                            NetworkMode: net.Mode === 'Bridged' ? 'bridge' : (net.Mode === 'Shared' ? 'user' : 'user'),
                            BridgeInterface: net.BridgeInterface as string | undefined,
                            HardwareAddress: (net.MacAddress || net.HardwareAddress) as string | undefined
                        };
                    }
                    // 已经是 MiniDock 格式
                    return net as unknown as NetworkConfig;
                });
            } else if (data.Network) {
                const net = data.Network as Record<string, unknown>;
                // 转换 UTM 格式到 MiniDock 格式
                if (net.Mode) {
                    normalizedNetwork = [{
                        NetworkMode: net.Mode === 'Bridged' ? 'bridge' : (net.Mode === 'Shared' ? 'user' : 'user'),
                        BridgeInterface: net.BridgeInterface as string | undefined,
                        HardwareAddress: (net.MacAddress || net.HardwareAddress) as string | undefined
                    }];
                } else {
                    normalizedNetwork = [net as unknown as NetworkConfig];
                }
            } else {
                normalizedNetwork = [{ NetworkMode: 'user' }];
            }

            // Handle Drives
            // 支持 UTM 格式（Drive 数组）和 MiniDock 格式（Drives.Result）
            let drivesData: { Result: { ImageName: string; Interface: string; Size?: number; IsISO?: boolean; ImagePath?: string; ReadOnly?: boolean; BootOrder?: number }[] };
            if (Array.isArray(data.Drive)) {
                // UTM 格式：Drive 是数组
                drivesData = { Result: (data.Drive as Array<Record<string, unknown>>).map((d: Record<string, unknown>) => {
                    const isISO = d.ImageType === 'CD' || d.ImageType === 'ISO';
                    // 如果没有 ImageName，根据类型生成友好名称
                    let imageName = d.ImageName as string | undefined;
                    if (!imageName) {
                        if (isISO) {
                            imageName = 'ISO Image';
                        } else if (d.Identifier) {
                            // 使用 Identifier 作为后备，但去掉 .qcow2 后缀（如果有）
                            imageName = (d.Identifier as string).replace(/\.qcow2$/i, '');
                        } else {
                            imageName = 'Unknown Drive';
                        }
                    }
                    return {
                        ImageName: imageName as string,
                        Interface: (d.Interface as string) || 'virtio',
                        Size: d.Size as number | undefined,
                        IsISO: isISO,
                        ImagePath: d.ImagePath as string | undefined,
                        ReadOnly: (d.ReadOnly as boolean) || false,
                        BootOrder: d.BootOrder as number | undefined
                    };
                }) };
            } else if (Array.isArray(data.Drives)) {
                drivesData = { Result: data.Drives as { ImageName: string; Interface: string }[] };
            } else if (data.Drives && typeof data.Drives === 'object' && Array.isArray((data.Drives as Record<string, unknown>).Result)) {
                drivesData = data.Drives as { Result: { ImageName: string; Interface: string; Size?: number; IsISO?: boolean; ImagePath?: string; ReadOnly?: boolean; BootOrder?: number }[] };
            } else {
                drivesData = { Result: [] };
            }

            // Normalize Serial
            let normalizedSerial: SerialConfig[] = [];
            if (Array.isArray(data.Serial)) {
                normalizedSerial = data.Serial;
            } else if (data.Serial) {
                normalizedSerial = [data.Serial as unknown as SerialConfig];
            }

            // Normalize Sound
            let normalizedSound: SoundConfig[] = [];
            if (Array.isArray(data.Sound)) {
                normalizedSound = data.Sound;
            } else if (data.Sound) {
                normalizedSound = [data.Sound as unknown as SoundConfig];
            }

            setParsedConfig({
                Information: (data.Information as { Name: string; UUID: string } | undefined) || { Name: '', UUID: '' },
                System: (data.System as { Architecture: string; MemorySize: number; Target: string } | undefined) || { Architecture: 'aarch64', MemorySize: 2048, Target: 'virt' },
                Network: normalizedNetwork,
                Sharing: (() => {
                    // 支持 UTM 格式和 MiniDock 格式
                    if (data.Sharing) {
                        // UTM 格式没有 DirectoryShareFolders，只有 DirectoryShareMode 等
                        if ((data.Sharing as Record<string, unknown>).DirectoryShareFolders) {
                            // MiniDock 格式
                            return data.Sharing as { DirectoryShareFolders: { Path: string; Tag: string }[] };
                        } else {
                            // UTM 格式：转换为 MiniDock 格式
                            return { DirectoryShareFolders: [] };
                        }
                    }
                    return { DirectoryShareFolders: [] };
                })(),
                Drives: drivesData,
                Display: (data.Display as Record<string, unknown> | undefined) || { EmulatedDisplayCard: ((data.System as Record<string, unknown> | undefined)?.Architecture as string | undefined) === 'aarch64' ? 'virtio-ramfb' : 'virtio-vga', VGAMemoryMB: 16, UpscalingFilter: 'Linear', DownscalingFilter: 'Linear', RetinaMode: false },
                USBDevices: (data.USBDevices as unknown as { VendorID: string; ProductID: string; Name?: string }[] | undefined) || [],
                Serial: normalizedSerial,
                Sound: normalizedSound,
                NetworkSettings: { VNCBindAll: ((data.NetworkSettings as Record<string, unknown> | undefined)?.VNCBindAll as boolean | undefined) || false },
                Backend: data.Backend as unknown as string | undefined,
                ConfigurationVersion: data.ConfigurationVersion as unknown as number | undefined
            });
            setError(null);
        } catch {
            setError(t.vms.config_editor.common.parse_failed);
            console.error("Failed to parse config");
        }
    }, [config, t.vms.config_editor.common.invalid_plist, t.vms.config_editor.common.parse_failed]);

    const updateConfig = (updates: Partial<VMConfig> | ((prev: VMConfig) => VMConfig)) => {
        if (!parsedConfig || readOnly) return;
        const updated = typeof updates === 'function' ? updates(parsedConfig) : { ...parsedConfig, ...updates };

        // Defensive: Ensure System values are numbers to prevent string concatenation
        if (updated.System) {
            updated.System.MemorySize = typeof updated.System.MemorySize === 'string' ? parseInt(updated.System.MemorySize) : updated.System.MemorySize;
            if (isNaN(updated.System.MemorySize)) updated.System.MemorySize = 2048;

            if (updated.System.CPUCount !== undefined) {
                updated.System.CPUCount = typeof updated.System.CPUCount === 'string' ? parseInt(updated.System.CPUCount) : updated.System.CPUCount;
                if (isNaN(updated.System.CPUCount)) updated.System.CPUCount = 2;
            }
        }

        setParsedConfig(updated);
        onChange(generateXML(updated));
    };

    const generateXML = (cfg: VMConfig): string => {
        const toPlistVal = (val: unknown): string => {
            if (val === undefined || val === null) {
                return ''; // 跳过 undefined 和 null 值
            }
            if (typeof val === 'string') return `<string>${val.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</string>`;
            if (typeof val === 'number') return `<integer>${val}</integer>`;
            if (typeof val === 'boolean') return val ? '<true/>' : '<false/>';
            if (Array.isArray(val)) {
                return `<array>${val.map(toPlistVal).join('')}</array>`;
            }
            if (typeof val === 'object' && val !== null) {
                // 过滤掉 undefined 和 null 值，避免生成无效的 plist
                const entries = Object.entries(val as Record<string, unknown>)
                    .filter(([, v]) => v !== undefined && v !== null)
                    .map(([k, v]) => `<key>${k}</key>${toPlistVal(v)}`)
                    .join('');
                return `<dict>${entries}</dict>`;
            }
            return '';
        };

        const drivesArray = cfg.Drives?.Result || [];

        return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Backend</key>
    <string>${cfg.Backend || 'QEMU'}</string>
    <key>ConfigurationVersion</key>
    <integer>${cfg.ConfigurationVersion || 4}</integer>
    <key>Information</key>
    ${toPlistVal(cfg.Information)}
    <key>System</key>
    ${toPlistVal(cfg.System)}
    <key>Network</key>
    ${toPlistVal(cfg.Network)}
    <key>Sharing</key>
    ${toPlistVal(cfg.Sharing)}
    <key>Drives</key>
    ${toPlistVal(drivesArray)}
    <key>Display</key>
    ${toPlistVal(cfg.Display || {})}
    <key>USBDevices</key>
    ${toPlistVal(cfg.USBDevices || [])}
    <key>Serial</key>
    ${toPlistVal(cfg.Serial || [])}
    <key>Sound</key>
    ${toPlistVal(cfg.Sound || [])}
    <key>NetworkSettings</key>
    <dict>
        <key>VNCBindAll</key>
        ${cfg.NetworkSettings?.VNCBindAll ? '<true/>' : '<false/>'}
    </dict>
</dict>
</plist>`;
    };

    // Shared sub-components and logic from original
    const [interfaces, setInterfaces] = useState<{ device: string, name: string, address?: string, ipAddress?: string, isActive: boolean }[]>([]);
    const [isLoadingInterfaces, setIsLoadingInterfaces] = useState(false);

    const fetchInterfaces = useCallback(async () => {
        setIsLoadingInterfaces(true);
        try {
            const data = await client.get('/system/interfaces') as { device: string, name: string, address?: string, ipAddress?: string, isActive: boolean }[];

            // 排序：active 的接口在顶部，已选中的接口也在前面
            // 注意：这里需要知道当前选中的接口，但 fetchInterfaces 是独立的
            // 排序将在渲染时根据当前选中的接口进行
            setInterfaces(data);
        } catch {
            console.error("Failed to fetch interfaces");
        } finally {
            setIsLoadingInterfaces(false);
        }
    }, []);

    const [hostUSBDevices, setHostUSBDevices] = useState<{ name: string, vendorID: string, productID: string, manufacturer?: string }[]>([]);
    const [isLoadingUSB, setIsLoadingUSB] = useState(false);

    const fetchUSBDevices = useCallback(async () => {
        setIsLoadingUSB(true);
        try {
            const data = await client.get('/system/usb-devices') as { name: string, vendorID: string, productID: string, manufacturer?: string }[];
            setHostUSBDevices(data);
        } catch {
            console.error("Failed to fetch USB devices");
        } finally {
            setIsLoadingUSB(false);
        }
    }, []);

    const [availableIsos, setAvailableIsos] = useState<string[]>([]);
    const [isLoadingIsos, setIsLoadingIsos] = useState(false);
    const [showIsoDialog, setShowIsoDialog] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const uploadInProgressRef = useRef<boolean>(false);
    const [deleteIsoConfirm, setDeleteIsoConfirm] = useState<{ isOpen: boolean; isoPath: string | null }>({ isOpen: false, isoPath: null });
    const [isDeletingIso, setIsDeletingIso] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<{ 
        loaded: number; 
        total: number; 
        percent: number; 
        startTime: number;
        stage: 'uploading' | 'processing';
    } | null>(null);

    const handleUploadIso = async (file: File) => {
        // 防止重复调用
        if (uploadInProgressRef.current || isUploading) {
            return;
        }
        
        uploadInProgressRef.current = true;
        
        if (!file.name.toLowerCase().endsWith('.iso')) {
            uploadInProgressRef.current = false;
            toast.warning('请选择 .iso 文件');
            return;
        }

        // 确保 ISO 列表已加载（如果为空，先加载一次）
        if (availableIsos.length === 0) {
            await fetchIsos();
        }

        // 检查文件是否已存在
        const fileName = file.name;
        const existingIso = availableIsos.find(iso => {
            const isoFileName = iso.split('/').pop() || iso;
            return isoFileName === fileName;
        });

        if (existingIso) {
            const confirmMessage = (t.vms.config_editor.drives as Record<string, string>).overwrite_iso_confirm?.replace('{name}', fileName) 
                || `ISO 文件 "${fileName}" 已存在。\n\n是否要覆盖现有文件？\n\n此操作将永久删除现有文件并替换为新文件。`;
            
            const confirmed = await confirm({
                title: '确认覆盖',
                message: confirmMessage,
                variant: 'warning',
            });
            
            if (!confirmed) {
                uploadInProgressRef.current = false;
                return; // 用户取消，不执行上传
            }
        }

        setIsUploading(true);
        const startTime = Date.now();
        const uploadId = generateUUID();
        setUploadProgress({ loaded: 0, total: file.size, percent: 0, startTime, stage: 'uploading' });

        // 检测 rsync 可用性
        let useRsync = false;
        try {
            useRsync = await checkRsyncAvailability();
        } catch (err) {
            console.warn('[VMConfigEditor] Failed to check rsync availability, falling back to HTTP upload:', err);
            useRsync = false;
        }

        try {
            // 如果 rsync 可用，使用 rsync 上传；否则使用 HTTP 上传
            if (useRsync) {
                await handleRsyncUpload(file, uploadId, startTime);
            } else {
                await handleHttpUpload(file, uploadId, startTime);
            }
        } finally {
            uploadInProgressRef.current = false;
        }
    };

    const handleRsyncUpload = async (file: File, uploadId: string, startTime: number) => {
        const formData = new FormData();
        formData.append('file', file);

        // 监听 WebSocket 进度事件
        let wsProgressHandler: ((event: CustomEvent) => void) | null = null;

        try {
            // 设置 WebSocket 进度监听
            wsProgressHandler = (event: CustomEvent) => {
                try {
                    const data = JSON.parse(event.detail);
                    if (data.uploadId === uploadId) {
                        // 根据阶段更新进度
                        if (data.stage === 'error') {
                            setIsUploading(false);
                            setUploadProgress(null);
                            return;
                        } else if (data.stage === 'uploading' || data.stage === 'processing') {
                            setUploadProgress({ 
                                loaded: data.loaded || 0, 
                                total: data.total || file.size, 
                                percent: data.percent || 0, 
                                startTime, 
                                stage: data.stage === 'processing' ? 'processing' : 'uploading'
                            });
                        } else if (data.stage === 'completed') {
                            setUploadProgress({ 
                                loaded: file.size, 
                                total: file.size, 
                                percent: 100, 
                                startTime, 
                                stage: 'processing' 
                            });
                        }
                    }
                } catch (e) {
                    console.error('Failed to parse WebSocket progress:', e);
                }
            };
            
            window.addEventListener('minidock:iso_upload_progress', wsProgressHandler as EventListener);
            
            // 使用 rsync 上传
            await uploadWithRsync({
                file,
                uploadId,
                onProgress: (progress) => {
                    setUploadProgress({
                        loaded: progress.loaded,
                        total: progress.total,
                        percent: progress.percent,
                        startTime,
                        stage: progress.stage === 'processing' ? 'processing' : 'uploading'
                    });
                }
            });
            
            await fetchIsos();
            setIsUploading(false);
            setUploadProgress(null);
            toast.success(t.vms.config_editor.drives.upload_success);
        } catch (err) {
            console.error('Rsync upload failed:', err);
            setIsUploading(false);
            setUploadProgress(null);
            const errorMessage = (err as Error)?.message || t.vms.config_editor.drives.upload_failed;
            toast.error(errorMessage);
        } finally {
            if (wsProgressHandler) {
                window.removeEventListener('minidock:iso_upload_progress', wsProgressHandler as EventListener);
            }
        }
    };

    const handleHttpUpload = async (file: File, uploadId: string, startTime: number) => {
        const formData = new FormData();
        formData.append('file', file);

        // 监听 WebSocket 进度事件
        let wsProgressHandler: ((event: CustomEvent) => void) | null = null;
        let progressInterval: NodeJS.Timeout | null = null;
        let useRealProgress = false;
        let processingStartTime: number | null = null;

        try {
            // 设置 WebSocket 进度监听
            wsProgressHandler = (event: CustomEvent) => {
                try {
                    const data = JSON.parse(event.detail);
                    if (data.uploadId === uploadId) {
                        useRealProgress = true;
                        
                        // 清除假进度定时器
                        if (progressInterval) {
                            clearInterval(progressInterval);
                            progressInterval = null;
                        }
                        
                        // 根据阶段更新进度
                        if (data.stage === 'error') {
                            setIsUploading(false);
                            setUploadProgress(null);
                            return;
                        } else if (data.stage === 'decoding') {
                            const decodePercent = 90 + (data.percent - 90) * 0.5;
                            setUploadProgress({ 
                                loaded: file.size, 
                                total: file.size, 
                                percent: Math.min(decodePercent, 95), 
                                startTime, 
                                stage: 'processing' 
                            });
                        } else if (data.stage === 'writing') {
                            const writePercent = 95 + (data.percent - 95) * 0.2;
                            setUploadProgress({ 
                                loaded: file.size, 
                                total: file.size, 
                                percent: Math.min(writePercent, 99), 
                                startTime, 
                                stage: 'processing' 
                            });
                            
                            if (data.percent >= 100) {
                                setUploadProgress({ 
                                    loaded: file.size, 
                                    total: file.size, 
                                    percent: 100, 
                                    startTime, 
                                    stage: 'processing' 
                                });
                            }
                        }
                    }
                } catch (e) {
                    console.error('Failed to parse WebSocket progress:', e);
                }
            };
            
            window.addEventListener('minidock:iso_upload_progress', wsProgressHandler as EventListener);
            
            // 使用 HTTP 上传（备用方案）
            await client.uploadWithProgress(
                '/vms/services/isos/upload',
                formData,
                (loaded, total, percent) => {
                    if (useRealProgress) {
                        return;
                    }
                    
                    if (percent >= 95) {
                        if (!processingStartTime) {
                            processingStartTime = Date.now();
                            setUploadProgress({ loaded, total, percent: 90, startTime, stage: 'processing' });
                            
                            let currentProgress = 90;
                            const fileSizeMB = total / (1024 * 1024);
                            const baseDuration = fileSizeMB < 100 ? 3 : fileSizeMB < 500 ? 6 : 12;
                            const duration = baseDuration + Math.random() * 2;
                            
                            progressInterval = setInterval(() => {
                                if (useRealProgress) {
                                    if (progressInterval) {
                                        clearInterval(progressInterval);
                                        progressInterval = null;
                                    }
                                    return;
                                }
                                
                                if (processingStartTime) {
                                    const elapsed = (Date.now() - processingStartTime) / 1000;
                                    
                                    if (elapsed < duration) {
                                        const progressRatio = elapsed / duration;
                                        const easedRatio = progressRatio < 0.5 
                                            ? 2 * progressRatio * progressRatio 
                                            : 1 - Math.pow(-2 * progressRatio + 2, 2) / 2;
                                        currentProgress = 90 + easedRatio * 9;
                                        
                                        setUploadProgress({ 
                                            loaded, 
                                            total, 
                                            percent: Math.min(currentProgress, 99), 
                                            startTime, 
                                            stage: 'processing' 
                                        });
                                    } else {
                                        if (currentProgress < 99) {
                                            currentProgress = 99;
                                            setUploadProgress({ 
                                                loaded, 
                                                total, 
                                                percent: 99, 
                                                startTime, 
                                                stage: 'processing' 
                                            });
                                        }
                                    }
                                }
                            }, 50);
                        }
                    } else {
                        const scaledPercent = (percent / 95) * 90;
                        setUploadProgress({ loaded, total, percent: scaledPercent, startTime, stage: 'uploading' });
                    }
                },
                { 'X-Upload-ID': uploadId }
            );
            
            await new Promise(resolve => setTimeout(resolve, 500));
            
            if (!useRealProgress && processingStartTime) {
                setUploadProgress({ loaded: file.size, total: file.size, percent: 100, startTime, stage: 'processing' });
            }
            
            if (progressInterval) {
                clearInterval(progressInterval);
                progressInterval = null;
            }
            
            await fetchIsos();
            setIsUploading(false);
            setUploadProgress(null);
            toast.success(t.vms.config_editor.drives.upload_success);
        } catch (err) {
            if (progressInterval) {
                clearInterval(progressInterval);
                progressInterval = null;
            }
            console.error('ISO upload failed:', err);
            setIsUploading(false);
            setUploadProgress(null);
            const errorMessage = (err as Error)?.message || t.vms.config_editor.drives.upload_failed;
            toast.error(errorMessage);
        } finally {
            if (wsProgressHandler) {
                window.removeEventListener('minidock:iso_upload_progress', wsProgressHandler as EventListener);
            }
        }
    };

    const fetchUnusedDisks = useCallback(async () => {
        if (!vmName) return;
        setIsLoadingDisks(true);
        try {
            const data = await client.get(`/vms/services/${vmName}/drives/unused`) as Array<{name: string, sizeGB: number, sizeBytes: number}>;
            setAvailableDisks(data || []);
        } catch (err) {
            console.error("Failed to fetch unused disks:", err);
            setAvailableDisks([]);
        } finally {
            setIsLoadingDisks(false);
        }
    }, [vmName, client]);

    const handleAddDisk = async () => {
        if (!vmName) return;
        
        if (diskImportMode === 'import') {
            // 导入模式
            if (!selectedDiskName) {
                toast.warning((t.vms.config_editor.drives as Record<string, string>).select_disk || '请选择要导入的磁盘');
                return;
            }
            
            try {
                await client.post(`/vms/services/${vmName}/drives/add`, {
                    diskName: selectedDiskName,
                    sizeGB: 0, // 导入模式下会被忽略，使用实际大小
                    interface: newDiskInterface,
                    importExisting: true
                });
                
                // 获取导入的磁盘信息以更新 UI
                const importedDisk = availableDisks.find(d => d.name === selectedDiskName);
                const diskSize = importedDisk?.sizeBytes || 0;
                
                setShowAddDiskDialog(false);
                setSelectedDiskName('');
                setDiskImportMode('create');
                
                updateConfig(prev => {
                    const existingDrives = prev.Drives?.Result || [];
                    const maxBootOrder = Math.max(
                        ...existingDrives
                            .map(d => d.BootOrder)
                            .filter((order): order is number => order !== undefined && order !== null && order > 0),
                        0
                    );
                    const newBootOrder = maxBootOrder + 1;
                    
                    return {
                        ...prev,
                        Drives: {
                            Result: [
                                ...existingDrives,
                                {
                                    ImageName: selectedDiskName,
                                    Interface: newDiskInterface,
                                    Size: diskSize,
                                    IsISO: false,
                                    BootOrder: newBootOrder
                                }
                            ]
                        }
                    };
                });
            } catch {
                toast.error(t.vms.config_editor.common.save_failed);
            }
        } else {
            // 创建模式
            if (!newDiskName) return;
            const finalName = newDiskName.endsWith('.qcow2') ? newDiskName : `${newDiskName}.qcow2`;
            try {
                await client.post(`/vms/services/${vmName}/drives/add`, {
                    diskName: finalName,
                    sizeGB: newDiskSize,
                    interface: newDiskInterface,
                    importExisting: false
                });
                setShowAddDiskDialog(false);
                setNewDiskName('');
                updateConfig(prev => {
                    const existingDrives = prev.Drives?.Result || [];
                    const maxBootOrder = Math.max(
                        ...existingDrives
                            .map(d => d.BootOrder)
                            .filter((order): order is number => order !== undefined && order !== null && order > 0),
                        0
                    );
                    const newBootOrder = maxBootOrder + 1;
                    
                    return {
                        ...prev,
                        Drives: {
                            Result: [
                                ...existingDrives,
                                {
                                    ImageName: finalName,
                                    Interface: newDiskInterface,
                                    Size: newDiskSize * 1024 * 1024 * 1024,
                                    IsISO: false,
                                    BootOrder: newBootOrder
                                }
                            ]
                        }
                    };
                });
            } catch {
                toast.error(t.vms.config_editor.common.save_failed);
            }
        }
    };

    const handleResizeDisk = async (driveName: string) => {
        if (!vmName) return;
        try {
            await client.post(`/vms/services/${vmName}/drives/${driveName}/resize`, { newSizeGB: resizeValue });
            setShowResizeDialog(null);
            updateConfig(prev => {
                const res = [...(prev.Drives?.Result || [])];
                const idx = res.findIndex(d => d.ImageName === driveName);
                if (idx !== -1) {
                    res[idx] = { ...res[idx], Size: resizeValue * 1024 * 1024 * 1024 };
                }
                return { ...prev, Drives: { Result: res } };
            });
        } catch {
            toast.error(t.vms.config_editor.common.save_failed);
        }
    };

    const handleCompressDisk = async (driveName: string) => {
        if (!vmName) return;
        const compressConfirmed = await confirm({
            title: '确认压缩',
            message: t.vms.config_editor.drives.compress_confirm.replace('{name}', driveName),
            variant: 'warning',
        });
        if (!compressConfirmed) return;
        try {
            await client.post(`/vms/services/${vmName}/drives/${driveName}/compress`, {});
            toast.success(t.vms.config_editor.drives.upload_success);
        } catch {
            toast.error(t.vms.config_editor.common.save_failed);
        }
    };

    const handleDeleteDiskFile = async (driveName: string) => {
        if (!vmName || !parsedConfig) return;
        
        // 查找对应的驱动器以判断是否为 ISO 文件
        const drive = parsedConfig.Drives?.Result.find(d => d.ImageName === driveName);
        const isISO = drive?.IsISO === true;
        
        // 根据驱动器类型使用不同的提示文案
        const confirmMessage = isISO 
            ? ((t.vms.config_editor.drives as Record<string, string>).delete_iso_confirm?.replace('{name}', driveName) || `确定要从配置中移除 ISO 文件 "${driveName}" 吗？\n\n此操作将从虚拟机配置中移除该 ISO 文件，但 ISO 文件本身不会被删除，您之后仍可通过"添加 ISO"重新添加。`)
            : (t.vms.config_editor.drives.delete_confirm.replace('{name}', driveName));
        
        const deleteConfirmed = await confirm({
            title: '确认删除',
            message: confirmMessage,
            variant: 'danger',
        });
        if (!deleteConfirmed) return;
        
        try {
            await client.delete(`/vms/services/${vmName}/drives/${driveName}`);
            updateConfig(prev => ({
                ...prev,
                Drives: { Result: prev.Drives?.Result.filter(d => d.ImageName !== driveName) || [] }
            }));
        } catch {
            toast.error(t.vms.config_editor.common.save_failed);
        }
    };

    const fetchIsos = useCallback(async () => {
        setIsLoadingIsos(true);
        try {
            const data = await client.get('/vms/services/isos') as string[];
            setAvailableIsos(data);
        } catch {
            console.error("Failed to fetch ISOs");
        } finally {
            setIsLoadingIsos(false);
        }
    }, []);

    // 判断是否为上传的 ISO（存储在 ISOs 目录中）
    const isUploadedISO = useCallback((isoPath: string): boolean => {
        return isoPath.includes('/ISOs/') || isoPath.endsWith('/ISOs');
    }, []);

    // 处理删除 ISO 文件
    const handleDeleteIsoFile = async () => {
        if (!deleteIsoConfirm.isoPath) return;
        
        setIsDeletingIso(true);
        try {
            // 从路径中提取文件名
            const fileName = deleteIsoConfirm.isoPath.split('/').pop() || '';
            await client.delete(`/vms/services/isos/${encodeURIComponent(fileName)}`);
            
            // 刷新 ISO 列表
            await fetchIsos();
            
            // 关闭确认对话框
            setDeleteIsoConfirm({ isOpen: false, isoPath: null });
            
            // 显示成功提示
            toast.success(t.vms.config_editor.drives.delete_iso_file_success);
        } catch (err) {
            console.error("Failed to delete ISO:", err);
            toast.error(t.vms.config_editor.drives.delete_iso_file_failed);
        } finally {
            setIsDeletingIso(false);
        }
    };

    const [snapshots, setSnapshots] = useState<{ id: string, name: string, 'date-sec': number, 'vm-state-size': number }[]>([]);
    const [isLoadingSnapshots, setIsLoadingSnapshots] = useState(false);

    const fetchSnapshots = useCallback(async () => {
        if (!vmName) return;
        setIsLoadingSnapshots(true);
        try {
            const data = await client.get(`/vms/services/${vmName}/snapshots`) as { id: string, name: string, 'date-sec': number, 'vm-state-size': number }[];
            setSnapshots(data || []);
        } catch {
            console.error("Failed to fetch snapshots");
        } finally {
            setIsLoadingSnapshots(false);
        }
    }, [vmName]);

    const handleCreateSnapshot = async () => {
        if (!vmName) return;
        const name = prompt(t.vms.config_editor.snapshots.enter_name);
        if (!name) return;
        try {
            await client.post(`/vms/services/${vmName}/snapshots`, { name });
            fetchSnapshots();
        } catch {
            toast.error(t.vms.config_editor.snapshots.create_failed);
        }
    };

    const handleRevertSnapshot = async (snapName: string) => {
        if (!vmName) return;
        const revertConfirmed = await confirm({
            title: '确认恢复',
            message: t.vms.config_editor.snapshots.revert_confirm.replace('{name}', snapName),
            variant: 'warning',
        });
        if (!revertConfirmed) return;
        try {
            await client.post(`/vms/services/${vmName}/snapshots/${snapName}/revert`, {});
            toast.success(t.vms.config_editor.snapshots.revert_success);
        } catch {
            toast.error(t.vms.config_editor.snapshots.revert_failed);
        }
    };

    const handleDeleteSnapshot = async (snapName: string) => {
        if (!vmName) return;
        const deleteConfirmed = await confirm({
            title: '确认删除',
            message: t.vms.config_editor.snapshots.delete_confirm.replace('{name}', snapName),
            variant: 'danger',
        });
        if (!deleteConfirmed) return;
        try {
            await client.delete(`/vms/services/${vmName}/snapshots/${snapName}`);
            fetchSnapshots();
        } catch {
            toast.error(t.vms.config_editor.snapshots.delete_failed);
        }
    };

    const networks = Array.isArray(parsedConfig?.Network) ? parsedConfig.Network : [parsedConfig?.Network || { NetworkMode: 'user' }];

    useEffect(() => {
        if (activeTab === 'usb') fetchUSBDevices();
        if (activeTab === 'snapshots') fetchSnapshots();
        if (activeTab === 'drives' && showIsoDialog) fetchIsos();
        // 只在非只读模式下且需要编辑时才获取接口列表
        if (activeTab.startsWith('network-') && !readOnly && parsedConfig) {
            const idx = parseInt(activeTab.split('-')[1]);
            const net = networks[idx];
            // 只在桥接模式且没有已配置的接口时才获取接口列表
            if (net && net.NetworkMode === 'bridge' && !net.BridgeInterface) {
                fetchInterfaces();
            }
        }
    }, [activeTab, showIsoDialog, readOnly, parsedConfig, fetchUSBDevices, fetchSnapshots, fetchIsos, fetchInterfaces]);

    if (error || !parsedConfig) {
        return (
            <div className="h-full flex items-center justify-center p-8 bg-[#1c1c1e]">
                <div className="text-gray-500 text-sm uppercase tracking-widest font-bold opacity-30">
                    {error || t.vms.config_editor.common.loading_config}
                </div>
            </div>
        );
    }

    const generateRandomMAC = () => {
        const hex = '0123456789ABCDEF';
        let mac = '52:54:00';
        for (let i = 0; i < 3; i++) {
            mac += ':' + hex[Math.floor(Math.random() * 16)] + hex[Math.floor(Math.random() * 16)];
        }
        return mac;
    };


    const handleAddNetwork = () => {
        if (readOnly) return;
        updateConfig(prev => ({
            ...prev,
            Network: [...(Array.isArray(prev.Network) ? prev.Network : prev.Network ? [prev.Network] : []), { NetworkMode: 'user', HardwareAddress: generateRandomMAC() }]
        }));
        setIsMenuOpen(false);
        const nextIdx = networks.length;
        setActiveTab(`network-${nextIdx}`);
    };

    const serials = parsedConfig.Serial || [];
    const sounds = parsedConfig.Sound || [];

    const handleAddSerial = () => {
        updateConfig(prev => ({
            ...prev,
            Serial: [...(prev.Serial || []), { Mode: 'builtin', Target: 'native', TerminalStyle: { Theme: 'Default', FontSize: 12, BlinkCursor: true } }]
        }));
        setIsMenuOpen(false);
        setActiveTab(`serial-${serials.length}`);
    };

    const handleAddSound = () => {
        updateConfig(prev => ({
            ...prev,
            Sound: [...(prev.Sound || []), { Hardware: 'intel-hda' }]
        }));
        setIsMenuOpen(false);
        setActiveTab(`sound-${sounds.length}`);
    };

    const handleAddDisplay = () => {
        if (parsedConfig.Display && Object.keys(parsedConfig.Display).length > 0) return;
        updateConfig(prev => ({
            ...prev,
            Display: { EmulatedDisplayCard: prev.System.Architecture === 'aarch64' ? 'virtio-ramfb' : 'virtio-vga', VGAMemoryMB: 16 }
        }));
        setIsMenuOpen(false);
        setActiveTab('display');
    };

    return (
        <div className="h-full flex bg-[#1c1c1e] text-white overflow-hidden">
            {/* Sidebar */}
            <div className="w-56 border-r border-white/5 bg-black/20 flex flex-col shrink-0 custom-scrollbar overflow-y-auto">
                <div className="p-4 space-y-6">
                    {/* Information Section */}
                    <div className="space-y-1">
                        <p className="px-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Information</p>
                        <SidebarItem
                            icon={Info}
                            label="Identification"
                            active={activeTab === 'information'}
                            onClick={() => setActiveTab('information')}
                        />
                    </div>

                    {/* Configuration Section */}
                    <div className="space-y-1">
                        <p className="px-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Configuration</p>
                        <SidebarItem
                            icon={Cpu}
                            label={t.vms.config_editor.tabs.system}
                            active={activeTab === 'system'}
                            onClick={() => setActiveTab('system')}
                        />
                        <SidebarItem
                            icon={Settings}
                            label={t.vms.config_editor.tabs.qemu || 'QEMU'}
                            active={activeTab === 'qemu'}
                            onClick={() => setActiveTab('qemu')}
                        />
                        <SidebarItem
                            icon={Keyboard}
                            label={t.vms.config_editor.tabs.input || 'Input'}
                            active={activeTab === 'input'}
                            onClick={() => setActiveTab('input')}
                        />
                        <SidebarItem
                            icon={Share2}
                            label={t.vms.config_editor.tabs.sharing}
                            active={activeTab === 'sharing'}
                            onClick={() => setActiveTab('sharing')}
                        />
                    </div>

                    {/* Devices Section */}
                    <div className="space-y-1">
                        <p className="px-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Devices</p>
                        {parsedConfig.Display && Object.keys(parsedConfig.Display).length > 0 && (
                            <SidebarItem
                                icon={Monitor}
                                label={t.vms.config_editor.tabs.display}
                                active={activeTab === 'display'}
                                onClick={() => setActiveTab('display')}
                                onDelete={readOnly ? undefined : () => {
                                    updateConfig(prev => ({ ...prev, Display: {} }));
                                    if (activeTab === 'display') setActiveTab('system');
                                }}
                            />
                        )}
                        {serials.map((_, idx) => (
                            <SidebarItem
                                key={`serial-${idx}`}
                                icon={Terminal}
                                label={`${t.vms.config_editor.tabs.serial} ${idx + 1}`}
                                active={activeTab === `serial-${idx}`}
                                onClick={() => setActiveTab(`serial-${idx}`)}
                                onDelete={readOnly ? undefined : () => {
                                    updateConfig(prev => ({
                                        ...prev,
                                        Serial: (prev.Serial || []).filter((__, i) => i !== idx)
                                    }));
                                    if (activeTab === `serial-${idx}`) setActiveTab('system');
                                }}
                            />
                        ))}
                        {networks.map((_, idx) => (
                            <SidebarItem
                                key={`network-${idx}`}
                                icon={Network}
                                label={`${t.vms.config_editor.network.network_interface} ${idx + 1}`}
                                active={activeTab === `network-${idx}`}
                                onClick={() => setActiveTab(`network-${idx}`)}
                                onDelete={!readOnly && networks.length > 1 ? () => {
                                    updateConfig(prev => ({
                                        ...prev,
                                        Network: (Array.isArray(prev.Network) ? prev.Network : [prev.Network!]).filter((__, i) => i !== idx)
                                    }));
                                    if (activeTab === `network-${idx}`) setActiveTab('system');
                                } : undefined}
                            />
                        ))}
                        {sounds.map((_, idx) => (
                            <SidebarItem
                                key={`sound-${idx}`}
                                icon={Volume2}
                                label={`${t.vms.config_editor.tabs.sound} ${idx + 1}`}
                                active={activeTab === `sound-${idx}`}
                                onClick={() => setActiveTab(`sound-${idx}`)}
                                onDelete={readOnly ? undefined : () => {
                                    updateConfig(prev => ({
                                        ...prev,
                                        Sound: (prev.Sound || []).filter((__, i) => i !== idx)
                                    }));
                                    if (activeTab === `sound-${idx}`) setActiveTab('system');
                                }}
                            />
                        ))}
                        <SidebarItem
                            icon={Disc}
                            label={t.vms.config_editor.tabs.drives}
                            active={activeTab === 'drives'}
                            onClick={() => setActiveTab('drives')}
                        />
                        <SidebarItem
                            icon={Usb}
                            label={t.vms.config_editor.tabs.usb}
                            active={activeTab === 'usb'}
                            onClick={() => setActiveTab('usb')}
                        />
                        <SidebarItem
                            icon={Camera}
                            label={t.vms.config_editor.tabs.snapshots}
                            active={activeTab === 'snapshots'}
                            onClick={() => setActiveTab('snapshots')}
                        />
                    </div>
                </div>

                <div className="mt-auto p-4 border-t border-white/5">
                    <div className="relative">
                        {!readOnly && (
                            <button
                                onClick={(e) => {
                                    setIsMenuOpen(!isMenuOpen);
                                    // 防止点击后光标闪烁
                                    setTimeout(() => {
                                        if (e.currentTarget === document.activeElement) {
                                            e.currentTarget.blur();
                                        }
                                    }, 0);
                                }}
                                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-white/5 border border-white/5 text-[10px] font-bold uppercase tracking-widest hover:bg-white/10 transition-all text-gray-400 hover:text-white"
                            >
                                <Plus size={14} /> {t.vms.config_editor.network.new_device || 'New Device...'}
                            </button>
                        )}
                        <AnimatePresence>
                            {isMenuOpen && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)} />
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                        className="absolute bottom-full left-0 w-full mb-2 bg-[#2c2c2e] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden"
                                    >
                                        {!readOnly && (
                                            <>
                                                {(!parsedConfig.Display || Object.keys(parsedConfig.Display).length === 0) && (
                                                    <button
                                                        onClick={(e) => {
                                                            handleAddDisplay();
                                                            setTimeout(() => {
                                                                if (e.currentTarget === document.activeElement) {
                                                                    e.currentTarget.blur();
                                                                }
                                                            }, 0);
                                                        }}
                                                        className="w-full px-4 py-3 flex items-center gap-3 text-xs text-left hover:bg-white/5 transition-colors border-b border-white/5"
                                                    >
                                                        <Monitor size={14} className="text-brand-purple" />
                                                        <span>{t.vms.config_editor.tabs.display}</span>
                                                    </button>
                                                )}
                                                <button
                                                    onClick={(e) => {
                                                        handleAddSerial();
                                                        setTimeout(() => {
                                                            if (e.currentTarget === document.activeElement) {
                                                                e.currentTarget.blur();
                                                            }
                                                        }, 0);
                                                    }}
                                                    className="w-full px-4 py-3 flex items-center gap-3 text-xs text-left hover:bg-white/5 transition-colors border-b border-white/5"
                                                >
                                                    <Terminal size={14} className="text-brand-purple" />
                                                    <span>{t.vms.config_editor.tabs.serial}</span>
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        handleAddNetwork();
                                                        setTimeout(() => {
                                                            if (e.currentTarget === document.activeElement) {
                                                                e.currentTarget.blur();
                                                            }
                                                        }, 0);
                                                    }}
                                                    className="w-full px-4 py-3 flex items-center gap-3 text-xs text-left hover:bg-white/5 transition-colors border-b border-white/5"
                                                >
                                                    <Network size={14} className="text-brand-purple" />
                                                    <span>{t.vms.config_editor.network.network_interface}</span>
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        handleAddSound();
                                                        setTimeout(() => {
                                                            if (e.currentTarget === document.activeElement) {
                                                                e.currentTarget.blur();
                                                            }
                                                        }, 0);
                                                    }}
                                                    className="w-full px-4 py-3 flex items-center gap-3 text-xs text-left hover:bg-white/5 transition-colors"
                                                >
                                                    <Volume2 size={14} className="text-brand-purple" />
                                                    <span>{t.vms.config_editor.tabs.sound}</span>
                                                </button>
                                            </>
                                        )}
                                    </motion.div>
                                </>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0">
                <div className="flex-1 overflow-y-auto p-8 lg:p-12 custom-scrollbar">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeTab}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.2 }}
                            className="max-w-4xl space-y-12 min-h-[500px]"
                        >
                            {/* Information Tab */}
                            {activeTab === 'information' && (
                                <section className="space-y-6">
                                    <h2 className="text-2xl font-bold flex items-center gap-3">
                                        <Info className="text-brand-purple" /> Identification
                                    </h2>
                                    <div className="grid grid-cols-1 gap-6 max-w-lg">
                                        <div className="space-y-2">
                                            <label className="text-label pl-1">{t.vms.config_editor.system.display_name}</label>
                                            <input
                                                value={parsedConfig.Information.Name}
                                                onChange={e => updateConfig(prev => ({ ...prev, Information: { ...prev.Information, Name: e.target.value } }))}
                                                disabled={readOnly}
                                                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-brand-purple/50 outline-none transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                            />
                                        </div>
                                        <div className="space-y-2 opacity-50">
                                            <label className="text-label pl-1">UUID</label>
                                            <div className="w-full bg-black/20 border border-white/5 rounded-xl px-4 py-3 text-[10px] font-mono select-all">
                                                {parsedConfig.Information.UUID}
                                            </div>
                                        </div>
                                    </div>
                                </section>
                            )}

                            {/* System Tab */}
                            {activeTab === 'system' && (
                                <section className="space-y-8">
                                    <h2 className="text-2xl font-bold flex items-center gap-3">
                                        <Cpu className="text-brand-purple" /> {t.vms.config_editor.tabs.system}
                                    </h2>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="space-y-6">
                                            <h3 className="text-section">Hardware Resources</h3>
                                            <div className="grid grid-cols-1 gap-4">
                                                <div className="space-y-2">
                                                    <label className="text-label pl-1">{t.vms.config_editor.system.architecture}</label>
                                                    <select
                                                        value={parsedConfig.System.Architecture}
                                                        onChange={e => updateConfig(prev => ({ ...prev, System: { ...prev.System, Architecture: e.target.value } }))}
                                                        disabled={readOnly}
                                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-brand-purple/50 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        <option value="aarch64">ARM64 (Apple Silicon)</option>
                                                        <option value="x86_64">Intel (x86_64)</option>
                                                    </select>
                                                </div>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-2">
                                                        <label className="text-label pl-1">{t.vms.config_editor.system.cpu_cores}</label>
                                                        <input
                                                            type="number"
                                                            value={parsedConfig.System.CPUCount}
                                                            onChange={e => updateConfig(prev => ({ ...prev, System: { ...prev.System, CPUCount: parseInt(e.target.value) || 2 } }))}
                                                            disabled={readOnly}
                                                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-brand-purple/50 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className="text-label pl-1">{t.vms.config_editor.system.memory_mb}</label>
                                                        <input
                                                            type="number"
                                                            min={128}
                                                            max={65536}
                                                            value={parsedConfig.System.MemorySize}
                                                            onChange={e => {
                                                                const val = e.target.value === '' ? '' : parseInt(e.target.value);
                                                                updateConfig(prev => ({ ...prev, System: { ...prev.System, MemorySize: val as number } }));
                                                            }}
                                                            onBlur={e => {
                                                                let val = parseInt(e.target.value);
                                                                if (isNaN(val) || val < 128) val = 128;
                                                                if (val > 65536) val = 65536;
                                                                updateConfig(prev => ({ ...prev, System: { ...prev.System, MemorySize: val } }));
                                                            }}
                                                            disabled={readOnly}
                                                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-brand-purple/50 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                                        />
                                                        <p className="text-[9px] text-gray-500 mt-1 pl-1">Range: 128MB - 64GB</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-6">
                                            <h3 className="text-section">Boot Configuration</h3>
                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5">
                                                    <div>
                                                        <p className="text-xs font-bold">{t.vms.config_editor.system.uefi_boot}</p>
                                                        <p className="text-[10px] text-gray-500">Enable modern UEFI firmware</p>
                                                    </div>
                                                    <button
                                                        onClick={() => updateConfig(prev => ({ ...prev, System: { ...prev.System, UEFIBoot: !prev.System.UEFIBoot } }))}
                                                        disabled={readOnly}
                                                        className={`w-10 h-5 rounded-full transition-all relative ${parsedConfig.System.UEFIBoot ? 'bg-brand-purple' : 'bg-white/10'} ${readOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                    >
                                                        <motion.div className="absolute top-1 left-1 w-3 h-3 rounded-full bg-white" animate={{ x: parsedConfig.System.UEFIBoot ? 20 : 0 }} />
                                                    </button>
                                                </div>
                                                <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5">
                                                    <div>
                                                        <p className="text-xs font-bold">{t.vms.config_editor.system.auto_start}</p>
                                                        <p className="text-[10px] text-gray-500">Start VM when system boots</p>
                                                    </div>
                                                    <button
                                                        onClick={() => updateConfig(prev => ({ ...prev, System: { ...prev.System, AutoStart: !prev.System.AutoStart } }))}
                                                        disabled={readOnly}
                                                        className={`w-10 h-5 rounded-full transition-all relative ${parsedConfig.System.AutoStart ? 'bg-brand-purple' : 'bg-white/10'} ${readOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                    >
                                                        <motion.div className="absolute top-1 left-1 w-3 h-3 rounded-full bg-white" animate={{ x: parsedConfig.System.AutoStart ? 20 : 0 }} />
                                                    </button>
                                                </div>
                                                <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5">
                                                    <div>
                                                        <p className="text-xs font-bold">Allow External VNC</p>
                                                        <p className="text-[10px] text-gray-500">Allow VNC connection from other devices (0.0.0.0). <br />Use this for 3rd party VNC clients (not Web VNC).</p>
                                                    </div>
                                                    <button
                                                        onClick={() => updateConfig(prev => ({
                                                            ...prev,
                                                            NetworkSettings: {
                                                                ...prev.NetworkSettings,
                                                                VNCBindAll: !prev.NetworkSettings?.VNCBindAll
                                                            }
                                                        }))}
                                                        className={`w-10 h-5 rounded-full transition-all relative ${parsedConfig.NetworkSettings?.VNCBindAll ? 'bg-brand-purple' : 'bg-white/10'}`}
                                                    >
                                                        <motion.div className="absolute top-1 left-1 w-3 h-3 rounded-full bg-white" animate={{ x: parsedConfig.NetworkSettings?.VNCBindAll ? 20 : 0 }} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </section>
                            )}

                            {/* QEMU & Params */}
                            {activeTab === 'qemu' && (
                                <section className="space-y-8">
                                    <h2 className="text-2xl font-bold flex items-center gap-3">
                                        <Settings className="text-brand-purple" /> QEMU
                                    </h2>
                                    <div className="grid grid-cols-1 gap-6 max-w-lg">
                                        <div className="space-y-2">
                                            <label className="text-label pl-1">Machine Target</label>
                                            <input
                                                value={parsedConfig.System.Target}
                                                onChange={e => updateConfig(prev => ({ ...prev, System: { ...prev.System, Target: e.target.value } }))}
                                                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-brand-purple/50 outline-none transition-all font-mono"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-label pl-1">Arguments</label>
                                            <textarea
                                                value={parsedConfig.System.QEMUArguments || ''}
                                                onChange={e => updateConfig(prev => ({ ...prev, System: { ...prev.System, QEMUArguments: e.target.value } }))}
                                                placeholder="-device ..., -accel ..."
                                                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs focus:border-brand-purple/50 outline-none transition-all font-mono min-h-[120px] resize-none"
                                            />
                                            <p className="text-[10px] text-gray-500 italic pl-1">Append custom QEMU arguments here. Use at your own risk.</p>
                                        </div>
                                    </div>
                                </section>
                            )}

                            {/* Input Tab */}
                            {activeTab === 'input' && (
                                <section className="space-y-8">
                                    <h2 className="text-2xl font-bold flex items-center gap-3">
                                        <Keyboard className="text-brand-purple" /> Input
                                    </h2>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="p-6 rounded-2xl bg-white/5 border border-white/5 flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                                                <MousePointer2 size={24} />
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold">Standard Input</p>
                                                <p className="text-xs text-gray-500">USB Keyboard & Mouse (virtio)</p>
                                            </div>
                                        </div>
                                    </div>
                                </section>
                            )}

                            {/* Network Tabs */}
                            {activeTab.startsWith('network-') && (
                                <section className="space-y-8">
                                    {(() => {
                                        const idx = parseInt(activeTab.split('-')[1]);
                                        const net = networks[idx];
                                        if (!net) return null;

                                        return (
                                            <>
                                                <div className="flex justify-between items-center">
                                                    <h2 className="text-2xl font-bold flex items-center gap-3">
                                                        <Network className="text-brand-purple" /> {`${t.vms.config_editor.network.network_interface} ${idx + 1}`}
                                                    </h2>
                                                    {networks.length > 1 && !readOnly && (
                                                        <Button
                                                            variant="danger"
                                                            size="sm"
                                                            className="h-9 px-4 text-xs"
                                                            onClick={() => {
                                                                updateConfig(prev => ({
                                                                    ...prev,
                                                                    Network: (Array.isArray(prev.Network) ? prev.Network : [prev.Network!]).filter((__, i) => i !== idx)
                                                                }));
                                                                setActiveTab('system');
                                                            }}
                                                        >
                                                            <Trash2 size={14} className="mr-2" /> {t.vms.config_editor.network.remove || 'Remove'}
                                                        </Button>
                                                    )}
                                                </div>

                                                <div className="space-y-6">
                                                    <h3 className="text-section">Network Mode</h3>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <button
                                                            onClick={() => {
                                                                const next = [...networks];
                                                                next[idx] = { ...next[idx], NetworkMode: 'user' };
                                                                updateConfig({ Network: next });
                                                            }}
                                                            disabled={readOnly}
                                                            className={`p-6 rounded-2xl border transition-all text-left ${net.NetworkMode === 'user' ? 'bg-brand-purple/10 border-brand-purple shadow-lg shadow-brand-purple/5' : 'bg-white/5 border-white/5 text-gray-500 hover:bg-white/10'} ${readOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                        >
                                                            <span className="block text-sm font-bold mb-1">{t.vms.config_editor.network.shared_user_mode}</span>
                                                            <span className="text-xs opacity-60 leading-relaxed">{t.vms.config_editor.network.shared_user_mode_desc}</span>
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                const next = [...networks];
                                                                next[idx] = { ...next[idx], NetworkMode: 'bridge' };
                                                                updateConfig({ Network: next });
                                                                if (!readOnly) {
                                                                    fetchInterfaces();
                                                                }
                                                            }}
                                                            disabled={readOnly}
                                                            className={`p-6 rounded-2xl border transition-all text-left ${net.NetworkMode === 'bridge' ? 'bg-brand-purple/10 border-brand-purple shadow-lg shadow-brand-purple/5' : 'bg-white/5 border-white/5 text-gray-500 hover:bg-white/10'} ${readOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                        >
                                                            <span className="block text-sm font-bold mb-1">{t.vms.config_editor.network.bridged_tap}</span>
                                                            <span className="text-xs opacity-60 leading-relaxed">{t.vms.config_editor.network.bridged_tap_desc}</span>
                                                        </button>
                                                    </div>

                                                    {net.NetworkMode === 'bridge' && (
                                                        <div className="space-y-4 pt-4">
                                                            <label className="text-label pl-1">{t.vms.config_editor.network.bridge_interface}</label>
                                                            {readOnly && net.BridgeInterface ? (
                                                                // 只读模式：直接显示已配置的桥接接口
                                                                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                                                                    <div className="flex items-center gap-2">
                                                                        <Network className="text-brand-purple" size={16} />
                                                                        <span className="text-sm font-mono font-bold">{net.BridgeInterface}</span>
                                                                    </div>
                                                                    <p className="text-xs text-gray-500 mt-2">已配置的桥接接口（只读）</p>
                                                                </div>
                                                            ) : (
                                                                <div className="grid grid-cols-1 gap-2 max-h-[280px] overflow-y-auto pr-2 custom-scrollbar custom-scrollbar-thin">
                                                                    {isLoadingInterfaces ? (
                                                                        <div className="h-24 flex items-center justify-center bg-white/5 rounded-2xl animate-pulse">
                                                                            <span className="text-xs text-gray-600">{t.vms.config_editor.network.discovering}</span>
                                                                        </div>
                                                                    ) : interfaces.length === 0 ? (
                                                                        <div className="h-24 flex items-center justify-center bg-white/5 rounded-2xl border border-dashed border-white/5">
                                                                            <span className="text-xs text-gray-500 italic">{t.vms.config_editor.network.no_interfaces || 'No interfaces found'}</span>
                                                                        </div>
                                                                    ) : (() => {
                                                                    // 排序：active 的接口在顶部，已选中的接口也在前面
                                                                    const sortedInterfaces = [...interfaces].sort((a, b) => {
                                                                        const aIsSelected = net.BridgeInterface === a.device;
                                                                        const bIsSelected = net.BridgeInterface === b.device;
                                                                        const aIsActive = a.isActive ?? false;
                                                                        const bIsActive = b.isActive ?? false;

                                                                        // 已选中且 active 的排最前
                                                                        if (aIsSelected && aIsActive && !(bIsSelected && bIsActive)) return -1;
                                                                        if (bIsSelected && bIsActive && !(aIsSelected && aIsActive)) return 1;

                                                                        // 已选中的排在前面
                                                                        if (aIsSelected && !bIsSelected) return -1;
                                                                        if (bIsSelected && !aIsSelected) return 1;

                                                                        // active 的排在前面
                                                                        if (aIsActive && !bIsActive) return -1;
                                                                        if (bIsActive && !aIsActive) return 1;

                                                                        return 0;
                                                                    });

                                                                    return sortedInterfaces.map((iface) => (
                                                                        <button
                                                                            key={iface.device}
                                                                            onClick={() => {
                                                                                const next = [...networks];
                                                                                next[idx] = { ...next[idx], BridgeInterface: iface.device };
                                                                                updateConfig({ Network: next });
                                                                            }}
                                                                            disabled={readOnly}
                                                                            className={`px-4 py-3 rounded-xl border text-left transition-all flex items-center justify-between group/iface ${net.BridgeInterface === iface.device ? 'bg-brand-purple/10 border-brand-purple text-white' : 'bg-white/5 border-white/5 text-gray-400 hover:bg-white/10'} ${readOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                                        >
                                                                            <div className="flex flex-col gap-0.5">
                                                                                <div className="flex items-center gap-2">
                                                                                    <span className="text-xs font-bold">{iface.name}</span>
                                                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${iface.isActive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                                                                                        {iface.isActive ? (t.vms.config_editor.network.active || 'Active') : (t.vms.config_editor.network.inactive || 'Inactive')}
                                                                                    </span>
                                                                                </div>
                                                                                <span className="text-[10px] opacity-50 font-mono">
                                                                                    {iface.device}
                                                                                    {iface.ipAddress && <span className="text-brand-purple ml-1">• {iface.ipAddress}</span>}
                                                                                    {iface.address && <span className="ml-1 opacity-70">• {iface.address}</span>}
                                                                                </span>
                                                                            </div>
                                                                            {net.BridgeInterface === iface.device && (
                                                                                <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                                                                                    <Check size={14} className="text-brand-purple" />
                                                                                </motion.div>
                                                                            )}
                                                                        </button>
                                                                    ));
                                                                    })()}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    <div className="space-y-4 pt-8 border-t border-white/5 max-w-sm">
                                                        <h3 className="text-section">Hardware</h3>
                                                        <div className="space-y-2">
                                                            <label className="text-label pl-1">{t.vms.config_editor.network.mac_address}</label>
                                                            <input
                                                                value={net.HardwareAddress || ''}
                                                                onChange={e => {
                                                                    const next = [...networks];
                                                                    next[idx] = { ...next[idx], HardwareAddress: e.target.value };
                                                                    updateConfig({ Network: next });
                                                                }}
                                                                disabled={readOnly}
                                                                placeholder={t.vms.config_editor.network.mac_address_placeholder}
                                                                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none font-mono disabled:opacity-50 disabled:cursor-not-allowed"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </>
                                        );
                                    })()}
                                </section>
                            )}

                            {/* Display Tab */}
                            {activeTab === 'display' && parsedConfig.Display && Object.keys(parsedConfig.Display).length > 0 && (
                                <section className="space-y-8">
                                    <div className="flex justify-between items-center">
                                        <h2 className="text-2xl font-bold flex items-center gap-3">
                                            <Monitor className="text-brand-purple" /> {t.vms.config_editor.tabs.display}
                                        </h2>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-red-400 hover:text-red-300 hover:bg-red-400/10 h-9 px-4 text-xs font-bold uppercase tracking-widest"
                                            onClick={() => {
                                                updateConfig(prev => ({ ...prev, Display: {} }));
                                                setActiveTab('system');
                                            }}
                                        >
                                            <Trash2 size={14} className="mr-2" /> {t.vms.config_editor.network.remove}
                                        </Button>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                        <div className="space-y-6">
                                            <h3 className="text-section">Graphics Card</h3>
                                            <div className="space-y-4">
                                                <div className="space-y-2">
                                                    <label className="text-label pl-1">{t.vms.config_editor.display.emulated_display_card}</label>
                                                    <select
                                                        value={parsedConfig.Display?.EmulatedDisplayCard}
                                                        onChange={e => updateConfig(prev => ({ ...prev, Display: { ...prev.Display, EmulatedDisplayCard: e.target.value } }))}
                                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-brand-purple/50 outline-none transition-all"
                                                    >
                                                        <optgroup label="Standard">
                                                            <option value="virtio-vga">virtio-vga</option>
                                                            <option value="virtio-gpu-pci">virtio-gpu-pci</option>
                                                            <option value="virtio-ramfb">virtio-ramfb (Recommended for ARM)</option>
                                                            <option value="VGA">VGA</option>
                                                            <option value="vmware-svga">vmware-svga</option>
                                                        </optgroup>
                                                        <optgroup label="GPU Supported">
                                                            <option value="virtio-ramfb-gl">virtio-ramfb-gl</option>
                                                            <option value="virtio-gpu-gl-pci">virtio-gpu-gl-pci</option>
                                                        </optgroup>
                                                    </select>
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-label pl-1">{t.vms.config_editor.display.vga_video_ram} (MB)</label>
                                                    <input
                                                        type="number"
                                                        value={parsedConfig.Display?.VGAMemoryMB || 16}
                                                        onChange={e => updateConfig(prev => ({ ...prev, Display: { ...prev.Display, VGAMemoryMB: parseInt(e.target.value) || 16 } }))}
                                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-brand-purple/50 outline-none transition-all"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-6">
                                            <h3 className="text-section">Filters & Mode</h3>
                                            <div className="space-y-4">
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-2">
                                                        <label className="text-label pl-1">Upscaling</label>
                                                        <select
                                                            value={parsedConfig.Display?.UpscalingFilter}
                                                            onChange={e => updateConfig(prev => ({ ...prev, Display: { ...prev.Display, UpscalingFilter: e.target.value } }))}
                                                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs outline-none"
                                                        >
                                                            <option value="Linear">Linear</option>
                                                            <option value="Nearest">Nearest</option>
                                                        </select>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className="text-label pl-1">Downscaling</label>
                                                        <select
                                                            value={parsedConfig.Display?.DownscalingFilter}
                                                            onChange={e => updateConfig(prev => ({ ...prev, Display: { ...prev.Display, DownscalingFilter: e.target.value } }))}
                                                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs outline-none"
                                                        >
                                                            <option value="Linear">Linear</option>
                                                            <option value="Nearest">Nearest</option>
                                                        </select>
                                                    </div>
                                                </div>
                                                <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5">
                                                    <div>
                                                        <p className="text-xs font-bold">Retina Mode</p>
                                                        <p className="text-[10px] text-gray-500">Enable high DPI scaling</p>
                                                    </div>
                                                    <button
                                                        onClick={() => updateConfig(prev => ({ ...prev, Display: { ...prev.Display, RetinaMode: !prev.Display?.RetinaMode } }))}
                                                        className={`w-10 h-5 rounded-full transition-all relative ${parsedConfig.Display?.RetinaMode ? 'bg-brand-purple' : 'bg-white/10'}`}
                                                    >
                                                        <motion.div className="absolute top-1 left-1 w-3 h-3 rounded-full bg-white" animate={{ x: parsedConfig.Display?.RetinaMode ? 20 : 0 }} />
                                                    </button>
                                                </div>


                                            </div>
                                        </div>
                                    </div>
                                </section>
                            )}

                            {/* Serial Tab */}
                            {serials.map((serial, idx) => (
                                activeTab === `serial-${idx}` && (
                                    <section key={`serial-tab-${idx}`} className="space-y-8">
                                        <div className="flex justify-between items-center">
                                            <h2 className="text-2xl font-bold flex items-center gap-3">
                                                <Terminal className="text-brand-purple" /> {t.vms.config_editor.tabs.serial} {idx + 1}
                                            </h2>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-red-400 hover:text-red-300 hover:bg-red-400/10 h-9 px-4 text-xs font-bold uppercase tracking-widest"
                                                onClick={() => {
                                                    updateConfig(prev => ({
                                                        ...prev,
                                                        Serial: (prev.Serial || []).filter((__, i) => i !== idx)
                                                    }));
                                                    setActiveTab('system');
                                                }}
                                            >
                                                <Trash2 size={14} className="mr-2" /> {t.vms.config_editor.network.remove}
                                            </Button>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                            <div className="space-y-6">
                                                <h3 className="text-section">{t.vms.config_editor.serial.connection}</h3>
                                                <div className="space-y-4">
                                                    <div className="space-y-2">
                                                        <label className="text-label pl-1">{t.vms.config_editor.serial.mode}</label>
                                                        <select
                                                            value={serial.Mode}
                                                            onChange={e => {
                                                                const next = [...serials];
                                                                next[idx] = { ...next[idx], Mode: e.target.value };
                                                                updateConfig({ Serial: next });
                                                            }}
                                                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none transition-all"
                                                        >
                                                            <option value="builtin">{t.vms.config_editor.serial.builtin}</option>
                                                            <option value="pty">{t.vms.config_editor.serial.pty}</option>
                                                            <option value="tcp_client">{t.vms.config_editor.serial.tcp_client}</option>
                                                            <option value="tcp_server">{t.vms.config_editor.serial.tcp_server}</option>
                                                        </select>
                                                    </div>
                                                    {(serial.Mode === 'tcp_client' || serial.Mode === 'tcp_server') && (
                                                        <div className="grid grid-cols-2 gap-4">
                                                            <div className="space-y-2">
                                                                <label className="text-label pl-1">{t.vms.config_editor.serial.address}</label>
                                                                <input
                                                                    value={serial.Address || ''}
                                                                    onChange={e => {
                                                                        const next = [...serials];
                                                                        next[idx] = { ...next[idx], Address: e.target.value };
                                                                        updateConfig({ Serial: next });
                                                                    }}
                                                                    placeholder="127.0.0.1"
                                                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none transition-all"
                                                                />
                                                            </div>
                                                            <div className="space-y-2">
                                                                <label className="text-label pl-1">{t.vms.config_editor.serial.port}</label>
                                                                <input
                                                                    type="number"
                                                                    value={serial.Port || ''}
                                                                    onChange={e => {
                                                                        const next = [...serials];
                                                                        next[idx] = { ...next[idx], Port: parseInt(e.target.value) || undefined };
                                                                        updateConfig({ Serial: next });
                                                                    }}
                                                                    placeholder="1234"
                                                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none transition-all"
                                                                />
                                                            </div>
                                                        </div>
                                                    )}
                                                    {serial.Mode === 'tcp_server' && (
                                                        <div className="grid grid-cols-2 gap-4">
                                                            <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5">
                                                                <label className="text-xs font-bold">{t.vms.config_editor.serial.telnet}</label>
                                                                <button
                                                                    onClick={() => {
                                                                        const next = [...serials];
                                                                        next[idx] = { ...next[idx], Telnet: !next[idx].Telnet };
                                                                        updateConfig({ Serial: next });
                                                                    }}
                                                                    className={`w-10 h-5 rounded-full transition-all relative ${serial.Telnet ? 'bg-brand-purple' : 'bg-white/10'}`}
                                                                >
                                                                    <motion.div className="absolute top-1 left-1 w-3 h-3 rounded-full bg-white" animate={{ x: serial.Telnet ? 20 : 0 }} />
                                                                </button>
                                                            </div>
                                                            <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5">
                                                                <label className="text-xs font-bold">{t.vms.config_editor.serial.wait}</label>
                                                                <button
                                                                    onClick={() => {
                                                                        const next = [...serials];
                                                                        next[idx] = { ...next[idx], WaitForConnection: !next[idx].WaitForConnection };
                                                                        updateConfig({ Serial: next });
                                                                    }}
                                                                    className={`w-10 h-5 rounded-full transition-all relative ${serial.WaitForConnection ? 'bg-brand-purple' : 'bg-white/10'}`}
                                                                >
                                                                    <motion.div className="absolute top-1 left-1 w-3 h-3 rounded-full bg-white" animate={{ x: serial.WaitForConnection ? 20 : 0 }} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                    <div className="space-y-2">
                                                        <label className="text-label pl-1">{t.vms.config_editor.serial.target}</label>
                                                        <select
                                                            value={serial.Target}
                                                            onChange={e => {
                                                                const next = [...serials];
                                                                next[idx] = { ...next[idx], Target: e.target.value };
                                                                updateConfig({ Serial: next });
                                                            }}
                                                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none transition-all"
                                                        >
                                                            <option value="native">Automatic Serial Device (Max 4)</option>
                                                            <option value="virtio">Virtio Console</option>
                                                        </select>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="space-y-6">
                                                <h3 className="text-section">{t.vms.config_editor.serial.style}</h3>
                                                <div className="space-y-4">
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div className="space-y-2">
                                                            <label className="text-label pl-1">{t.vms.config_editor.serial.text_color}</label>
                                                            <div className="flex gap-2 items-center bg-black/40 border border-white/10 rounded-xl px-4 py-3">
                                                                <input
                                                                    type="color"
                                                                    value={serial.TerminalStyle?.TextColor || '#ffffff'}
                                                                    onChange={e => {
                                                                        const next = [...serials];
                                                                        next[idx] = { ...next[idx], TerminalStyle: { ...next[idx].TerminalStyle, TextColor: e.target.value } };
                                                                        updateConfig({ Serial: next });
                                                                    }}
                                                                    className="w-6 h-6 bg-transparent border-none p-0 overflow-hidden rounded cursor-pointer"
                                                                />
                                                                <span className="text-[10px] uppercase font-mono">{serial.TerminalStyle?.TextColor || '#ffffff'}</span>
                                                            </div>
                                                        </div>
                                                        <div className="space-y-2">
                                                            <label className="text-label pl-1">{t.vms.config_editor.serial.bg_color}</label>
                                                            <div className="flex gap-2 items-center bg-black/40 border border-white/10 rounded-xl px-4 py-3">
                                                                <input
                                                                    type="color"
                                                                    value={serial.TerminalStyle?.BackgroundColor || '#000000'}
                                                                    onChange={e => {
                                                                        const next = [...serials];
                                                                        next[idx] = { ...next[idx], TerminalStyle: { ...next[idx].TerminalStyle, BackgroundColor: e.target.value } };
                                                                        updateConfig({ Serial: next });
                                                                    }}
                                                                    className="w-6 h-6 bg-transparent border-none p-0 overflow-hidden rounded cursor-pointer"
                                                                />
                                                                <span className="text-[10px] uppercase font-mono">{serial.TerminalStyle?.BackgroundColor || '#000000'}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div className="space-y-2">
                                                            <label className="text-label pl-1">{t.vms.config_editor.serial.font_size}</label>
                                                            <input
                                                                type="number"
                                                                value={serial.TerminalStyle?.FontSize || 12}
                                                                onChange={e => {
                                                                    const next = [...serials];
                                                                    next[idx] = { ...next[idx], TerminalStyle: { ...next[idx].TerminalStyle, FontSize: parseInt(e.target.value) || 12 } };
                                                                    updateConfig({ Serial: next });
                                                                }}
                                                                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none transition-all"
                                                            />
                                                        </div>
                                                        <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5 mt-auto">
                                                            <label className="text-xs font-bold">{t.vms.config_editor.serial.blink_cursor}</label>
                                                            <button
                                                                onClick={() => {
                                                                    const next = [...serials];
                                                                    next[idx] = { ...next[idx], TerminalStyle: { ...next[idx].TerminalStyle, BlinkCursor: !next[idx].TerminalStyle?.BlinkCursor } };
                                                                    updateConfig({ Serial: next });
                                                                }}
                                                                className={`w-10 h-5 rounded-full transition-all relative ${serial.TerminalStyle?.BlinkCursor ? 'bg-brand-purple' : 'bg-white/10'}`}
                                                            >
                                                                <motion.div className="absolute top-1 left-1 w-3 h-3 rounded-full bg-white" animate={{ x: serial.TerminalStyle?.BlinkCursor ? 20 : 0 }} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </section>
                                )
                            ))}

                            {/* Sound Tab */}
                            {sounds.map((sound, idx) => (
                                activeTab === `sound-${idx}` && (
                                    <section key={`sound-tab-${idx}`} className="space-y-8">
                                        <div className="flex justify-between items-center">
                                            <h2 className="text-2xl font-bold flex items-center gap-3">
                                                <Volume2 className="text-brand-purple" /> {t.vms.config_editor.tabs.sound} {idx + 1}
                                            </h2>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-red-400 hover:text-red-300 hover:bg-red-400/10 h-9 px-4 text-xs font-bold uppercase tracking-widest"
                                                onClick={() => {
                                                    updateConfig(prev => ({
                                                        ...prev,
                                                        Sound: (prev.Sound || []).filter((__, i) => i !== idx)
                                                    }));
                                                    setActiveTab('system');
                                                }}
                                            >
                                                <Trash2 size={14} className="mr-2" /> {t.vms.config_editor.network.remove}
                                            </Button>
                                        </div>

                                        <div className="max-w-lg space-y-6">
                                            <div className="space-y-2">
                                                <label className="text-label pl-1">{t.vms.config_editor.sound.hardware}</label>
                                                <select
                                                    value={sound.Hardware}
                                                    onChange={e => {
                                                        const next = [...sounds];
                                                        next[idx] = { ...next[idx], Hardware: e.target.value };
                                                        updateConfig({ Sound: next });
                                                    }}
                                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none transition-all"
                                                >
                                                    <option value="intel-hda">Intel HD Audio (HDA)</option>
                                                    <option value="ac97">AC97</option>
                                                    <option value="sb16">SoundBlaster 16</option>
                                                </select>
                                            </div>
                                            <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5">
                                                <div>
                                                    <p className="text-xs font-bold">{t.vms.config_editor.sound.audio_input}</p>
                                                    <p className="text-[10px] text-gray-500">Allow guest to use host microphone</p>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        const next = [...sounds];
                                                        next[idx] = { ...next[idx], AudioInput: !next[idx].AudioInput };
                                                        updateConfig({ Sound: next });
                                                    }}
                                                    className={`w-10 h-5 rounded-full transition-all relative ${sound.AudioInput ? 'bg-brand-purple' : 'bg-white/10'}`}
                                                >
                                                    <motion.div className="absolute top-1 left-1 w-3 h-3 rounded-full bg-white" animate={{ x: sound.AudioInput ? 20 : 0 }} />
                                                </button>
                                            </div>
                                        </div>
                                    </section>
                                )
                            ))}

                            {/* Drives Tab */}
                            {activeTab === 'drives' && (() => {

                                // 排序驱动器列表：按BootOrder排序，未设置的排在最后
                                const sortedDrives = (() => {
                                    if (!parsedConfig.Drives?.Result) return [];
                                    const drives = [...parsedConfig.Drives.Result];
                                    return drives.sort((a, b) => {
                                        const orderA = a.BootOrder ?? 999;
                                        const orderB = b.BootOrder ?? 999;
                                        return orderA - orderB;
                                    });
                                })();

                                // 拖拽结束处理
                                const handleDragEnd = (event: DragEndEvent) => {
                                    const { active, over } = event;
                                    if (!over || active.id === over.id) return;

                                    const oldIndex = sortedDrives.findIndex(d => `${d.ImageName}-${d.ImagePath}-${d.IsISO}` === active.id);
                                    const newIndex = sortedDrives.findIndex(d => `${d.ImageName}-${d.ImagePath}-${d.IsISO}` === over.id);

                                    if (oldIndex === -1 || newIndex === -1) return;

                                    updateConfig(prev => {
                                        const res = [...prev.Drives!.Result];

                                        // 使用 arrayMove 直接在 sortedDrives 上移动，得到新的排序顺序
                                        const newSortedDrives = arrayMove(sortedDrives, oldIndex, newIndex);

                                        // 计算原始数组中有 BootOrder 的驱动器数量
                                        const originalOrderedCount = res.filter(d => d.BootOrder !== undefined && d.BootOrder !== null).length;

                                        // 根据新的排序顺序，重新构建驱动器数组
                                        const finalDrives: typeof res = [];
                                        
                                        newSortedDrives.forEach((sortedDrive, idx) => {
                                            // 在原始数组中找到对应的驱动器
                                            const foundIndex = res.findIndex(d =>
                                                d.ImageName === sortedDrive.ImageName &&
                                                d.ImagePath === sortedDrive.ImagePath &&
                                                d.IsISO === sortedDrive.IsISO
                                            );
                                            
                                            if (foundIndex !== -1) {
                                                const found = res[foundIndex];
                                                // 如果这个驱动器原本有 BootOrder，或者它被拖动到前 originalOrderedCount 个位置，就分配 BootOrder
                                                const originalHasOrder = found.BootOrder !== undefined && found.BootOrder !== null;
                                                
                                                if (originalHasOrder || idx < originalOrderedCount) {
                                                    finalDrives.push({
                                                        ...found,
                                                        BootOrder: idx + 1
                                                    });
                                                } else {
                                                    // 保持没有 BootOrder
                                                    finalDrives.push({
                                                        ...found,
                                                        BootOrder: undefined
                                                    });
                                                }
                                            }
                                        });

                                        return { ...prev, Drives: { Result: finalDrives } };
                                    });
                                };

                                // 移动驱动器函数（用于按钮）
                                const moveDrive = (currentIndex: number, direction: 'up' | 'down') => {
                                    if (!parsedConfig.Drives?.Result) return;

                                    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
                                    if (newIndex < 0 || newIndex >= sortedDrives.length) return;

                                    updateConfig(prev => {
                                        const res = [...prev.Drives!.Result];

                                        // 使用 arrayMove 在 sortedDrives 上移动，得到新的排序顺序
                                        const newSortedDrives = arrayMove(sortedDrives, currentIndex, newIndex);

                                        // 计算原始数组中有 BootOrder 的驱动器数量
                                        const originalOrderedCount = res.filter(d => d.BootOrder !== undefined && d.BootOrder !== null).length;

                                        // 根据新的排序顺序，重新构建驱动器数组
                                        const finalDrives: typeof res = [];
                                        
                                        newSortedDrives.forEach((sortedDrive, idx) => {
                                            // 在原始数组中找到对应的驱动器
                                            const foundIndex = res.findIndex(d =>
                                                d.ImageName === sortedDrive.ImageName &&
                                                d.ImagePath === sortedDrive.ImagePath &&
                                                d.IsISO === sortedDrive.IsISO
                                            );
                                            
                                            if (foundIndex !== -1) {
                                                const found = res[foundIndex];
                                                // 如果这个驱动器原本有 BootOrder，或者它被拖动到前 originalOrderedCount 个位置，就分配 BootOrder
                                                const originalHasOrder = found.BootOrder !== undefined && found.BootOrder !== null;
                                                
                                                if (originalHasOrder || idx < originalOrderedCount) {
                                                    finalDrives.push({
                                                        ...found,
                                                        BootOrder: idx + 1
                                                    });
                                                } else {
                                                    // 保持没有 BootOrder
                                                    finalDrives.push({
                                                        ...found,
                                                        BootOrder: undefined
                                                    });
                                                }
                                            }
                                        });

                                        return { ...prev, Drives: { Result: finalDrives } };
                                    });
                                };

                                // 可拖拽的驱动器项组件
                                const SortableDriveItem = memo(function SortableDriveItem({ drive, index, originalIndex }: { drive: typeof sortedDrives[0], index: number, originalIndex: number }) {
                                    const [, setIsMenuOpenLocal] = useState(false);
                                    const {
                                        attributes,
                                        listeners,
                                        setNodeRef,
                                        transform,
                                        transition,
                                        isDragging,
                                    } = useSortable({
                                        id: `${drive.ImageName}-${drive.ImagePath}-${drive.IsISO}`,
                                    });

                                    const style = {
                                        transform: CSS.Transform.toString(transform),
                                        transition,
                                        opacity: isDragging ? 0.5 : 1,
                                    };

                                    return (
                                        <div
                                            ref={setNodeRef}
                                            style={style}
                                            className={`flex items-start md:items-center gap-4 p-5 bg-white/5 border border-white/5 rounded-2xl group hover:bg-white/[0.08] transition-all ${isDragging ? 'shadow-lg border-brand-purple/50 z-50' : ''}`}
                                        >
                                            {/* 拖拽手柄 - 大屏幕显示 */}
                                            <div
                                                {...attributes}
                                                {...listeners}
                                                className="hidden md:flex cursor-grab active:cursor-grabbing text-gray-500 hover:text-white transition-colors p-1.5 mr-1"
                                                title={t.vms.config_editor.drives?.drag_to_reorder || '拖拽排序'}
                                                aria-label={t.vms.config_editor.drives?.drag_to_reorder || '拖拽排序'}
                                            >
                                                <GripVertical size={18} />
                                            </div>

                                            {/* 左侧：图标和基本信息 */}
                                            <div className="flex items-start gap-4 flex-1 min-w-0">
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${drive.IsISO ? 'bg-blue-500/10 text-blue-400' : 'bg-brand-purple/10 text-brand-purple'}`}>
                                                    <Disc size={20} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    {/* 文件名：窄屏时换行，宽屏时截断，始终显示tooltip */}
                                                    <div className="relative group/name">
                                                        <p className="text-sm font-bold text-white uppercase tracking-tight break-words md:truncate" title={drive.ImageName}>{drive.ImageName}</p>
                                                        {/* Tooltip：显示完整文件名（仅在宽屏且文本被截断时显示） */}
                                                        <div className="hidden md:block absolute bottom-full left-0 mb-2 px-3 py-2 bg-zinc-900 border border-white/10 rounded-lg text-[11px] text-zinc-300 font-medium whitespace-nowrap opacity-0 group-hover/name:opacity-100 pointer-events-none transition-opacity duration-200 z-50 shadow-xl max-w-xs">
                                                            {drive.ImageName}
                                                            <div className="absolute top-full left-4 border-4 border-transparent border-t-zinc-900" />
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                                        {drive.IsISO && (
                                                            <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 uppercase flex-shrink-0">ISO</span>
                                                        )}
                                                        <p className="text-[10px] text-gray-500 font-mono">
                                                            {drive.Interface} {drive.Size && `• ${Math.round(drive.Size / (1024 ** 3))}GB`}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* 中间：启动顺序控件 - 独立分组，增加间距（遵循HIG的16px间距） */}
                                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-black/40 rounded-lg border border-white/5 mx-2 md:mx-4 flex-shrink-0 self-start md:self-center">
                                                <label className="text-[9px] font-bold text-gray-600 uppercase">{t.vms.config_editor.drives?.boot_order || 'Boot'}</label>
                                                <div className="w-8 text-[10px] font-bold text-center text-white">
                                                    {drive.BootOrder || '-'}
                                                </div>
                                            </div>

                                            {/* 右侧：操作按钮组 */}
                                            <div className="flex items-center gap-2 flex-shrink-0 self-start md:self-center">
                                                {/* 上下移动按钮 - 小屏幕显示 */}
                                                <div className="flex flex-col gap-0.5 md:hidden">
                                                    <button
                                                        onClick={() => moveDrive(index, 'up')}
                                                        disabled={index === 0}
                                                        className="p-1 text-gray-500 hover:text-white hover:bg-white/10 rounded transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-gray-500 disabled:hover:bg-transparent"
                                                        title={t.vms.config_editor.drives?.move_up || '上移'}
                                                        aria-label={t.vms.config_editor.drives?.move_up || '上移'}
                                                    >
                                                        <ChevronUp size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => moveDrive(index, 'down')}
                                                        disabled={index === sortedDrives.length - 1}
                                                        className="p-1 text-gray-500 hover:text-white hover:bg-white/10 rounded transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-gray-500 disabled:hover:bg-transparent"
                                                        title={t.vms.config_editor.drives?.move_down || '下移'}
                                                        aria-label={t.vms.config_editor.drives?.move_down || '下移'}
                                                    >
                                                        <ChevronDown size={14} />
                                                    </button>
                                                </div>

                                                {/* 更多操作菜单 */}
                                                <div className="relative group/menu">
                                                    <button className="p-2 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition-all">
                                                        <Settings size={16} />
                                                    </button>

                                                    <div className="absolute right-0 top-full mt-2 w-36 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl py-1 z-[100] opacity-0 invisible group-hover/menu:opacity-100 group-hover/menu:visible transition-all">
                                                        {!drive.IsISO && (
                                                            <>
                                                                <button
                                                                    onClick={() => {
                                                                        setResizeValue(Math.round((drive.Size || 0) / (1024 ** 3)) + 10);
                                                                        setShowResizeDialog(drive.ImageName);
                                                                        setIsMenuOpenLocal(false);
                                                                    }}
                                                                    className="w-full px-4 py-2 text-left text-xs text-gray-400 hover:text-white hover:bg-white/5 flex items-center gap-2"
                                                                >
                                                                    <Layers size={14} /> {t.vms.config_editor.drives?.resize || '调整大小'}
                                                                </button>
                                                                <button
                                                                    onClick={() => {
                                                                        handleCompressDisk(drive.ImageName);
                                                                        setIsMenuOpenLocal(false);
                                                                    }}
                                                                    className="w-full px-4 py-2 text-left text-xs text-gray-400 hover:text-white hover:bg-white/5 flex items-center gap-2"
                                                                >
                                                                    <Minimize2 size={14} /> {t.vms.config_editor.drives?.compress || '压缩'}
                                                                </button>
                                                            </>
                                                        )}
                                                        <button
                                                            onClick={() => {
                                                                handleDeleteDiskFile(drive.ImageName);
                                                                setIsMenuOpenLocal(false);
                                                            }}
                                                            className="w-full px-4 py-2 text-left text-xs text-red-500 hover:bg-red-500/10 flex items-center gap-2"
                                                        >
                                                            <Trash2 size={14} /> {t.vms.config_editor.drives?.remove || '物理删除'}
                                                        </button>

                                                        <div className="h-px bg-white/5 my-1" />

                                                        <button
                                                            onClick={() => {
                                                                updateConfig(prev => {
                                                                    const filtered = prev.Drives!.Result.filter((__, idx) => idx !== originalIndex);
                                                                    const reindexed = filtered.map((drive, idx) => ({ ...drive, BootOrder: idx + 1 }));
                                                                    return { ...prev, Drives: { Result: reindexed } };
                                                                });
                                                                setIsMenuOpenLocal(false);
                                                            }}
                                                            className="w-full px-4 py-2 text-left text-[10px] text-gray-600 hover:text-gray-400"
                                                        >
                                                            仅从配置移除
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }
                                );

                                return (
                                    <section className="space-y-8">
                                        <div className="flex justify-between items-center">
                                            <h2 className="text-2xl font-bold flex items-center gap-3">
                                                <Disc className="text-brand-purple" /> {t.vms.config_editor.tabs.drives}
                                            </h2>
                                            <div className="flex gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-9 px-4 text-xs font-bold uppercase tracking-widest bg-white/5"
                                                    onClick={() => setShowAddDiskDialog(true)}
                                                >
                                                    <Plus size={14} className="mr-2" /> {t.vms.config_editor.drives.add_disk}
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-9 px-4 text-xs font-bold uppercase tracking-widest"
                                                    onClick={() => setShowIsoDialog(true)}
                                                >
                                                    <Disc size={14} className="mr-2" /> {t.vms.config_editor.drives.add_iso}
                                                </Button>
                                            </div>
                                        </div>

                                        <DndContext
                                            sensors={sensors}
                                            collisionDetection={closestCenter}
                                            onDragEnd={handleDragEnd}
                                        >
                                            <SortableContext
                                                items={sortedDrives.map(d => `${d.ImageName}-${d.ImagePath}-${d.IsISO}`)}
                                                strategy={verticalListSortingStrategy}
                                            >
                                                <div className="space-y-4">
                                                    {sortedDrives.map((drive, i) => {
                                                        const originalIndex = parsedConfig.Drives?.Result.findIndex(d =>
                                                            d.ImageName === drive.ImageName &&
                                                            d.ImagePath === drive.ImagePath &&
                                                            d.IsISO === drive.IsISO
                                                        ) ?? i;
                                                        return (
                                                            <SortableDriveItem
                                                                key={`${drive.ImageName}-${drive.ImagePath}-${drive.IsISO}`}
                                                                drive={drive}
                                                                index={i}
                                                                originalIndex={originalIndex}
                                                            />
                                                        );
                                                    })}

                                                    {sortedDrives.length === 0 && (
                                                        <div className="p-12 border-2 border-dashed border-white/5 rounded-3xl flex flex-col items-center justify-center text-gray-600 space-y-3">
                                                            <Disc size={32} className="opacity-20" />
                                                            <p className="text-xs font-medium italic">{t.vms.config_editor.drives?.no_drives || 'No drives configured'}</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </SortableContext>
                                        </DndContext>

                                        {/* Modals for Disk Management */}
                                        <AnimatePresence>
                                            {showAddDiskDialog && (
                                                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                                                    <motion.div
                                                        initial={{ opacity: 0 }}
                                                        animate={{ opacity: 1 }}
                                                        exit={{ opacity: 0 }}
                                                        onClick={() => {
                                                            setShowAddDiskDialog(false);
                                                            setDiskImportMode('create');
                                                            setSelectedDiskName('');
                                                        }}
                                                        className="absolute inset-0 bg-black/80 backdrop-blur-md"
                                                    />
                                                    <motion.div
                                                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="relative w-full max-w-md bg-zinc-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden"
                                                    >
                                                        <div className="p-6 border-b border-white/5">
                                                            <h3 className="text-lg font-bold">{t.vms.config_editor.drives.add_disk}</h3>
                                                        </div>
                                                        
                                                        {/* Mode Toggle */}
                                                        <div className="p-4 border-b border-white/5">
                                                            <div className="flex gap-2 bg-white/5 rounded-xl p-1">
                                                                <button
                                                                    onClick={() => {
                                                                        setDiskImportMode('create');
                                                                        setSelectedDiskName('');
                                                                    }}
                                                                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                                                        diskImportMode === 'create'
                                                                            ? 'bg-brand-purple text-white'
                                                                            : 'text-gray-400 hover:text-white'
                                                                    }`}
                                                                >
                                                                    {(t.vms.config_editor.drives as Record<string, string>).create_mode || '创建新磁盘'}
                                                                </button>
                                                                <button
                                                                    onClick={() => {
                                                                        setDiskImportMode('import');
                                                                        setSelectedDiskName('');
                                                                        fetchUnusedDisks();
                                                                    }}
                                                                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                                                        diskImportMode === 'import'
                                                                            ? 'bg-brand-purple text-white'
                                                                            : 'text-gray-400 hover:text-white'
                                                                    }`}
                                                                >
                                                                    {(t.vms.config_editor.drives as Record<string, string>).import_mode || '导入已有磁盘'}
                                                                </button>
                                                            </div>
                                                        </div>

                                                        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                                                            {diskImportMode === 'create' ? (
                                                                <>
                                                                    <div className="space-y-1.5">
                                                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t.vms.config_editor.drives.disk_name}</label>
                                                                        <input
                                                                            type="text"
                                                                            value={newDiskName}
                                                                            onChange={e => setNewDiskName(e.target.value)}
                                                                            placeholder="data2.qcow2"
                                                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-brand-purple/50 transition-colors"
                                                                        />
                                                                    </div>
                                                                    <div className="space-y-1.5">
                                                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t.vms.config_editor.drives.disk_size}</label>
                                                                        <input
                                                                            type="number"
                                                                            value={newDiskSize}
                                                                            onChange={e => setNewDiskSize(parseInt(e.target.value) || 0)}
                                                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-brand-purple/50 transition-colors"
                                                                        />
                                                                    </div>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    {isLoadingDisks ? (
                                                                        <div className="flex items-center justify-center py-8">
                                                                            <div className="text-sm text-gray-400">{(t.vms.config_editor.drives as Record<string, string>).scanning || '正在扫描...'}</div>
                                                                        </div>
                                                                    ) : availableDisks.length === 0 ? (
                                                                        <div className="text-center py-8 space-y-2">
                                                                            <p className="text-sm text-gray-400">{(t.vms.config_editor.drives as Record<string, string>).no_unused_disks || '未找到可用的磁盘文件'}</p>
                                                                            <p className="text-xs text-gray-500">{(t.vms.config_editor.drives as Record<string, string>).no_unused_disks_desc || 'Data 目录中没有未使用的 qcow2 文件。'}</p>
                                                                        </div>
                                                                    ) : (
                                                                        <div className="space-y-2">
                                                                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{(t.vms.config_editor.drives as Record<string, string>).select_disk || '选择磁盘'}</label>
                                                                            <div className="space-y-2 max-h-[300px] overflow-y-auto">
                                                                                {availableDisks.map((disk) => (
                                                                                    <button
                                                                                        key={disk.name}
                                                                                        onClick={() => setSelectedDiskName(disk.name)}
                                                                                        className={`w-full p-3 rounded-xl border transition-colors text-left ${
                                                                                            selectedDiskName === disk.name
                                                                                                ? 'bg-brand-purple/20 border-brand-purple/50'
                                                                                                : 'bg-white/5 border-white/10 hover:bg-white/10'
                                                                                        }`}
                                                                                    >
                                                                                        <div className="flex items-center justify-between">
                                                                                            <span className="text-sm font-medium">{disk.name}</span>
                                                                                            <span className="text-xs text-gray-400">
                                                                                                {disk.sizeGB.toFixed(2)} GB
                                                                                            </span>
                                                                                        </div>
                                                                                    </button>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </>
                                                            )}
                                                            
                                                            <div className="space-y-1.5">
                                                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t.vms.config_editor.drives.interface}</label>
                                                                <select
                                                                    value={newDiskInterface}
                                                                    onChange={e => setNewDiskInterface(e.target.value)}
                                                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-brand-purple/50 transition-colors appearance-none"
                                                                >
                                                                    <option value="virtio">VirtIO</option>
                                                                    <option value="nvme">NVMe</option>
                                                                    <option value="sata">SATA</option>
                                                                    <option value="ide">IDE</option>
                                                                    <option value="scsi">SCSI</option>
                                                                </select>
                                                            </div>
                                                        </div>
                                                        <div className="p-6 bg-white/5 flex gap-3">
                                                            <Button variant="ghost" className="flex-1" onClick={() => {
                                                                setShowAddDiskDialog(false);
                                                                setDiskImportMode('create');
                                                                setSelectedDiskName('');
                                                            }}>
                                                                {t.common?.cancel || 'Cancel'}
                                                            </Button>
                                                            <Button 
                                                                className="flex-1 bg-brand-purple hover:bg-brand-purple-hover" 
                                                                onClick={handleAddDisk}
                                                                disabled={diskImportMode === 'import' && !selectedDiskName}
                                                            >
                                                                {diskImportMode === 'import' ? ((t.vms.config_editor.drives as Record<string, string>).import_disk || 'Import') : (t.common.save || 'Create')}
                                                            </Button>
                                                        </div>
                                                    </motion.div>
                                                </div>
                                            )}

                                            {showResizeDialog && (
                                                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowResizeDialog(null)} className="absolute inset-0 bg-black/80 backdrop-blur-md" />
                                                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-xs bg-zinc-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden p-6 space-y-6">
                                                        <div className="space-y-2">
                                                            <h3 className="text-lg font-bold">{t.vms.config_editor.drives.resize_title}</h3>
                                                            <p className="text-xs text-gray-400">{t.vms.config_editor.drives.resize_confirm.replace('{name}', showResizeDialog)}</p>
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t.vms.config_editor.drives.new_size}</label>
                                                            <input
                                                                type="number"
                                                                value={resizeValue}
                                                                onChange={e => setResizeValue(parseInt(e.target.value) || 0)}
                                                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-brand-purple/50 transition-colors"
                                                            />
                                                        </div>
                                                        <div className="flex gap-3">
                                                            <Button variant="ghost" className="flex-1" onClick={() => setShowResizeDialog(null)}>Cancel</Button>
                                                            <Button className="flex-1 bg-brand-purple" onClick={() => handleResizeDisk(showResizeDialog)}>Resize</Button>
                                                        </div>
                                                    </motion.div>
                                                </div>
                                            )}
                                        </AnimatePresence>
                                    </section>
                                );
                            })()}

                            {/* Sharing Tab */}
                            {activeTab === 'sharing' && (
                                <section className="space-y-8">
                                    <div className="flex justify-between items-center">
                                        <h2 className="text-2xl font-bold flex items-center gap-3">
                                            <Share2 className="text-brand-purple" /> {t.vms.config_editor.tabs.sharing}
                                        </h2>
                                        {!readOnly && (
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-9 px-4 text-xs font-bold uppercase tracking-widest"
                                                onClick={() => {
                                                    const path = prompt(t.vms.config_editor.sharing.host_path + ':');
                                                    const tag = prompt(t.vms.config_editor.sharing.mount_tag + ':');
                                                    if (path && tag) {
                                                        updateConfig(prev => ({
                                                            ...prev,
                                                            Sharing: { DirectoryShareFolders: [...(prev.Sharing?.DirectoryShareFolders || []), { Path: path, Tag: tag }] }
                                                        }));
                                                    }
                                                }}
                                            >
                                                <Plus size={14} className="mr-2" /> Add Folder
                                            </Button>
                                        )}
                                    </div>
                                    <div className="space-y-4">
                                        {(parsedConfig.Sharing?.DirectoryShareFolders || []).map((folder, i) => (
                                            <div key={i} className="flex items-center justify-between p-5 bg-white/5 border border-white/5 rounded-2xl group hover:bg-white/10 transition-all">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-400 flex items-center justify-center">
                                                        <Share2 size={20} />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-white">{folder.Tag}</p>
                                                        <p className="text-[10px] text-gray-500 font-mono mt-0.5">{folder.Path}</p>
                                                    </div>
                                                </div>
                                                {!readOnly && (
                                                    <button
                                                        onClick={() => {
                                                            updateConfig(prev => ({
                                                                ...prev,
                                                                Sharing: { DirectoryShareFolders: (prev.Sharing?.DirectoryShareFolders || []).filter((__, idx) => idx !== i) }
                                                            }));
                                                        }}
                                                        className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            )}

                            {activeTab === 'usb' && (
                                <section className="space-y-8">
                                    <h2 className="text-2xl font-bold flex items-center gap-3">
                                        <Usb className="text-brand-purple" /> USB
                                    </h2>
                                    <div className="space-y-2">
                                        {isLoadingUSB ? (
                                            <div className="h-48 flex items-center justify-center bg-white/5 rounded-2xl animate-pulse text-xs text-gray-500">Discovering...</div>
                                        ) : hostUSBDevices.map((device, i) => {
                                            const isSelected = parsedConfig.USBDevices?.some(d => d.VendorID === device.vendorID && d.ProductID === device.productID);
                                            return (
                                                <button
                                                    key={i}
                                                    onClick={() => {
                                                        const current = parsedConfig.USBDevices || [];
                                                        const exists = current.some(d => d.VendorID === device.vendorID && d.ProductID === device.productID);
                                                        updateConfig({
                                                            USBDevices: exists
                                                                ? current.filter(d => !(d.VendorID === device.vendorID && d.ProductID === device.productID))
                                                                : [...current, { VendorID: device.vendorID, ProductID: device.productID, Name: device.name }]
                                                        });
                                                    }}
                                                    className={`w-full px-5 py-4 rounded-2xl border text-left transition-all flex items-center justify-between ${isSelected ? 'bg-brand-purple/10 border-brand-purple text-white shadow-lg' : 'bg-white/5 border-white/5 text-gray-400 hover:bg-white/10'}`}
                                                >
                                                    <div className="flex items-center gap-4">
                                                        <Usb size={16} className={isSelected ? 'text-brand-purple' : 'text-gray-600'} />
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-bold">{device.name}</span>
                                                            <span className="text-[10px] opacity-50 font-mono">{device.vendorID}:{device.productID}</span>
                                                        </div>
                                                    </div>
                                                    {isSelected && <Check size={16} className="text-brand-purple" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </section>
                            )}

                            {activeTab === 'snapshots' && (
                                <section className="space-y-8">
                                    <div className="flex justify-between items-center">
                                        <h2 className="text-2xl font-bold flex items-center gap-3">
                                            <Camera className="text-brand-purple" /> Snapshots
                                        </h2>
                                        <Button size="sm" variant="ghost" className="h-9 px-4 text-xs font-bold uppercase tracking-widest" onClick={handleCreateSnapshot}>
                                            <Plus size={14} className="mr-2" /> New Snapshot
                                        </Button>
                                    </div>
                                    <div className="space-y-3">
                                        {isLoadingSnapshots ? (
                                            <div className="h-32 flex items-center justify-center text-xs text-gray-500 animate-pulse bg-white/5 rounded-2xl">Loading snapshots...</div>
                                        ) : snapshots.length === 0 ? (
                                            <div className="h-32 flex items-center justify-center text-xs text-gray-500 italic bg-white/5 rounded-2xl">No snapshots available</div>
                                        ) : snapshots.map((snap, i) => (
                                            <div key={i} className="px-5 py-4 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-between group hover:bg-white/10 transition-all">
                                                <div className="flex items-center gap-4">
                                                    <Camera size={18} className="text-indigo-400" />
                                                    <div>
                                                        <p className="text-sm font-bold text-white">{snap.name}</p>
                                                        <p className="text-[10px] text-gray-500 font-mono">
                                                            {new Date(snap['date-sec'] * 1000).toLocaleString()} • {Math.round(snap['vm-state-size'] / 1024)}KB
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button onClick={() => handleRevertSnapshot(snap.name)} className="p-2 text-gray-500 hover:text-white rounded-lg hover:bg-white/10 transition-all">
                                                        <RotateCcw size={14} />
                                                    </button>
                                                    <button onClick={() => handleDeleteSnapshot(snap.name)} className="p-2 text-gray-500 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-all">
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            )}
                        </motion.div>
                    </AnimatePresence>
                </div>

                <div className="px-12 py-5 border-t border-white/5 bg-black/40 flex items-center gap-4">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.4)]" />
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]">{t.vms.config_editor.common.ready_for_changes}</span>
                </div>
            </div>

            {/* ISO Dialog */}
            <AnimatePresence>
                {showIsoDialog && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-8 bg-black/80 backdrop-blur-xl">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="w-full max-w-xl bg-[#1c1c1e] border border-white/10 rounded-3xl shadow-[0_32px_64px_-12px_rgba(0,0,0,0.5)] overflow-hidden"
                        >
                            <div className="flex items-center justify-between px-8 py-6 border-b border-white/5 bg-white/[0.02]">
                                <h3 className="text-xl font-bold">{t.vms.config_editor.drives.select_iso}</h3>
                                <div className="flex items-center gap-2 relative">
                                    <label
                                        className="p-2 rounded-xl hover:bg-brand-purple/20 text-brand-purple cursor-pointer transition-all flex items-center justify-center relative z-10"
                                        title={t.vms.config_editor.drives.upload_iso}
                                    >
                                        <Plus size={20} />
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept=".iso,.img"
                                            className="hidden"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                // 防止重复处理
                                                if (uploadInProgressRef.current || isUploading) {
                                                    e.target.value = '';
                                                    return;
                                                }
                                                handleUploadIso(file);
                                                // 重置 input 值，允许选择同一个文件
                                                e.target.value = '';
                                            }
                                        }}
                                            disabled={isUploading}
                                            onClick={(e) => {
                                                // 确保点击事件可以正常传播
                                                e.stopPropagation();
                                            }}
                                        />
                                    </label>
                                    <button onClick={() => setShowIsoDialog(false)} className="p-2 rounded-xl hover:bg-white/5 text-gray-400">
                                        <X size={20} />
                                    </button>
                                </div>
                            </div>
                            {isUploading && uploadProgress && (
                                <div className="px-8 py-4 bg-brand-purple/10 border-b border-white/5">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-bold text-brand-purple uppercase tracking-widest">
                                            {uploadProgress.stage === 'uploading' 
                                                ? t.vms.config_editor.drives.uploading
                                                : t.vms.config_editor.drives.processing
                                            }
                                        </span>
                                        <span className="text-xs font-bold text-brand-purple">
                                            {uploadProgress.stage === 'processing' 
                                                ? `${Math.round(uploadProgress.percent)}%` 
                                                : `${Math.round(Math.min(uploadProgress.percent, 90))}%`
                                            }
                                        </span>
                                    </div>
                                    <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                                        <motion.div
                                            className="h-full bg-brand-purple"
                                            initial={{ width: 0 }}
                                            animate={{ 
                                                width: uploadProgress.stage === 'processing' 
                                                    ? `${Math.min(uploadProgress.percent, 99)}%` 
                                                    : `${Math.min(uploadProgress.percent, 90)}%`
                                            }}
                                            transition={{ duration: 0.1 }}
                                        />
                                    </div>
                                    <div className="mt-2 flex items-center justify-between text-[10px] text-gray-500">
                                        {uploadProgress.stage === 'uploading' ? (
                                            <>
                                                <span>
                                                    {uploadProgress.loaded < 1024 * 1024 
                                                        ? `${(uploadProgress.loaded / 1024).toFixed(2)} KB`
                                                        : uploadProgress.loaded < 1024 * 1024 * 1024
                                                        ? `${(uploadProgress.loaded / 1024 / 1024).toFixed(2)} MB`
                                                        : `${(uploadProgress.loaded / 1024 / 1024 / 1024).toFixed(2)} GB`
                                                    } / {
                                                        uploadProgress.total < 1024 * 1024
                                                        ? `${(uploadProgress.total / 1024).toFixed(2)} KB`
                                                        : uploadProgress.total < 1024 * 1024 * 1024
                                                        ? `${(uploadProgress.total / 1024 / 1024).toFixed(2)} MB`
                                                        : `${(uploadProgress.total / 1024 / 1024 / 1024).toFixed(2)} GB`
                                                    }
                                                </span>
                                                {uploadProgress.percent > 0 && uploadProgress.percent < 90 && uploadProgress.startTime && (
                                                    <span>
                                                        {(() => {
                                                            const elapsed = (Date.now() - uploadProgress.startTime) / 1000;
                                                            const speedMBps = (uploadProgress.loaded / 1024 / 1024) / elapsed;
                                                            return speedMBps < 1 
                                                                ? `${(speedMBps * 1024).toFixed(2)} KB/s`
                                                                : `${speedMBps.toFixed(2)} MB/s`;
                                                        })()}
                                                    </span>
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                <span className="text-gray-400">
                                                    {uploadProgress.loaded > 0 ? (
                                                        <>
                                                            {uploadProgress.loaded < 1024 * 1024 
                                                                ? `${(uploadProgress.loaded / 1024).toFixed(2)} KB`
                                                                : uploadProgress.loaded < 1024 * 1024 * 1024
                                                                ? `${(uploadProgress.loaded / 1024 / 1024).toFixed(2)} MB`
                                                                : `${(uploadProgress.loaded / 1024 / 1024 / 1024).toFixed(2)} GB`
                                                            } / {
                                                                uploadProgress.total < 1024 * 1024
                                                                ? `${(uploadProgress.total / 1024).toFixed(2)} KB`
                                                                : uploadProgress.total < 1024 * 1024 * 1024
                                                                ? `${(uploadProgress.total / 1024 / 1024).toFixed(2)} MB`
                                                                : `${(uploadProgress.total / 1024 / 1024 / 1024).toFixed(2)} GB`
                                                            }
                                                        </>
                                                    ) : (
                                                        <span className="italic">{t.vms.config_editor.drives.processing}</span>
                                                    )}
                                                </span>
                                                {uploadProgress.startTime && (
                                                    <span className="text-gray-500">
                                                        {(() => {
                                                            const elapsed = Math.round((Date.now() - uploadProgress.startTime) / 1000);
                                                            return `${elapsed}s`;
                                                        })()}
                                                    </span>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}
                            {isUploading && !uploadProgress && (
                                <div className="px-8 py-2 bg-brand-purple/10 text-brand-purple text-[10px] font-bold uppercase tracking-widest animate-pulse border-b border-white/5">
                                    {t.vms.config_editor.drives.uploading}
                                </div>
                            )}
                            <div className="p-8 max-h-[500px] overflow-y-auto space-y-3 custom-scrollbar">
                                {isLoadingIsos ? (
                                    <div className="h-48 flex items-center justify-center text-xs text-gray-500 animate-pulse">{t.vms.config_editor.drives.loading_isos}</div>
                                ) : availableIsos.length === 0 ? (
                                    <div className="h-48 flex items-center justify-center text-xs text-gray-500 italic">{t.vms.config_editor.drives.no_isos}</div>
                                ) : availableIsos.map(iso => {
                                    const name = iso.split('/').pop() || iso;
                                    const isUploaded = isUploadedISO(iso);
                                    return (
                                        <div
                                            key={iso}
                                            className="w-full px-5 py-4 rounded-2xl border border-white/5 bg-white/5 hover:bg-brand-purple/20 hover:border-brand-purple/50 transition-all flex items-center gap-4 group"
                                        >
                                            <button
                                                onClick={() => {
                                                    updateConfig(prev => {
                                                        const existingDrives = prev.Drives?.Result || [];
                                                        // 计算现有驱动器的最大启动顺序
                                                        const maxBootOrder = Math.max(
                                                            ...existingDrives
                                                                .map(d => d.BootOrder)
                                                                .filter((order): order is number => order !== undefined && order !== null && order > 0),
                                                            0
                                                        );
                                                        // ISO 通常用于安装系统，应该优先启动
                                                        // 如果没有启动设备，设为 1；否则设为 maxBootOrder + 1
                                                        const newBootOrder = maxBootOrder > 0 ? maxBootOrder + 1 : 1;
                                                        
                                                        return {
                                                            ...prev,
                                                            Drives: { 
                                                                Result: [
                                                                    ...existingDrives,
                                                                    { 
                                                                        ImageName: name, 
                                                                        ImagePath: iso, 
                                                                        Interface: 'cdrom', 
                                                                        IsISO: true, 
                                                                        ReadOnly: true,
                                                                        BootOrder: newBootOrder
                                                                    }
                                                                ] 
                                                            }
                                                        };
                                                    });
                                                    setShowIsoDialog(false);
                                                }}
                                                className="flex-1 flex items-center gap-4 text-left"
                                            >
                                                <Disc size={18} className="text-blue-400 flex-shrink-0" />
                                                <span className="text-sm font-medium">{name}</span>
                                            </button>
                                            {isUploaded && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setDeleteIsoConfirm({ isOpen: true, isoPath: iso });
                                                    }}
                                                    className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100 flex-shrink-0"
                                                    title={t.vms.config_editor.drives.remove}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Delete ISO Confirmation Dialog */}
            <ConfirmDialog
                isOpen={deleteIsoConfirm.isOpen}
                onClose={() => setDeleteIsoConfirm({ isOpen: false, isoPath: null })}
                onConfirm={handleDeleteIsoFile}
                title={t.vms.config_editor.drives.delete_iso_file_title}
                message={deleteIsoConfirm.isoPath ? t.vms.config_editor.drives.delete_iso_file_confirm.replace('{name}', deleteIsoConfirm.isoPath.split('/').pop() || '') : ''}
                confirmText={t.vms.config_editor.drives.remove}
                cancelText="取消"
                variant="danger"
                isLoading={isDeletingIso}
            />
            
            {/* Global Confirm Dialog */}
            <ConfirmDialogComponent />
        </div>
    );
}

function SidebarItem({ icon: Icon, label, active, onClick, onDelete }: { icon: LucideIcon, label: string, active: boolean, onClick: () => void, onDelete?: () => void }) {
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
        onClick();
        // 防止点击后光标闪烁：如果不是编辑器区域，移除焦点
        // 使用setTimeout确保在浏览器设置焦点之后才移除
        setTimeout(() => {
            if (e.currentTarget === document.activeElement) {
                e.currentTarget.blur();
            }
        }, 0);
    };

    return (
        <div className="group relative">
            <button
                onClick={handleClick}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all text-sm font-medium ${active ? 'bg-brand-purple text-white shadow-lg shadow-brand-purple/10' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'}`}
            >
                <Icon size={16} className={active ? 'text-white' : 'text-gray-500'} />
                <span className="truncate">{label}</span>
                {onDelete && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete();
                            // 同样移除删除按钮的焦点
                            setTimeout(() => {
                                if (e.currentTarget === document.activeElement) {
                                    e.currentTarget.blur();
                                }
                            }, 0);
                        }}
                        className="ml-auto p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-red-400 transition-all"
                    >
                        <X size={12} />
                    </button>
                )}
            </button>
        </div>
    );
}

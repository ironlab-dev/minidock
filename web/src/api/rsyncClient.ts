import { API_URL } from './client';

export interface RsyncProgress {
    uploadId: string;
    stage: 'checking' | 'uploading' | 'processing' | 'completed' | 'error';
    percent: number;
    loaded: number;
    total: number;
    speed?: number; // bytes/s
    eta?: number; // seconds
}

export interface RsyncUploadOptions {
    file: File;
    uploadId: string;
    onProgress?: (progress: RsyncProgress) => void;
}

/**
 * 检测 rsync 是否可用
 */
export async function checkRsyncAvailability(): Promise<boolean> {
    try {
        // 使用 client 来确保认证信息被包含
        const { client } = await import('./client');
        const data = await client.get<{ available: boolean }>('/vms/services/isos/rsync-availability');
        return data.available === true;
    } catch (error) {
        console.error('[RsyncClient] Failed to check availability:', error);
        return false;
    }
}

/**
 * 使用流式上传文件
 * 
 * 流程：
 * 1. 先通过 HTTP 流式上传到临时目录（占进度的 0-90%）
 * 2. 调用后端接口，从临时目录移动到目标目录（占进度的 90-100%）
 * 3. 通过 WebSocket 接收进度更新
 */
export async function uploadWithRsync(
    options: RsyncUploadOptions
): Promise<void> {
    const { file, uploadId, onProgress } = options;

    // 监听 WebSocket 进度事件
    const wsHandler = (event: CustomEvent) => {
        try {
            const data = JSON.parse(event.detail);
            if (data.uploadId === uploadId && onProgress) {
                // 根据阶段处理进度
                if (data.stage === 'completed') {
                    // 完成：100%
                    onProgress({
                        uploadId: data.uploadId,
                        stage: 'processing',
                        percent: 100,
                        loaded: data.loaded || file.size,
                        total: data.total || file.size,
                        speed: data.speed,
                        eta: data.eta,
                    });
                } else if (data.stage === 'error') {
                    // 错误：不更新进度，让调用者处理错误
                    console.error('[RsyncClient] Upload error:', data.error);
                } else if (data.stage === 'receiving') {
                    // receiving 阶段：服务器正在接收数据
                    onProgress({
                        uploadId: data.uploadId,
                        stage: 'uploading',
                        percent: data.percent || 85,
                        loaded: data.loaded || 0,
                        total: data.total || file.size,
                        speed: data.speed,
                        eta: data.eta,
                    });
                } else if (data.stage === 'uploading') {
                    // uploading 阶段：服务器推送的上传进度
                    onProgress({
                        uploadId: data.uploadId,
                        stage: 'uploading',
                        percent: Math.min(data.percent || 0, 90),
                        loaded: data.loaded || 0,
                        total: data.total || file.size,
                        speed: data.speed,
                        eta: data.eta,
                    });
                } else {
                    // processing 阶段：90-100%
                    onProgress({
                        uploadId: data.uploadId,
                        stage: data.stage || 'processing',
                        percent: Math.min(data.percent || 90, 99),
                        loaded: data.loaded || 0,
                        total: data.total || file.size,
                        speed: data.speed,
                        eta: data.eta,
                    });
                }
            }
        } catch (e) {
            console.error('[RsyncClient] Failed to parse WebSocket progress:', e);
        }
    };

    window.addEventListener('minidock:iso_upload_progress', wsHandler as EventListener);

    try {
        // 步骤 1: 上传到临时目录（使用原始二进制流）
        const tempFileName = `${uploadId}-${file.name}`;

        await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', `${API_URL}/vms/services/isos/upload-temp`);
            xhr.setRequestHeader('X-Upload-ID', uploadId);
            // Sanitize filename to prevent header injection (allow safe characters only)
            const safeName = file.name.replace(/[^\w.\-_ ()]/g, '_');
            xhr.setRequestHeader('X-File-Name', safeName);
            xhr.setRequestHeader('Content-Type', 'application/octet-stream');
            
            // 添加认证头
            const token = localStorage.getItem('minidock_token');
            if (token) {
                xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            }

            if (onProgress) {
                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) {
                        const percent = (e.loaded / e.total) * 100;
                        onProgress({
                            uploadId,
                            stage: 'uploading',
                            percent: Math.min(percent * 0.9, 90),
                            loaded: e.loaded,
                            total: e.total,
                        });
                    }
                };
            }

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve();
                } else {
                    reject(new Error(`Upload failed: ${xhr.status}`));
                }
            };

            xhr.onerror = () => {
                reject(new Error('Network error'));
            };
            
            xhr.ontimeout = () => {
                reject(new Error('Upload timeout'));
            };
            xhr.timeout = 300000; // 5 minutes
            xhr.send(file);
        });

        // 步骤 2: 调用后端接口完成处理
        const token = localStorage.getItem('minidock_token');
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'X-Upload-ID': uploadId,
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        const rsyncResponse = await fetch(`${API_URL}/vms/services/isos/upload-rsync`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                tempFileName: tempFileName,
                fileName: file.name,
            }),
        });

        if (!rsyncResponse.ok) {
            const errorText = await rsyncResponse.text();
            throw new Error(`Upload failed: ${rsyncResponse.status} - ${errorText}`);
        }

        // 等待一小段时间，确保 WebSocket 事件能够到达
        await new Promise(resolve => setTimeout(resolve, 500));
    } finally {
        window.removeEventListener('minidock:iso_upload_progress', wsHandler as EventListener);
    }
}

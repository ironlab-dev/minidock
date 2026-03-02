/**
 * 生成 UUID v4
 * 兼容浏览器和 Node.js 环境
 */
export function generateUUID(): string {
    // 优先使用原生 crypto.randomUUID()（如果可用）
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    
    // 降级方案：使用兼容的 UUID v4 生成算法
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

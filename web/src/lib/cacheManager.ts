/**
 * 统一的缓存管理器
 * 提供 TTL、大小限制和自动清理机制
 */

interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttl?: number; // Time to live in milliseconds
}

class CacheManager {
    private cache: Map<string, CacheEntry<unknown>> = new Map();
    private maxSize: number;
    private defaultTTL: number;
    private cleanupInterval: NodeJS.Timeout | null = null;

    constructor(maxSize: number = 50, defaultTTL: number = 5 * 60 * 1000) {
        this.maxSize = maxSize;
        this.defaultTTL = defaultTTL;
        this.startCleanup();
    }

    /**
     * 获取缓存数据
     */
    get<T>(key: string): T | null {
        const entry = this.cache.get(key);
        if (!entry) {
            return null;
        }

        // 检查是否过期
        if (entry.ttl && Date.now() - entry.timestamp > entry.ttl) {
            this.cache.delete(key);
            return null;
        }

        return entry.data as T;
    }

    /**
     * 设置缓存数据
     */
    set<T>(key: string, data: T, ttl?: number): void {
        // 如果超过最大大小，删除最旧的条目
        if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey) {
                this.cache.delete(firstKey);
            }
        }

        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            ttl: ttl || this.defaultTTL
        });
    }

    /**
     * 删除缓存
     */
    delete(key: string): void {
        this.cache.delete(key);
    }

    /**
     * 清空所有缓存
     */
    clear(): void {
        this.cache.clear();
    }

    /**
     * 使缓存失效（删除）
     */
    invalidate(key: string): void {
        this.delete(key);
    }

    /**
     * 启动定期清理过期缓存
     */
    private startCleanup(): void {
        if (this.cleanupInterval) {
            return;
        }

        this.cleanupInterval = setInterval(() => {
            const now = Date.now();
            for (const [key, entry] of Array.from(this.cache.entries())) {
                if (entry.ttl && now - entry.timestamp > entry.ttl) {
                    this.cache.delete(key);
                }
            }
        }, 60000); // 每分钟清理一次
    }

    /**
     * 停止清理
     */
    stopCleanup(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }

    /**
     * 获取缓存条目的时间戳
     */
    getTimestamp(key: string): number | null {
        const entry = this.cache.get(key);
        if (!entry) {
            return null;
        }
        // 检查是否过期
        if (entry.ttl && Date.now() - entry.timestamp > entry.ttl) {
            return null;
        }
        return entry.timestamp;
    }

    /**
     * 获取缓存统计信息
     */
    getStats() {
        return {
            size: this.cache.size,
            maxSize: this.maxSize
        };
    }
}

// 导出单例实例
export const cacheManager = new CacheManager(50, 5 * 60 * 1000); // 最大 50 个条目，默认 5 分钟 TTL



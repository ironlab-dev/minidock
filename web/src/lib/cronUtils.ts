// 简单的cron表达式解析和下一个运行时间计算
export function getNextRunTime(cronExpression: string | undefined): Date | null {
    if (!cronExpression) return null;
    
    try {
        const parts = cronExpression.trim().split(/\s+/);
        if (parts.length !== 5) return null;
        
        const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
        const now = new Date();
        const current = new Date(now);
        
        // 解析分钟
        const parseField = (field: string, min: number, max: number): number[] => {
            if (field === '*') {
                return Array.from({ length: max - min + 1 }, (_, i) => i + min);
            }
            if (field.includes(',')) {
                return field.split(',').map(v => parseInt(v.trim())).filter(v => !isNaN(v) && v >= min && v <= max);
            }
            if (field.includes('-')) {
                const [start, end] = field.split('-').map(v => parseInt(v.trim()));
                if (!isNaN(start) && !isNaN(end) && start >= min && end <= max) {
                    return Array.from({ length: end - start + 1 }, (_, i) => i + start);
                }
            }
            const num = parseInt(field);
            if (!isNaN(num) && num >= min && num <= max) {
                return [num];
            }
            return [];
        };
        
        const minutes = parseField(minute, 0, 59);
        const hours = parseField(hour, 0, 23);
        const days = parseField(dayOfMonth, 1, 31);
        const months = parseField(month, 1, 12);
        const weekdays = parseField(dayOfWeek, 0, 6);
        
        // 如果所有字段都是通配符，返回下一个整点
        if (minute === '*' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
            current.setMinutes(0);
            current.setSeconds(0);
            current.setMilliseconds(0);
            current.setHours(current.getHours() + 1);
            return current;
        }
        
        // 尝试找到下一个匹配的时间（最多查找未来一年）
        for (let i = 0; i < 365 * 24 * 60; i++) {
            current.setMinutes(current.getMinutes() + 1);
            
            const currentMinute = current.getMinutes();
            const currentHour = current.getHours();
            const currentDay = current.getDate();
            const currentMonth = current.getMonth() + 1;
            const currentWeekday = current.getDay();
            
            // 检查是否匹配
            const minuteMatch = minutes.length === 0 || minutes.includes(currentMinute);
            const hourMatch = hours.length === 0 || hours.includes(currentHour);
            const dayMatch = days.length === 0 || days.includes(currentDay);
            const monthMatch = months.length === 0 || months.includes(currentMonth);
            const weekdayMatch = weekdays.length === 0 || weekdays.includes(currentWeekday);
            
            // 如果dayOfMonth和dayOfWeek都指定了，需要同时满足（简化处理）
            if (minuteMatch && hourMatch && monthMatch && (dayMatch || weekdayMatch)) {
                return new Date(current);
            }
        }
        
        return null;
    } catch {
        return null;
    }
}

export function formatTimeAgo(dateString: string | undefined): string {
    if (!dateString) return '';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * 格式化刷新时间显示
 * @param date 刷新时间，可以是 Date 对象或 null
 * @param translations 翻译对象，包含翻译文本
 * @returns 格式化后的时间字符串
 */
export function formatRefreshTime(date: Date | null, translations?: {
    just_now?: string;
    seconds_ago?: string;
    minutes_ago?: string;
    hours_ago?: string;
}): string {
    if (!date) return '';
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    
    // 如果提供了翻译对象，使用中文显示
    if (translations) {
        if (diffSecs < 10) return translations.just_now || '刚刚';
        if (diffMins < 1) {
            const template = translations.seconds_ago || '{n}秒前';
            return template.replace('{n}', String(diffSecs));
        }
        if (diffMins < 60) {
            const template = translations.minutes_ago || '{n}分钟前';
            return template.replace('{n}', String(diffMins));
        }
        if (diffHours < 24) {
            const template = translations.hours_ago || '{n}小时前';
            return template.replace('{n}', String(diffHours));
        }
        // 超过1小时，显示具体时间
        return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
    
    // 默认英文显示
    if (diffSecs < 10) return 'just now';
    if (diffMins < 1) return `${diffSecs}s ago`;
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}


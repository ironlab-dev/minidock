// 异步包装器：将 top-level await 包装在异步函数中
// 这个文件会被构建为 IIFE，暴露一个异步初始化函数

(async function() {
    'use strict';
    
    // 动态导入 noVNC RFB 模块
    const RFBModule = await import('../node_modules/@novnc/novnc/lib/rfb.js');
    const RFB = RFBModule.default;
    
    // 将 RFB 暴露到全局作用域
    if (typeof window !== 'undefined') {
        window.RFB = RFB;
        // 触发自定义事件，通知 RFB 已加载
        window.dispatchEvent(new CustomEvent('novnc-loaded', { detail: { RFB } }));
    }
    
    // 如果使用 UMD，也暴露给模块系统
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = RFB;
    }
    
    return RFB;
})().catch(error => {
    console.error('Failed to load noVNC:', error);
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('novnc-error', { detail: { error } }));
    }
});


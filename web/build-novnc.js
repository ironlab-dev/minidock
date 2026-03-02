const esbuild = require('esbuild');
const path = require('path');

esbuild.build({
    entryPoints: [path.resolve(__dirname, 'scripts/novnc-wrapper-async.js')],
    bundle: true,
    outfile: path.resolve(__dirname, 'public/novnc/rfb.bundle.js'),
    format: 'esm', // ES 模块格式支持 top-level await
    platform: 'browser',
    target: ['es2022'], // es2022 支持 top-level await
    minify: true,
    sourcemap: false,
    banner: {
        js: '// noVNC RFB Client - Built with esbuild (ES module)',
    },
    // 处理 CommonJS
    mainFields: ['browser', 'module', 'main'],
    conditions: ['browser', 'import'],
}).then(() => {
    console.log('✓ noVNC bundle built successfully');
}).catch((error) => {
    console.error('✗ Build failed:', error);
    process.exit(1);
});


export interface DockerConfigTemplate {
    id: string;
    name: string;
    description: string;
    code: string;
    applicableFiles: ('docker-compose.yml' | 'Dockerfile' | '.env')[];
    category: 'ports' | 'volumes' | 'environment' | 'network' | 'deploy' | 'other';
}

export const dockerConfigTemplates: DockerConfigTemplate[] = [
    // 端口映射
    {
        id: 'ports-simple',
        name: '端口映射（简单）',
        description: '将容器端口映射到主机端口',
        code: 'ports:\n  - "8080:80"',
        applicableFiles: ['docker-compose.yml'],
        category: 'ports'
    },
    {
        id: 'ports-multiple',
        name: '多端口映射',
        description: '映射多个端口',
        code: 'ports:\n  - "8080:80"\n  - "8443:443"',
        applicableFiles: ['docker-compose.yml'],
        category: 'ports'
    },
    {
        id: 'ports-range',
        name: '端口范围映射',
        description: '映射端口范围',
        code: 'ports:\n  - "8000-8010:8000-8010"',
        applicableFiles: ['docker-compose.yml'],
        category: 'ports'
    },
    {
        id: 'ports-bind',
        name: '绑定特定 IP',
        description: '将端口绑定到特定主机 IP',
        code: 'ports:\n  - "127.0.0.1:8080:80"',
        applicableFiles: ['docker-compose.yml'],
        category: 'ports'
    },
    
    // 卷映射
    {
        id: 'volume-bind',
        name: '绑定挂载',
        description: '将主机目录挂载到容器',
        code: 'volumes:\n  - ./config:/app/config',
        applicableFiles: ['docker-compose.yml'],
        category: 'volumes'
    },
    {
        id: 'volume-named',
        name: '命名卷',
        description: '使用命名卷进行数据持久化',
        code: 'volumes:\n  - app_data:/app/data',
        applicableFiles: ['docker-compose.yml'],
        category: 'volumes'
    },
    {
        id: 'volume-readonly',
        name: '只读挂载',
        description: '以只读方式挂载卷',
        code: 'volumes:\n  - ./config:/app/config:ro',
        applicableFiles: ['docker-compose.yml'],
        category: 'volumes'
    },
    {
        id: 'volume-top-level',
        name: '定义命名卷（顶层）',
        description: '在顶层定义命名卷',
        code: 'volumes:\n  app_data:\n    driver: local',
        applicableFiles: ['docker-compose.yml'],
        category: 'volumes'
    },
    
    // 环境变量
    {
        id: 'env-simple',
        name: '环境变量（简单）',
        description: '设置单个环境变量',
        code: 'environment:\n  - NODE_ENV=production',
        applicableFiles: ['docker-compose.yml'],
        category: 'environment'
    },
    {
        id: 'env-multiple',
        name: '多个环境变量',
        description: '设置多个环境变量',
        code: 'environment:\n  - NODE_ENV=production\n  - DEBUG=false\n  - PORT=3000',
        applicableFiles: ['docker-compose.yml'],
        category: 'environment'
    },
    {
        id: 'env-file',
        name: '环境变量文件',
        description: '从 .env 文件加载环境变量',
        code: 'env_file:\n  - .env',
        applicableFiles: ['docker-compose.yml'],
        category: 'environment'
    },
    {
        id: 'env-envfile',
        name: '环境变量文件（env_file）',
        description: '使用 env_file 指定环境变量文件',
        code: 'env_file:\n  - .env.production',
        applicableFiles: ['docker-compose.yml'],
        category: 'environment'
    },
    
    // 网络配置
    {
        id: 'network-custom',
        name: '自定义网络',
        description: '使用自定义网络',
        code: 'networks:\n  - custom_network',
        applicableFiles: ['docker-compose.yml'],
        category: 'network'
    },
    {
        id: 'network-top-level',
        name: '定义网络（顶层）',
        description: '在顶层定义自定义网络',
        code: 'networks:\n  custom_network:\n    driver: bridge',
        applicableFiles: ['docker-compose.yml'],
        category: 'network'
    },
    {
        id: 'network-external',
        name: '外部网络',
        description: '使用已存在的外部网络',
        code: 'networks:\n  external_network:\n    external: true',
        applicableFiles: ['docker-compose.yml'],
        category: 'network'
    },
    
    // 部署配置
    {
        id: 'restart-policy',
        name: '重启策略',
        description: '设置容器重启策略',
        code: 'restart: unless-stopped',
        applicableFiles: ['docker-compose.yml'],
        category: 'deploy'
    },
    {
        id: 'resources',
        name: '资源限制',
        description: '限制容器的 CPU 和内存使用',
        code: 'deploy:\n  resources:\n    limits:\n      cpus: \'0.5\'\n      memory: 512M\n    reservations:\n      cpus: \'0.25\'\n      memory: 256M',
        applicableFiles: ['docker-compose.yml'],
        category: 'deploy'
    },
    {
        id: 'healthcheck',
        name: '健康检查',
        description: '配置容器健康检查',
        code: 'healthcheck:\n  test: ["CMD", "curl", "-f", "http://localhost:3000/health"]\n  interval: 30s\n  timeout: 10s\n  retries: 3\n  start_period: 40s',
        applicableFiles: ['docker-compose.yml'],
        category: 'deploy'
    },
    {
        id: 'depends-on',
        name: '服务依赖',
        description: '设置服务启动依赖',
        code: 'depends_on:\n  - db\n  - redis',
        applicableFiles: ['docker-compose.yml'],
        category: 'deploy'
    },
    
    // 其他配置
    {
        id: 'working-dir',
        name: '工作目录',
        description: '设置容器工作目录',
        code: 'working_dir: /app',
        applicableFiles: ['docker-compose.yml'],
        category: 'other'
    },
    {
        id: 'user',
        name: '运行用户',
        description: '指定容器运行的用户',
        code: 'user: "1000:1000"',
        applicableFiles: ['docker-compose.yml'],
        category: 'other'
    },
    {
        id: 'command',
        name: '启动命令',
        description: '覆盖默认启动命令',
        code: 'command: ["npm", "start"]',
        applicableFiles: ['docker-compose.yml'],
        category: 'other'
    },
    {
        id: 'entrypoint',
        name: '入口点',
        description: '设置容器入口点',
        code: 'entrypoint: ["/bin/sh", "-c"]',
        applicableFiles: ['docker-compose.yml'],
        category: 'other'
    },
    
    // Dockerfile 模板
    {
        id: 'dockerfile-from',
        name: '基础镜像',
        description: '指定基础镜像',
        code: 'FROM node:18-alpine',
        applicableFiles: ['Dockerfile'],
        category: 'other'
    },
    {
        id: 'dockerfile-workdir',
        name: '工作目录',
        description: '设置工作目录',
        code: 'WORKDIR /app',
        applicableFiles: ['Dockerfile'],
        category: 'other'
    },
    {
        id: 'dockerfile-copy',
        name: '复制文件',
        description: '复制文件到镜像',
        code: 'COPY package.json ./\nRUN npm install',
        applicableFiles: ['Dockerfile'],
        category: 'other'
    },
    {
        id: 'dockerfile-expose',
        name: '暴露端口',
        description: '声明容器端口',
        code: 'EXPOSE 3000',
        applicableFiles: ['Dockerfile'],
        category: 'ports'
    },
    
    // .env 文件模板
    {
        id: 'env-file-basic',
        name: '基础环境变量',
        description: '定义基础环境变量',
        code: 'NODE_ENV=production\nPORT=3000',
        applicableFiles: ['.env'],
        category: 'environment'
    },
    {
        id: 'env-file-database',
        name: '数据库配置',
        description: '数据库连接配置',
        code: 'DB_HOST=localhost\nDB_PORT=5432\nDB_NAME=mydb\nDB_USER=user\nDB_PASSWORD=password',
        applicableFiles: ['.env'],
        category: 'environment'
    }
];

export const getTemplatesByFile = (fileType: string | null): DockerConfigTemplate[] => {
    if (!fileType) return [];
    const validFileTypes = ['docker-compose.yml', 'Dockerfile', '.env'] as const;
    type ValidFileType = (typeof validFileTypes)[number];
    if (!validFileTypes.includes(fileType as ValidFileType)) return [];
    return dockerConfigTemplates.filter(t => t.applicableFiles.includes(fileType as ValidFileType));
};

export const getTemplatesByCategory = (templates: DockerConfigTemplate[]): Record<string, DockerConfigTemplate[]> => {
    const grouped: Record<string, DockerConfigTemplate[]> = {};
    templates.forEach(template => {
        if (!grouped[template.category]) {
            grouped[template.category] = [];
        }
        grouped[template.category].push(template);
    });
    return grouped;
};


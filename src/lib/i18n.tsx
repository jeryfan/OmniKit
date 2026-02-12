import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// Translation type definitions
// ---------------------------------------------------------------------------

export interface Translations {
  common: {
    save: string;
    cancel: string;
    delete: string;
    edit: string;
    add: string;
    create: string;
    search: string;
    loading: string;
    noData: string;
    actions: string;
    enabled: string;
    disabled: string;
    name: string;
    status: string;
    confirm: string;
    close: string;
    done: string;
    copy: string;
    copied: string;
    previous: string;
    next: string;
    page: (n: number) => string;
    all: string;
    unnamed: string;
    unknownError: string;
  };
  sidebar: {
    dashboard: string;
    channels: string;
    modelMappings: string;
    tokens: string;
    requestLogs: string;
    usageStats: string;
    settings: string;
    toggleTheme: string;
    collapse: string;
    expand: string;
    language: string;
  };
  dashboard: {
    title: string;
    subtitle: string;
    totalRequests: string;
    activeChannels: string;
    activeTokens: string;
    totalModels: string;
    lastNDays: (n: number) => string;
    enabledChannels: string;
    enabledTokens: string;
    modelMappingsCount: string;
    serverStatus: string;
    port: string;
    version: string;
    requestTrend: string;
    requestTrendDesc: string;
    noRequestData: string;
    failedToLoad: string;
    quickStart: string;
    quickStartDesc: string;
    step1: string;
    step2: string;
    step3: string;
    step4: string;
    proxyEndpoint: string;
    availableEndpoints: string;
    curlExample: string;
  };
  channels: {
    title: string;
    subtitle: string;
    addChannel: string;
    editChannel: string;
    addFirstChannel: string;
    noChannels: string;
    loadingChannels: string;
    provider: string;
    baseUrl: string;
    priority: string;
    weight: string;
    manageKeys: string;
    testConnectivity: string;
    testing: string;
    testOk: string;
    testFailed: string;
    deleteChannel: string;
    deleteChannelConfirm: (name: string) => string;
    configureNewChannel: string;
    updateChannelConfig: string;
    namePlaceholder: string;
    selectProvider: string;
    leaveBlankDefault: (url: string) => string;
    lowerPriority: string;
    higherWeight: string;
    keyRotation: string;
    saveChanges: string;
    createChannel: string;
    // API Keys dialog
    apiKeys: string;
    apiKeysFor: (name: string) => string;
    apiKeysDesc: string;
    enterApiKey: string;
    loadingKeys: string;
    noApiKeys: string;
    // Test detail dialog
    testDetail: string;
    request: string;
    response: string;
    method: string;
    url: string;
    headers: string;
    responseHeaders: string;
    responseBody: string;
    statusCode: string;
    networkError: string;
    noApiKey: string;
    send: string;
    addHeader: string;
    headerKey: string;
    headerValue: string;
    saveToChannel: string;
    testConfigSaved: string;
    hasCustomConfig: string;
  };
  modelMappings: {
    title: string;
    subtitle: string;
    addMapping: string;
    editMapping: string;
    noMappings: string;
    noMappingsHint: string;
    publicName: string;
    channel: string;
    actualName: string;
    modality: string;
    publicNamePlaceholder: string;
    publicNameHint: string;
    selectChannel: string;
    noChannelsAvailable: string;
    actualNamePlaceholder: string;
    actualNameHint: string;
    selectModality: string;
    deleteMapping: string;
    deleteMappingConfirm: (name: string) => string;
    updateMappingConfig: string;
    createMappingDesc: string;
    saveChanges: string;
    createMapping: string;
    unknownChannel: string;
  };
  tokens: {
    title: string;
    subtitle: string;
    generateToken: string;
    noTokens: string;
    noTokensHint: string;
    key: string;
    quota: string;
    expiresAt: string;
    allowedModels: string;
    active: string;
    expired: string;
    resetQuota: string;
    // Generate dialog
    generateTitle: string;
    generateDesc: string;
    namePlaceholder: string;
    quotaLimit: string;
    quotaPlaceholder: string;
    expiresAtLabel: string;
    allowedModelsLabel: string;
    allowedModelsPlaceholder: string;
    generate: string;
    // Key reveal dialog
    tokenCreated: string;
    tokenCreatedDesc: string;
    // Edit dialog
    editTitle: string;
    editDesc: string;
    // Delete dialog
    deleteTitle: string;
    deleteDesc: (name: string) => string;
    // Reset quota dialog
    resetQuotaTitle: string;
    resetQuotaDesc: (name: string) => string;
    reset: string;
    unlimited: string;
  };
  requestLogs: {
    title: string;
    subtitle: string;
    clearLogs: string;
    clearLogsTitle: string;
    clearLogsDesc: string;
    clearAll: string;
    filterPlaceholder: string;
    time: string;
    model: string;
    inputOutput: string;
    latency: string;
    tokensCol: string;
    viewDetails: string;
    loadingLogs: string;
    noLogs: string;
    noLogsHint: string;
    noLogsFilterHint: (model: string) => string;
    detailTitle: string;
    detailDesc: string;
    channelId: string;
    tokenId: string;
    conversion: string;
    modalityLabel: string;
    requestBody: string;
    responseBody: string;
    logNotFound: string;
    retry: string;
    retryFailed: string;
    streamingNoBody: string;
    autoRefresh: string;
  };
  usageStats: {
    title: string;
    subtitle: string;
    nDays: (n: number) => string;
    totalRequests: string;
    totalPromptTokens: string;
    totalCompletionTokens: string;
    lastNDays: (n: number) => string;
    tokensTotal: (n: string) => string;
    requestTrend: string;
    requestTrendDesc: (n: number) => string;
    noRequestData: string;
    tokenUsage: string;
    tokenUsageDesc: (n: number) => string;
    noTokenData: string;
    promptTokens: string;
    completionTokens: string;
    modelBreakdown: string;
    modelBreakdownDesc: (n: number) => string;
    noModelData: string;
    requests: string;
    share: string;
    failedToLoad: string;
  };
  settings: {
    title: string;
    subtitle: string;
    serverConfig: string;
    serverConfigDesc: string;
    serverPort: string;
    requiresRestart: string;
    logRetention: string;
    days: string;
    serverStatusLabel: string;
    running: string;
    unknown: string;
    versionLabel: string;
    appearance: string;
    appearanceDesc: string;
    theme: string;
    light: string;
    dark: string;
    system: string;
    languageLabel: string;
    languageDesc: string;
    about: string;
    application: string;
    description: string;
    descriptionText: string;
    license: string;
    techStack: string;
    saveSuccess: string;
    restartHint: string;
    aboutText: string;
  };
}

// ---------------------------------------------------------------------------
// English translations
// ---------------------------------------------------------------------------

const en: Translations = {
  common: {
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    edit: "Edit",
    add: "Add",
    create: "Create",
    search: "Search",
    loading: "Loading...",
    noData: "No data",
    actions: "Actions",
    enabled: "Enabled",
    disabled: "Disabled",
    name: "Name",
    status: "Status",
    confirm: "Confirm",
    close: "Close",
    done: "Done",
    copy: "Copy",
    copied: "Copied",
    previous: "Previous",
    next: "Next",
    page: (n: number) => `Page ${n}`,
    all: "All",
    unnamed: "Unnamed",
    unknownError: "Unknown error",
  },
  sidebar: {
    dashboard: "Dashboard",
    channels: "Channels",
    modelMappings: "Model Mappings",
    tokens: "Tokens",
    requestLogs: "Request Logs",
    usageStats: "Usage Stats",
    settings: "Settings",
    toggleTheme: "Toggle theme",
    collapse: "Collapse sidebar",
    expand: "Expand sidebar",
    language: "Language",
  },
  dashboard: {
    title: "Dashboard",
    subtitle: "Overview of your API gateway status and usage.",
    totalRequests: "Total Requests",
    activeChannels: "Active Channels",
    activeTokens: "Active Tokens",
    totalModels: "Total Models",
    lastNDays: (n: number) => `Last ${n} days`,
    enabledChannels: "Enabled channels",
    enabledTokens: "Enabled tokens",
    modelMappingsCount: "Model mappings",
    serverStatus: "Server Status",
    port: "Port",
    version: "Version",
    requestTrend: "Request Trend",
    requestTrendDesc: "Number of requests over the last 7 days",
    noRequestData: "No request data for the selected period.",
    failedToLoad: "Failed to load dashboard data",
    quickStart: "Quick Start",
    quickStartDesc: "Set up your API gateway in 4 steps.",
    step1: "Add a channel and configure API keys",
    step2: "Create model mappings (public name → upstream model)",
    step3: "Generate a token for client authentication",
    step4: "Point your client to the proxy endpoint below",
    proxyEndpoint: "Proxy Endpoint",
    availableEndpoints: "Available Endpoints",
    curlExample: "Example",
  },
  channels: {
    title: "Channels",
    subtitle: "Manage your API provider channels and their keys.",
    addChannel: "Add Channel",
    editChannel: "Edit Channel",
    addFirstChannel: "Add your first channel",
    noChannels: "No channels configured yet.",
    loadingChannels: "Loading channels...",
    provider: "Provider",
    baseUrl: "Base URL",
    priority: "Priority",
    weight: "Weight",
    manageKeys: "Manage Keys",
    testConnectivity: "Test Connectivity",
    testing: "Testing",
    testOk: "OK",
    testFailed: "Failed",
    deleteChannel: "Delete Channel",
    deleteChannelConfirm: (name: string) =>
      `Are you sure you want to delete ${name}? This action cannot be undone. All associated API keys and model mappings will also be removed.`,
    configureNewChannel: "Configure a new API provider channel.",
    updateChannelConfig: "Update the channel configuration.",
    namePlaceholder: "e.g. OpenAI Primary",
    selectProvider: "Select provider",
    leaveBlankDefault: (url: string) => `Leave blank to use the default: ${url}`,
    lowerPriority: "Lower value = higher priority",
    higherWeight: "Higher = more traffic share",
    keyRotation: "Key Rotation",
    saveChanges: "Save Changes",
    createChannel: "Create Channel",
    apiKeys: "API Keys",
    apiKeysFor: (name: string) => `API Keys — ${name}`,
    apiKeysDesc: "Manage API keys for this channel. Keys are used for authentication with the upstream provider.",
    enterApiKey: "Enter API key (e.g. sk-...)",
    loadingKeys: "Loading keys...",
    noApiKeys: "No API keys added yet.",
    testDetail: "Test Detail",
    request: "Request",
    response: "Response",
    method: "Method",
    url: "URL",
    headers: "Headers",
    responseHeaders: "Response Headers",
    responseBody: "Response Body",
    statusCode: "Status Code",
    networkError: "Network Error",
    noApiKey: "No API key configured",
    send: "Send",
    addHeader: "Add Header",
    headerKey: "Key",
    headerValue: "Value",
    saveToChannel: "Save to Channel",
    testConfigSaved: "Test config saved",
    hasCustomConfig: "Custom test config",
  },
  modelMappings: {
    title: "Model Mappings",
    subtitle: "Configure public model name to upstream model mappings.",
    addMapping: "Add Mapping",
    editMapping: "Edit Model Mapping",
    noMappings: "No model mappings configured",
    noMappingsHint: "Create a mapping to expose a model name to API consumers.",
    publicName: "Public Name",
    channel: "Channel",
    actualName: "Actual Name",
    modality: "Modality",
    publicNamePlaceholder: "e.g. gpt-4o",
    publicNameHint: "The model name exposed to API consumers.",
    selectChannel: "Select a channel",
    noChannelsAvailable: "No channels available",
    actualNamePlaceholder: "e.g. gpt-4o-2024-08-06",
    actualNameHint: "The real model name at the upstream provider.",
    selectModality: "Select modality",
    deleteMapping: "Delete Model Mapping",
    deleteMappingConfirm: (name: string) =>
      `Are you sure you want to delete the mapping for ${name}? This action cannot be undone. API consumers using this model name will no longer be able to access it.`,
    updateMappingConfig: "Update this model mapping configuration.",
    createMappingDesc: "Create a new mapping from a public model name to an upstream provider model.",
    saveChanges: "Save Changes",
    createMapping: "Create Mapping",
    unknownChannel: "Unknown channel",
  },
  tokens: {
    title: "Tokens",
    subtitle: "Manage external API keys and quotas.",
    generateToken: "Generate Token",
    noTokens: "No tokens yet",
    noTokensHint: "Generate a token to get started.",
    key: "Key",
    quota: "Quota",
    expiresAt: "Expires At",
    allowedModels: "Allowed Models",
    active: "Active",
    expired: "Expired",
    resetQuota: "Reset Quota",
    generateTitle: "Generate Token",
    generateDesc: "Create a new API token. The full key will only be shown once after creation.",
    namePlaceholder: "Optional display name",
    quotaLimit: "Quota Limit",
    quotaPlaceholder: "Leave blank for unlimited",
    expiresAtLabel: "Expires At",
    allowedModelsLabel: "Allowed Models",
    allowedModelsPlaceholder: "Comma-separated model names (leave blank for all)",
    generate: "Generate",
    tokenCreated: "Token Created",
    tokenCreatedDesc: "Copy your API key now. This is the only time the full key will be shown.",
    editTitle: "Edit Token",
    editDesc: "Update token settings. The key value cannot be changed.",
    deleteTitle: "Delete Token",
    deleteDesc: (name: string) =>
      `Are you sure you want to delete the token${name ? ` "${name}"` : ""}? This action cannot be undone. Any clients using this key will immediately lose access.`,
    resetQuotaTitle: "Reset Quota",
    resetQuotaDesc: (name: string) =>
      `Reset the used quota for token${name ? ` "${name}"` : ""}? The usage counter will be set back to 0.`,
    reset: "Reset",
    unlimited: "unlimited",
  },
  requestLogs: {
    title: "Request Logs",
    subtitle: "View and inspect request history.",
    clearLogs: "Clear Logs",
    clearLogsTitle: "Clear all request logs?",
    clearLogsDesc: "This action cannot be undone. All request log entries will be permanently deleted.",
    clearAll: "Clear All",
    filterPlaceholder: "Filter by model name...",
    time: "Time",
    model: "Model",
    inputOutput: "Input / Output",
    latency: "Latency",
    tokensCol: "Tokens",
    viewDetails: "View Details",
    loadingLogs: "Loading logs...",
    noLogs: "No request logs found",
    noLogsHint: "Request logs will appear here once the proxy handles requests.",
    noLogsFilterHint: (model: string) => `No logs matching model "${model}".`,
    detailTitle: "Request Log Details",
    detailDesc: "Detailed view of a single request log entry.",
    channelId: "Channel ID",
    tokenId: "Token ID",
    conversion: "Conversion",
    modalityLabel: "Modality",
    requestBody: "Request Body",
    responseBody: "Response Body",
    logNotFound: "Log not found.",
    retry: "Retry",
    retryFailed: "Retry failed",
    streamingNoBody: "Response body is not captured for streaming requests.",
    autoRefresh: "Auto Refresh",
  },
  usageStats: {
    title: "Usage Statistics",
    subtitle: "Token usage, request counts, and model breakdown.",
    nDays: (n: number) => `${n} days`,
    totalRequests: "Total Requests",
    totalPromptTokens: "Total Prompt Tokens",
    totalCompletionTokens: "Total Completion Tokens",
    lastNDays: (n: number) => `Last ${n} days`,
    tokensTotal: (n: string) => `${n} tokens total`,
    requestTrend: "Request Trend",
    requestTrendDesc: (n: number) => `Daily request count over the last ${n} days`,
    noRequestData: "No request data for the selected period.",
    tokenUsage: "Token Usage",
    tokenUsageDesc: (n: number) => `Daily prompt and completion token usage over the last ${n} days`,
    noTokenData: "No token data for the selected period.",
    promptTokens: "Prompt Tokens",
    completionTokens: "Completion Tokens",
    modelBreakdown: "Model Breakdown",
    modelBreakdownDesc: (n: number) => `Request count by model over the last ${n} days`,
    noModelData: "No model usage data for the selected period.",
    requests: "Requests",
    share: "Share",
    failedToLoad: "Failed to load usage statistics",
  },
  settings: {
    title: "Settings",
    subtitle: "View server configuration, customize appearance, and application info.",
    serverConfig: "Server Configuration",
    serverConfigDesc: "Current server settings and status. Configuration is managed via the config file.",
    serverPort: "Server Port",
    requiresRestart: "Requires restart to change",
    logRetention: "Log Retention",
    days: "days",
    serverStatusLabel: "Server Status",
    running: "Running",
    unknown: "Unknown",
    versionLabel: "Version",
    appearance: "Appearance",
    appearanceDesc: "Customize how AnyLLM looks on your device.",
    theme: "Theme",
    light: "Light",
    dark: "Dark",
    system: "System",
    languageLabel: "Language",
    languageDesc: "Select the display language for the application.",
    about: "About",
    application: "Application",
    description: "Description",
    descriptionText: "LLM API Gateway Desktop App",
    license: "License",
    techStack: "Tech Stack",
    aboutText: "AnyLLM converts between LLM provider API formats (OpenAI, Anthropic, Gemini, Moonshot) so you can use any client with any backend.",
    saveSuccess: "Settings saved",
    restartHint: "Restart the app to apply port changes.",
  },
};

// ---------------------------------------------------------------------------
// Chinese translations
// ---------------------------------------------------------------------------

const zh: Translations = {
  common: {
    save: "保存",
    cancel: "取消",
    delete: "删除",
    edit: "编辑",
    add: "添加",
    create: "创建",
    search: "搜索",
    loading: "加载中...",
    noData: "暂无数据",
    actions: "操作",
    enabled: "已启用",
    disabled: "已禁用",
    name: "名称",
    status: "状态",
    confirm: "确认",
    close: "关闭",
    done: "完成",
    copy: "复制",
    copied: "已复制",
    previous: "上一页",
    next: "下一页",
    page: (n: number) => `第 ${n} 页`,
    all: "全部",
    unnamed: "未命名",
    unknownError: "未知错误",
  },
  sidebar: {
    dashboard: "仪表盘",
    channels: "渠道",
    modelMappings: "模型映射",
    tokens: "令牌",
    requestLogs: "请求日志",
    usageStats: "使用统计",
    settings: "设置",
    toggleTheme: "切换主题",
    collapse: "收起侧边栏",
    expand: "展开侧边栏",
    language: "语言",
  },
  dashboard: {
    title: "仪表盘",
    subtitle: "API 网关状态和使用概览。",
    totalRequests: "总请求数",
    activeChannels: "活跃渠道",
    activeTokens: "活跃令牌",
    totalModels: "模型总数",
    lastNDays: (n: number) => `最近 ${n} 天`,
    enabledChannels: "已启用渠道",
    enabledTokens: "已启用令牌",
    modelMappingsCount: "模型映射",
    serverStatus: "服务器状态",
    port: "端口",
    version: "版本",
    requestTrend: "请求趋势",
    requestTrendDesc: "过去 7 天的请求数量",
    noRequestData: "选定时间段内无请求数据。",
    failedToLoad: "加载仪表盘数据失败",
    quickStart: "快速开始",
    quickStartDesc: "4 步配置您的 API 网关。",
    step1: "添加渠道并配置 API 密钥",
    step2: "创建模型映射（公开名称 → 上游模型）",
    step3: "生成用于客户端认证的令牌",
    step4: "将客户端指向下方的代理端点",
    proxyEndpoint: "代理端点",
    availableEndpoints: "可用端点",
    curlExample: "示例",
  },
  channels: {
    title: "渠道",
    subtitle: "管理 API 供应商渠道及其密钥。",
    addChannel: "添加渠道",
    editChannel: "编辑渠道",
    addFirstChannel: "添加第一个渠道",
    noChannels: "尚未配置任何渠道。",
    loadingChannels: "正在加载渠道...",
    provider: "供应商",
    baseUrl: "基础 URL",
    priority: "优先级",
    weight: "权重",
    manageKeys: "管理密钥",
    testConnectivity: "测试连通性",
    testing: "测试中",
    testOk: "通过",
    testFailed: "失败",
    deleteChannel: "删除渠道",
    deleteChannelConfirm: (name: string) =>
      `确定要删除 ${name} 吗？此操作无法撤销。所有关联的 API 密钥和模型映射也将被移除。`,
    configureNewChannel: "配置新的 API 供应商渠道。",
    updateChannelConfig: "更新渠道配置。",
    namePlaceholder: "例如 OpenAI 主渠道",
    selectProvider: "选择供应商",
    leaveBlankDefault: (url: string) => `留空将使用默认值：${url}`,
    lowerPriority: "数值越小优先级越高",
    higherWeight: "数值越大流量占比越高",
    keyRotation: "密钥轮询",
    saveChanges: "保存更改",
    createChannel: "创建渠道",
    apiKeys: "API 密钥",
    apiKeysFor: (name: string) => `API 密钥 — ${name}`,
    apiKeysDesc: "管理此渠道的 API 密钥。密钥用于向上游供应商进行身份验证。",
    enterApiKey: "输入 API 密钥（例如 sk-...）",
    loadingKeys: "正在加载密钥...",
    noApiKeys: "尚未添加 API 密钥。",
    testDetail: "测试详情",
    request: "请求",
    response: "响应",
    method: "方法",
    url: "URL",
    headers: "请求头",
    responseHeaders: "响应头",
    responseBody: "响应体",
    statusCode: "状态码",
    networkError: "网络错误",
    noApiKey: "未配置 API 密钥",
    send: "发送",
    addHeader: "添加请求头",
    headerKey: "键",
    headerValue: "值",
    saveToChannel: "保存到渠道",
    testConfigSaved: "测试配置已保存",
    hasCustomConfig: "自定义测试配置",
  },
  modelMappings: {
    title: "模型映射",
    subtitle: "配置公开模型名称到上游模型的映射。",
    addMapping: "添加映射",
    editMapping: "编辑模型映射",
    noMappings: "尚未配置模型映射",
    noMappingsHint: "创建映射以向 API 消费者公开模型名称。",
    publicName: "公开名称",
    channel: "渠道",
    actualName: "实际名称",
    modality: "模态",
    publicNamePlaceholder: "例如 gpt-4o",
    publicNameHint: "向 API 消费者公开的模型名称。",
    selectChannel: "选择渠道",
    noChannelsAvailable: "无可用渠道",
    actualNamePlaceholder: "例如 gpt-4o-2024-08-06",
    actualNameHint: "上游供应商的实际模型名称。",
    selectModality: "选择模态",
    deleteMapping: "删除模型映射",
    deleteMappingConfirm: (name: string) =>
      `确定要删除 ${name} 的映射吗？此操作无法撤销。使用此模型名称的 API 消费者将无法再访问它。`,
    updateMappingConfig: "更新此模型映射配置。",
    createMappingDesc: "创建从公开模型名称到上游供应商模型的新映射。",
    saveChanges: "保存更改",
    createMapping: "创建映射",
    unknownChannel: "未知渠道",
  },
  tokens: {
    title: "令牌",
    subtitle: "管理外部 API 密钥和配额。",
    generateToken: "生成令牌",
    noTokens: "暂无令牌",
    noTokensHint: "生成一个令牌以开始使用。",
    key: "密钥",
    quota: "配额",
    expiresAt: "过期时间",
    allowedModels: "允许的模型",
    active: "活跃",
    expired: "已过期",
    resetQuota: "重置配额",
    generateTitle: "生成令牌",
    generateDesc: "创建新的 API 令牌。完整密钥仅在创建后显示一次。",
    namePlaceholder: "可选的显示名称",
    quotaLimit: "配额上限",
    quotaPlaceholder: "留空表示无限制",
    expiresAtLabel: "过期时间",
    allowedModelsLabel: "允许的模型",
    allowedModelsPlaceholder: "逗号分隔的模型名称（留空表示全部）",
    generate: "生成",
    tokenCreated: "令牌已创建",
    tokenCreatedDesc: "请立即复制您的 API 密钥。这是唯一一次显示完整密钥的机会。",
    editTitle: "编辑令牌",
    editDesc: "更新令牌设置。密钥值无法更改。",
    deleteTitle: "删除令牌",
    deleteDesc: (name: string) =>
      `确定要删除令牌${name ? ` "${name}"` : ""} 吗？此操作无法撤销。使用此密钥的所有客户端将立即失去访问权限。`,
    resetQuotaTitle: "重置配额",
    resetQuotaDesc: (name: string) =>
      `重置令牌${name ? ` "${name}"` : ""} 的已用配额？使用计数将重置为 0。`,
    reset: "重置",
    unlimited: "无限制",
  },
  requestLogs: {
    title: "请求日志",
    subtitle: "查看和检查请求历史记录。",
    clearLogs: "清空日志",
    clearLogsTitle: "清空所有请求日志？",
    clearLogsDesc: "此操作无法撤销。所有请求日志将被永久删除。",
    clearAll: "全部清空",
    filterPlaceholder: "按模型名称筛选...",
    time: "时间",
    model: "模型",
    inputOutput: "输入 / 输出",
    latency: "延迟",
    tokensCol: "Token 数",
    viewDetails: "查看详情",
    loadingLogs: "正在加载日志...",
    noLogs: "未找到请求日志",
    noLogsHint: "代理处理请求后，日志将显示在此处。",
    noLogsFilterHint: (model: string) => `没有匹配模型 "${model}" 的日志。`,
    detailTitle: "请求日志详情",
    detailDesc: "单条请求日志的详细视图。",
    channelId: "渠道 ID",
    tokenId: "令牌 ID",
    conversion: "转换",
    modalityLabel: "模态",
    requestBody: "请求体",
    responseBody: "响应体",
    logNotFound: "未找到日志。",
    retry: "重试",
    retryFailed: "重试失败",
    streamingNoBody: "流式请求不会捕获响应体。",
    autoRefresh: "自动刷新",
  },
  usageStats: {
    title: "使用统计",
    subtitle: "Token 用量、请求次数和模型分布。",
    nDays: (n: number) => `${n} 天`,
    totalRequests: "总请求数",
    totalPromptTokens: "Prompt Token 总数",
    totalCompletionTokens: "Completion Token 总数",
    lastNDays: (n: number) => `最近 ${n} 天`,
    tokensTotal: (n: string) => `共 ${n} 个 Token`,
    requestTrend: "请求趋势",
    requestTrendDesc: (n: number) => `最近 ${n} 天的每日请求数`,
    noRequestData: "选定时间段内无请求数据。",
    tokenUsage: "Token 用量",
    tokenUsageDesc: (n: number) => `最近 ${n} 天的每日 Prompt 和 Completion Token 用量`,
    noTokenData: "选定时间段内无 Token 数据。",
    promptTokens: "Prompt Token",
    completionTokens: "Completion Token",
    modelBreakdown: "模型分布",
    modelBreakdownDesc: (n: number) => `最近 ${n} 天各模型的请求数`,
    noModelData: "选定时间段内无模型使用数据。",
    requests: "请求数",
    share: "占比",
    failedToLoad: "加载使用统计失败",
  },
  settings: {
    title: "设置",
    subtitle: "查看服务器配置、自定义外观和应用信息。",
    serverConfig: "服务器配置",
    serverConfigDesc: "当前服务器设置和状态。配置通过配置文件管理。",
    serverPort: "服务器端口",
    requiresRestart: "更改需要重启",
    logRetention: "日志保留",
    days: "天",
    serverStatusLabel: "服务器状态",
    running: "运行中",
    unknown: "未知",
    versionLabel: "版本",
    appearance: "外观",
    appearanceDesc: "自定义 AnyLLM 在您设备上的显示方式。",
    theme: "主题",
    light: "浅色",
    dark: "深色",
    system: "跟随系统",
    languageLabel: "语言",
    languageDesc: "选择应用的显示语言。",
    about: "关于",
    application: "应用",
    description: "描述",
    descriptionText: "LLM API 网关桌面应用",
    license: "开源协议",
    techStack: "技术栈",
    aboutText: "AnyLLM 实现各 LLM 供应商 API 格式互转（OpenAI、Anthropic、Gemini、Moonshot），让您可以用任意客户端对接任意后端。",
    saveSuccess: "设置已保存",
    restartHint: "重启应用以使端口更改生效。",
  },
};

// ---------------------------------------------------------------------------
// Language context
// ---------------------------------------------------------------------------

export type Language = "en" | "zh";

const translations: Record<Language, Translations> = { en, zh };

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = "anyllm-language";

function getInitialLanguage(): Language {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "en" || stored === "zh") return stored;
  return "zh";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(getInitialLanguage);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem(STORAGE_KEY, lang);
  }, []);

  const t = translations[language];

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return ctx;
}

import { invoke } from "@tauri-apps/api/core";

// === IPC Error ===

export interface IpcError {
  code: string;
  message: string;
}

export function parseIpcError(err: unknown): IpcError {
  if (typeof err === "object" && err !== null && "code" in err) {
    return err as IpcError;
  }
  return { code: "UNKNOWN", message: String(err) };
}

// === Shared types ===

export interface PaginatedResult<T> {
  items: T[];
  total: number;
}

// === Config types ===

export interface AppConfig {
  server_port: number;
  log_retention_days: number;
}

export interface ServerStatus {
  status: string;
  version?: string;
  message?: string;
}

// === Channel types ===

export interface Channel {
  id: string;
  name: string;
  provider: string;
  base_url: string;
  priority: number;
  weight: number;
  enabled: boolean;
  key_rotation: boolean;
  rate_limit: string | null;
  test_url: string | null;
  test_headers: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChannelApiKey {
  id: string;
  channel_id: string;
  key_value: string;
  enabled: boolean;
  last_used: string | null;
}

// === Model Mapping types ===

export interface ModelMapping {
  id: string;
  public_name: string;
  channel_id: string;
  actual_name: string;
  modality: string;
}

// === Token types ===

export interface Token {
  id: string;
  name: string | null;
  key_value: string;
  quota_limit: number | null;
  quota_used: number;
  expires_at: string | null;
  allowed_models: string | null;
  enabled: boolean;
  created_at: string;
}

// === Request Log types ===

export interface RequestLog {
  id: string;
  token_id: string | null;
  channel_id: string | null;
  model: string | null;
  modality: string | null;
  input_format: string | null;
  output_format: string | null;
  status: number | null;
  latency_ms: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  request_body: string | null;
  response_body: string | null;
  created_at: string;
}

// === Usage Stats types ===

export interface DailyStat {
  date: string;
  count: number;
  prompt_tokens: number;
  completion_tokens: number;
}

export interface ModelStat {
  model: string;
  count: number;
}

export interface UsageStats {
  daily: DailyStat[];
  by_model: ModelStat[];
}

// === Test result ===

export interface TestResult {
  success: boolean;
  request?: {
    method: string;
    url: string;
    headers: Record<string, string>;
    header_templates?: Record<string, string>;
  };
  response?: {
    status: number;
    headers: Record<string, string>;
    body: string;
  };
  error?: string;
}

// === Config commands ===

export async function getConfig(): Promise<AppConfig> {
  return invoke<AppConfig>("get_config");
}

export async function getServerStatus(): Promise<ServerStatus> {
  return invoke<ServerStatus>("get_server_status");
}

export async function updateConfig(data: {
  server_port: number;
  log_retention_days: number;
}): Promise<AppConfig> {
  return invoke<AppConfig>("update_config", {
    serverPort: data.server_port,
    logRetentionDays: data.log_retention_days,
  });
}

// === Channel commands ===

export async function listChannels(): Promise<Channel[]> {
  return invoke<Channel[]>("list_channels");
}

export async function createChannel(data: {
  name: string;
  provider: string;
  base_url: string;
  priority: number;
  weight: number;
}): Promise<Channel> {
  return invoke<Channel>("create_channel", {
    name: data.name,
    provider: data.provider,
    baseUrl: data.base_url,
    priority: data.priority,
    weight: data.weight,
  });
}

export async function updateChannel(data: {
  id: string;
  name: string;
  provider: string;
  base_url: string;
  priority: number;
  weight: number;
  enabled: boolean;
  key_rotation: boolean;
}): Promise<void> {
  return invoke<void>("update_channel", {
    id: data.id,
    name: data.name,
    provider: data.provider,
    baseUrl: data.base_url,
    priority: data.priority,
    weight: data.weight,
    enabled: data.enabled,
    keyRotation: data.key_rotation,
  });
}

export async function deleteChannel(id: string): Promise<void> {
  return invoke<void>("delete_channel", { id });
}

export async function listChannelApiKeys(channelId: string): Promise<ChannelApiKey[]> {
  return invoke<ChannelApiKey[]>("list_channel_api_keys", { channelId });
}

export async function addChannelApiKey(channelId: string, keyValue: string): Promise<ChannelApiKey> {
  return invoke<ChannelApiKey>("add_channel_api_key", { channelId, keyValue });
}

export async function deleteChannelApiKey(id: string): Promise<void> {
  return invoke<void>("delete_channel_api_key", { id });
}

export async function toggleChannelApiKey(id: string, enabled: boolean): Promise<void> {
  return invoke<void>("toggle_channel_api_key", { id, enabled });
}

export async function testChannel(id: string): Promise<TestResult> {
  return invoke<TestResult>("test_channel", { id });
}

export async function testChannelCustom(data: {
  channelId?: string;
  method: string;
  url: string;
  headers: Record<string, string>;
}): Promise<TestResult> {
  return invoke<TestResult>("test_channel_custom", {
    channelId: data.channelId,
    method: data.method,
    url: data.url,
    headers: data.headers,
  });
}

export async function saveChannelTestConfig(data: {
  id: string;
  testUrl?: string | null;
  testHeaders?: string | null;
}): Promise<void> {
  return invoke<void>("save_channel_test_config", {
    id: data.id,
    testUrl: data.testUrl,
    testHeaders: data.testHeaders,
  });
}

// === Token commands ===

export async function listTokens(): Promise<Token[]> {
  return invoke<Token[]>("list_tokens");
}

export async function createToken(data: {
  name?: string | null;
  quota_limit?: number | null;
  expires_at?: string | null;
  allowed_models?: string | null;
}): Promise<Token> {
  return invoke<Token>("create_token", {
    name: data.name,
    quotaLimit: data.quota_limit,
    expiresAt: data.expires_at,
    allowedModels: data.allowed_models,
  });
}

export async function updateToken(data: {
  id: string;
  name?: string | null;
  quota_limit?: number | null;
  expires_at?: string | null;
  allowed_models?: string | null;
  enabled: boolean;
}): Promise<void> {
  return invoke<void>("update_token", {
    id: data.id,
    name: data.name,
    quotaLimit: data.quota_limit,
    expiresAt: data.expires_at,
    allowedModels: data.allowed_models,
    enabled: data.enabled,
  });
}

export async function deleteToken(id: string): Promise<void> {
  return invoke<void>("delete_token", { id });
}

export async function resetTokenQuota(id: string): Promise<void> {
  return invoke<void>("reset_token_quota", { id });
}

// === Model Mapping commands ===

export async function listModelMappings(): Promise<ModelMapping[]> {
  return invoke<ModelMapping[]>("list_model_mappings");
}

export async function createModelMapping(data: {
  public_name: string;
  channel_id: string;
  actual_name: string;
  modality: string;
}): Promise<ModelMapping> {
  return invoke<ModelMapping>("create_model_mapping", {
    publicName: data.public_name,
    channelId: data.channel_id,
    actualName: data.actual_name,
    modality: data.modality,
  });
}

export async function updateModelMapping(data: {
  id: string;
  public_name: string;
  channel_id: string;
  actual_name: string;
  modality: string;
}): Promise<void> {
  return invoke<void>("update_model_mapping", {
    id: data.id,
    publicName: data.public_name,
    channelId: data.channel_id,
    actualName: data.actual_name,
    modality: data.modality,
  });
}

export async function deleteModelMapping(id: string): Promise<void> {
  return invoke<void>("delete_model_mapping", { id });
}

// === Request Log commands ===

export interface RetryResult {
  status: number;
  body: string;
}

export async function listRequestLogs(params?: {
  limit?: number;
  offset?: number;
  model?: string;
}): Promise<PaginatedResult<RequestLog>> {
  return invoke<PaginatedResult<RequestLog>>("list_request_logs", params ?? {});
}

export async function getRequestLog(id: string): Promise<RequestLog | null> {
  return invoke<RequestLog | null>("get_request_log", { id });
}

export async function clearRequestLogs(): Promise<void> {
  return invoke<void>("clear_request_logs");
}

export async function getUsageStats(days?: number): Promise<UsageStats> {
  return invoke<UsageStats>("get_usage_stats", { days });
}

export async function retryRequestLog(id: string): Promise<RetryResult> {
  return invoke<RetryResult>("retry_request_log", { id });
}

// === Proxy Rule types ===

export interface ProxyRule {
  id: string;
  name: string;
  path_prefix: string;
  target_base_url: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProxyLog {
  id: string;
  rule_id: string;
  method: string;
  url: string;
  request_headers: string | null;
  request_body: string | null;
  status: number | null;
  response_headers: string | null;
  response_body: string | null;
  latency_ms: number | null;
  created_at: string;
}

// === Proxy Rule commands ===

export async function listProxyRules(): Promise<ProxyRule[]> {
  return invoke<ProxyRule[]>("list_proxy_rules");
}

export async function createProxyRule(data: {
  name: string;
  path_prefix: string;
  target_base_url: string;
}): Promise<ProxyRule> {
  return invoke<ProxyRule>("create_proxy_rule", {
    name: data.name,
    pathPrefix: data.path_prefix,
    targetBaseUrl: data.target_base_url,
  });
}

export async function updateProxyRule(data: {
  id: string;
  name: string;
  path_prefix: string;
  target_base_url: string;
  enabled: boolean;
}): Promise<void> {
  return invoke<void>("update_proxy_rule", {
    id: data.id,
    name: data.name,
    pathPrefix: data.path_prefix,
    targetBaseUrl: data.target_base_url,
    enabled: data.enabled,
  });
}

export async function deleteProxyRule(id: string): Promise<void> {
  return invoke<void>("delete_proxy_rule", { id });
}

// === Proxy Log commands ===

export async function listProxyLogs(params?: {
  rule_id?: string;
  limit?: number;
  offset?: number;
}): Promise<PaginatedResult<ProxyLog>> {
  return invoke<PaginatedResult<ProxyLog>>("list_proxy_logs", {
    ruleId: params?.rule_id,
    limit: params?.limit,
    offset: params?.offset,
  });
}

export async function getProxyLog(id: string): Promise<ProxyLog | null> {
  return invoke<ProxyLog | null>("get_proxy_log", { id });
}

export async function clearProxyLogs(ruleId?: string): Promise<void> {
  return invoke<void>("clear_proxy_logs", { ruleId });
}

// === Conversion Rule types ===

export interface ConversionRule {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  author: string | null;
  version: string;
  tags: string | null;
  rule_type: string;
  modality: string;
  decode_request: string;
  encode_request: string;
  decode_response: string;
  encode_response: string;
  decode_stream_chunk: string | null;
  encode_stream_chunk: string | null;
  http_config: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

// === Conversion Rule commands ===

export async function listConversionRules(): Promise<ConversionRule[]> {
  return invoke<ConversionRule[]>("list_conversion_rules");
}

export async function getConversionRule(id: string): Promise<ConversionRule> {
  return invoke<ConversionRule>("get_conversion_rule", { id });
}

export async function createConversionRule(data: {
  slug: string;
  name: string;
  description?: string;
  author?: string;
  version?: string;
  tags?: string;
  modality?: string;
  decode_request: string;
  encode_request: string;
  decode_response: string;
  encode_response: string;
  decode_stream_chunk?: string;
  encode_stream_chunk?: string;
  http_config?: string;
}): Promise<ConversionRule> {
  return invoke<ConversionRule>("create_conversion_rule", {
    slug: data.slug,
    name: data.name,
    description: data.description,
    author: data.author,
    version: data.version,
    tags: data.tags,
    modality: data.modality,
    decodeRequest: data.decode_request,
    encodeRequest: data.encode_request,
    decodeResponse: data.decode_response,
    encodeResponse: data.encode_response,
    decodeStreamChunk: data.decode_stream_chunk,
    encodeStreamChunk: data.encode_stream_chunk,
    httpConfig: data.http_config,
  });
}

export async function updateConversionRule(data: {
  id: string;
  slug: string;
  name: string;
  description?: string;
  author?: string;
  version?: string;
  tags?: string;
  modality?: string;
  decode_request: string;
  encode_request: string;
  decode_response: string;
  encode_response: string;
  decode_stream_chunk?: string;
  encode_stream_chunk?: string;
  http_config?: string;
  enabled: boolean;
}): Promise<void> {
  return invoke<void>("update_conversion_rule", {
    id: data.id,
    slug: data.slug,
    name: data.name,
    description: data.description,
    author: data.author,
    version: data.version,
    tags: data.tags,
    modality: data.modality,
    decodeRequest: data.decode_request,
    encodeRequest: data.encode_request,
    decodeResponse: data.decode_response,
    encodeResponse: data.encode_response,
    decodeStreamChunk: data.decode_stream_chunk,
    encodeStreamChunk: data.encode_stream_chunk,
    httpConfig: data.http_config,
    enabled: data.enabled,
  });
}

export async function deleteConversionRule(id: string): Promise<void> {
  return invoke<void>("delete_conversion_rule", { id });
}

export async function duplicateConversionRule(id: string): Promise<ConversionRule> {
  return invoke<ConversionRule>("duplicate_conversion_rule", { id });
}

export async function validateRuleTemplates(data: {
  decode_request: string;
  encode_request: string;
  decode_response: string;
  encode_response: string;
  decode_stream_chunk?: string;
  encode_stream_chunk?: string;
}): Promise<void> {
  return invoke<void>("validate_rule_templates", {
    decodeRequest: data.decode_request,
    encodeRequest: data.encode_request,
    decodeResponse: data.decode_response,
    encodeResponse: data.encode_response,
    decodeStreamChunk: data.decode_stream_chunk,
    encodeStreamChunk: data.encode_stream_chunk,
  });
}

export async function testRuleTemplate(
  expression: string,
  inputJson: string,
): Promise<string> {
  return invoke<string>("test_rule_template", {
    expression,
    inputJson,
  });
}

// === Rule Store commands ===

export interface RuleIndexEntry {
  slug: string;
  name: string;
  description: string;
  author: string;
  version: string;
  tags: string[];
  modality: string;
}

export interface RuleIndex {
  rules: RuleIndexEntry[];
}

export async function fetchRuleStoreIndex(): Promise<RuleIndex> {
  return invoke<RuleIndex>("fetch_rule_store_index");
}

export async function installRuleFromStore(slug: string): Promise<ConversionRule> {
  return invoke<ConversionRule>("install_rule_from_store", { slug });
}

// === AI Rule Generation ===

export interface GeneratedRule {
  name: string;
  slug: string;
  description: string;
  decode_request: string;
  encode_request: string;
  decode_response: string;
  encode_response: string;
  decode_stream_chunk: string;
  encode_stream_chunk: string;
  http_config: string;
}

export async function generateRuleWithAi(
  channelId: string,
  model: string,
  prompt: string,
): Promise<GeneratedRule> {
  return invoke<GeneratedRule>("generate_rule_with_ai", { channelId, model, prompt });
}

// === Video Download ===

export interface VideoInfo {
  title: string;
  cover_url: string | null;
  duration: number | null;
  platform: string;
  formats: VideoFormat[];
}

export interface VideoFormat {
  quality: string;
  url: string;
  audio_url: string | null;
  size: number | null;
}

export interface DownloadProgress {
  task_id: string;
  downloaded: number;
  total: number | null;
  speed: number;
  status: DownloadStatus;
}

export type DownloadStatus =
  | "Downloading"
  | "Completed"
  | "Cancelled"
  | { Failed: string };

export async function parseVideoUrl(url: string): Promise<VideoInfo> {
  return invoke<VideoInfo>("parse_video_url", { url });
}

export async function downloadVideo(params: {
  taskId: string;
  title: string;
  videoUrl: string;
  audioUrl: string | null;
  quality: string;
  saveDir: string | null;
  audioOnly?: boolean;
}): Promise<string> {
  return invoke<string>("download_video", {
    taskId: params.taskId,
    title: params.title,
    videoUrl: params.videoUrl,
    audioUrl: params.audioUrl,
    quality: params.quality,
    saveDir: params.saveDir,
    audioOnly: params.audioOnly ?? false,
  });
}

export async function cancelVideoDownload(taskId: string): Promise<void> {
  return invoke<void>("cancel_video_download", { taskId });
}

export async function openInFolder(path: string): Promise<void> {
  return invoke<void>("open_in_folder", { path });
}

// === Video Records ===

export interface VideoRecord {
  id: string;
  url: string;
  title: string;
  cover_url: string | null;
  duration: number | null;
  platform: string;
  formats: string; // JSON string of VideoFormat[]
  download_status: string; // "pending" | "downloaded" | "failed"
  save_path: string | null;
  created_at: string;
}

export async function saveVideoRecord(params: {
  url: string;
  title: string;
  coverUrl: string | null;
  duration: number | null;
  platform: string;
  formats: string;
}): Promise<VideoRecord> {
  return invoke<VideoRecord>("save_video_record", {
    url: params.url,
    title: params.title,
    coverUrl: params.coverUrl,
    duration: params.duration,
    platform: params.platform,
    formats: params.formats,
  });
}

export async function listVideoRecords(): Promise<VideoRecord[]> {
  return invoke<VideoRecord[]>("list_video_records");
}

export async function deleteVideoRecord(id: string): Promise<void> {
  return invoke<void>("delete_video_record", { id });
}

export async function clearVideoRecords(): Promise<void> {
  return invoke<void>("clear_video_records");
}

export async function updateVideoRecordStatus(params: {
  id: string;
  downloadStatus: string;
  savePath: string | null;
}): Promise<void> {
  return invoke<void>("update_video_record_status", {
    id: params.id,
    downloadStatus: params.downloadStatus,
    savePath: params.savePath,
  });
}

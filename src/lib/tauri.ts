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

// === Route types ===

export interface RouteTargetKey {
  id: string;
  target_id: string;
  key_value: string;
  enabled: boolean;
}

export interface RouteTarget {
  id: string;
  route_id: string;
  upstream_format: string;
  base_url: string;
  weight: number;
  enabled: boolean;
  key_rotation: boolean;
  created_at: string;
  keys: RouteTargetKey[];
}

export interface Route {
  id: string;
  name: string;
  path_prefix: string;
  input_format: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  targets: RouteTarget[];
}

export interface TargetInput {
  upstream_format: string;
  base_url: string;
  weight: number;
  enabled: boolean;
  key_rotation: boolean;
  keys: string[];
}

export const SUPPORTED_FORMATS = [
  { value: "none", label: "None" },
  { value: "anthropic", label: "Anthropic" },
  { value: "openai-chat", label: "OpenAI Chat" },
  { value: "openai-responses", label: "OpenAI Responses" },
  { value: "gemini", label: "Gemini" },
  { value: "moonshot", label: "Moonshot" },
] as const;

// === Route commands ===

export async function listRoutes(): Promise<Route[]> {
  return invoke<Route[]>("list_routes");
}

export async function createRoute(data: {
  name: string;
  path_prefix: string;
  input_format: string;
  enabled: boolean;
  targets: TargetInput[];
}): Promise<Route> {
  return invoke<Route>("create_route", {
    name: data.name,
    pathPrefix: data.path_prefix,
    inputFormat: data.input_format,
    enabled: data.enabled,
    targets: data.targets,
  });
}

export async function updateRoute(data: {
  id: string;
  name: string;
  path_prefix: string;
  input_format: string;
  enabled: boolean;
  targets: TargetInput[];
}): Promise<Route> {
  return invoke<Route>("update_route", {
    id: data.id,
    name: data.name,
    pathPrefix: data.path_prefix,
    inputFormat: data.input_format,
    enabled: data.enabled,
    targets: data.targets,
  });
}

export async function deleteRoute(id: string): Promise<void> {
  return invoke<void>("delete_route", { id });
}

export interface TestRouteResult {
  status: number;
  body: string;
  latency_ms: number;
  error: string | null;
}

export async function testRoute(routeId: string, tokenKey: string): Promise<TestRouteResult> {
  return invoke<TestRouteResult>("test_route", { routeId, tokenKey });
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
  route_id: string | null;
  target_id: string | null;
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
  request_headers: string | null;
  response_headers: string | null;
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

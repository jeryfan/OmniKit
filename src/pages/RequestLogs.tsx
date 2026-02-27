import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Search, Trash2, RotateCcw, Copy, Check, RefreshCw, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  listRequestLogs,
  getRequestLog,
  clearRequestLogs,
  retryRequestLog,
  getConfig,
  listRoutes,
  type RequestLog,
} from "@/lib/tauri";
import { Pagination } from "@/components/ui/pagination";
import { useLanguage } from "@/lib/i18n";
import { PageHeader } from "@/components/page-header";
import { HttpStatusBadge } from "@/components/status-badge";
import { toast } from "sonner";
import { parseIpcError } from "@/lib/tauri";
import CodeEditor from "@/components/CodeEditor";
import HttpTestPanel from "@/components/HttpTestPanel";

const PAGE_SIZE = 20;

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }
  return d.toLocaleString(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDatetimeFull(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatLatency(ms: number | null): string {
  if (ms === null || ms === undefined) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTokens(
  prompt: number | null,
  completion: number | null
): string {
  if (prompt === null && completion === null) return "-";
  return `${prompt ?? 0} / ${completion ?? 0}`;
}

function formatConversion(
  input: string | null,
  output: string | null
): string {
  if (!input && !output) return "-";
  return `${input ?? "?"} \u2192 ${output ?? "?"}`;
}

function detectBodyContent(raw: string | null): { text: string; language: "json" | "text" } {
  if (!raw) return { text: "", language: "text" };
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return { text: JSON.stringify(JSON.parse(trimmed), null, 2), language: "json" };
    } catch {
      // fall through to text
    }
  }
  return { text: raw, language: "text" };
}

export default function RequestLogs({ embedded = false }: { embedded?: boolean }) {
  const { t } = useLanguage();
  const [logs, setLogs] = useState<RequestLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [modelFilter, setModelFilter] = useState("");
  const [appliedFilter, setAppliedFilter] = useState("");
  const [page, setPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState<RequestLog | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [curlCopied, setCurlCopied] = useState(false);
  const [editRetryOpen, setEditRetryOpen] = useState(false);
  const [editRetryKey, setEditRetryKey] = useState(0);
  const [editRetryDefaults, setEditRetryDefaults] = useState<{
    url: string;
    headers: Array<{ key: string; value: string }>;
    body: string;
  }>({ url: "", headers: [], body: "" });
  const [autoRefresh, setAutoRefresh] = useState(false);
  const autoRefreshRef = useRef(autoRefresh);
  autoRefreshRef.current = autoRefresh;
  const [serverPort, setServerPort] = useState(9000);
  const [routeMap, setRouteMap] = useState<Record<string, { name: string; path_prefix: string }>>({});

  useEffect(() => {
    getConfig().then((c) => setServerPort(c.server_port));
    listRoutes()
      .then((routes) => {
        const map: Record<string, { name: string; path_prefix: string }> = {};
        routes.forEach((r) => { map[r.id] = { name: r.name, path_prefix: r.path_prefix }; });
        setRouteMap(map);
      })
      .catch(() => {});
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params: { limit: number; offset: number; model?: string } = {
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      };
      if (appliedFilter.trim()) {
        params.model = appliedFilter.trim();
      }
      const result = await listRequestLogs(params);
      setLogs(result.items);
      setTotal(result.total);
    } catch (err) {
      toast.error(parseIpcError(err).message);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [page, appliedFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      if (autoRefreshRef.current) {
        fetchLogs();
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs]);

  function handleSearch() {
    setPage(1);
    setAppliedFilter(modelFilter);
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      handleSearch();
    }
  }

  async function handleClearLogs() {
    setClearing(true);
    try {
      await clearRequestLogs();
      setPage(1);
      setAppliedFilter("");
      setModelFilter("");
      await fetchLogs();
    } catch (err) {
      toast.error(parseIpcError(err).message);
    } finally {
      setClearing(false);
    }
  }

  async function handleViewDetails(id: string) {
    setDetailLoading(true);
    setDetailOpen(true);
    setCurlCopied(false);
    try {
      const log = await getRequestLog(id);
      setSelectedLog(log);
    } catch (err) {
      toast.error(parseIpcError(err).message);
      setSelectedLog(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleRetry(id: string) {
    setRetrying(id);
    try {
      await retryRequestLog(id);
      await fetchLogs();
    } catch (err) {
      toast.error(parseIpcError(err).message);
    } finally {
      setRetrying(null);
    }
  }

  const FORMAT_SUB_PATH: Record<string, string> = {
    anthropic: "/v1/messages",
    "openai-chat": "/v1/chat/completions",
    moonshot: "/v1/chat/completions",
    "openai-responses": "/v1/responses",
    gemini: "/v1beta/models/gemini-pro:generateContent",
  };

  const HOP_BY_HOP_HEADERS = new Set([
    "host", "connection", "keep-alive", "proxy-authenticate",
    "proxy-authorization", "te", "trailers", "transfer-encoding",
    "upgrade", "content-length",
  ]);

  function buildLogUrl(log: RequestLog): string {
    const subPath = log.input_format
      ? (FORMAT_SUB_PATH[log.input_format] ?? "/v1/chat/completions")
      : "/v1/chat/completions";
    const prefix = log.route_id ? (routeMap[log.route_id]?.path_prefix ?? "") : "";
    return `http://localhost:${serverPort}${prefix}${subPath}`;
  }

  function parseStoredHeaders(headersJson: string | null): Array<{ key: string; value: string }> {
    const fallback = [
      { key: "Authorization", value: "Bearer " },
      { key: "Content-Type", value: "application/json" },
    ];
    if (!headersJson) return fallback;
    try {
      const stored = JSON.parse(headersJson) as Record<string, string>;
      const result = Object.entries(stored)
        .filter(([k]) => !HOP_BY_HOP_HEADERS.has(k.toLowerCase()))
        .map(([key, value]) => ({ key, value }));
      return result.length > 0 ? result : fallback;
    } catch {
      return fallback;
    }
  }

  function buildCurlFromLog(log: RequestLog): string {
    const url = buildLogUrl(log);
    const lines = [`curl -X POST '${url}'`];

    if (log.request_headers) {
      try {
        const stored = JSON.parse(log.request_headers) as Record<string, string>;
        for (const [k, v] of Object.entries(stored)) {
          if (!HOP_BY_HOP_HEADERS.has(k.toLowerCase())) {
            lines.push(`  -H '${k}: ${v}'`);
          }
        }
      } catch {
        lines.push(`  -H 'Authorization: Bearer <your-token>'`);
        lines.push(`  -H 'Content-Type: application/json'`);
      }
    } else {
      lines.push(`  -H 'Authorization: Bearer <your-token>'`);
      lines.push(`  -H 'Content-Type: application/json'`);
    }

    if (log.request_body) {
      try {
        lines.push(`  -d '${JSON.stringify(JSON.parse(log.request_body))}'`);
      } catch {
        lines.push(`  -d '${log.request_body}'`);
      }
    }
    return lines.join(" \\\n");
  }

  function openEditRetry(log: RequestLog) {
    const url = buildLogUrl(log);
    const headers = parseStoredHeaders(log.request_headers);
    const { text: body } = detectBodyContent(log.request_body);
    setEditRetryDefaults({ url, headers, body });
    setEditRetryKey((k) => k + 1);
    setEditRetryOpen(true);
  }

  async function handleCopyCurl() {
    if (!selectedLog) return;
    await navigator.clipboard.writeText(buildCurlFromLog(selectedLog));
    setCurlCopied(true);
    toast.success("cURL 命令已复制");
    setTimeout(() => setCurlCopied(false), 1000);
  }

  const actionButtons = (
    <div className="flex items-center gap-2">
      <Button
        variant={autoRefresh ? "default" : "outline"}
        size="sm"
        onClick={() => setAutoRefresh((v) => !v)}
      >
        <RefreshCw className={autoRefresh ? "animate-spin" : ""} />
        {t.requestLogs.autoRefresh}
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm" disabled={clearing}>
            {clearing ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Trash2 />
            )}
            {t.requestLogs.clearLogs}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.requestLogs.clearLogsTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.requestLogs.clearLogsDesc}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleClearLogs}
            >
              {t.requestLogs.clearAll}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      {!embedded ? (
        <PageHeader
          title={t.requestLogs.title}
          description={t.requestLogs.subtitle}
          actions={actionButtons}
        />
      ) : (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-1">
            <Input
              placeholder={t.requestLogs.filterPlaceholder}
              value={modelFilter}
              onChange={(e) => setModelFilter(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="max-w-[240px] h-8 text-sm"
            />
            <Button variant="outline" size="sm" onClick={handleSearch} className="h-8">
              <Search className="size-3.5" />
              {t.common.search}
            </Button>
          </div>
          {actionButtons}
        </div>
      )}

      {/* Filter bar (non-embedded) */}
      {!embedded && (
        <div className="flex items-center gap-2">
          <Input
            placeholder={t.requestLogs.filterPlaceholder}
            value={modelFilter}
            onChange={(e) => setModelFilter(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="max-w-[240px] h-8 text-sm"
          />
          <Button variant="outline" size="sm" onClick={handleSearch} className="h-8">
            <Search className="size-3.5" />
            {t.common.search}
          </Button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">{t.requestLogs.loadingLogs}</span>
        </div>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <p className="text-sm font-medium">{t.requestLogs.noLogs}</p>
          <p className="mt-1 text-xs">
            {appliedFilter
              ? t.requestLogs.noLogsFilterHint(appliedFilter)
              : t.requestLogs.noLogsHint}
          </p>
        </div>
      ) : (
        <>
          <div className="table-wrapper">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">{t.requestLogs.time}</TableHead>
                <TableHead>{t.requestLogs.model}</TableHead>
                <TableHead className="w-[120px]">{t.requestLogs.inputOutput}</TableHead>
                <TableHead className="w-[70px]">{t.common.status}</TableHead>
                <TableHead className="w-[80px]">{t.requestLogs.latency}</TableHead>
                <TableHead className="w-[100px]">{t.requestLogs.tokensCol}</TableHead>
                <TableHead className="w-[60px] text-right">{t.common.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow
                  key={log.id}
                  className="cursor-pointer h-9"
                  onClick={() => handleViewDetails(log.id)}
                >
                  <TableCell className="text-xs text-muted-foreground tabular-nums py-1.5">
                    {formatTime(log.created_at)}
                  </TableCell>
                  <TableCell className="text-xs font-medium py-1.5">
                    {log.model ?? "-"}
                  </TableCell>
                  <TableCell className="py-1.5">
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <span>{log.input_format ?? "?"}</span>
                      <ArrowRight className="size-2.5" />
                      <span>{log.output_format ?? "?"}</span>
                    </span>
                  </TableCell>
                  <TableCell className="py-1.5">
                    <HttpStatusBadge status={log.status} />
                  </TableCell>
                  <TableCell className="text-xs tabular-nums text-muted-foreground py-1.5">
                    {formatLatency(log.latency_ms)}
                  </TableCell>
                  <TableCell className="text-xs tabular-nums text-muted-foreground py-1.5">
                    {formatTokens(log.prompt_tokens, log.completion_tokens)}
                  </TableCell>
                  <TableCell className="text-right py-1.5" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      disabled={retrying === log.id}
                      onClick={() => handleRetry(log.id)}
                      title={t.requestLogs.retry}
                    >
                      {retrying === log.id ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <RotateCcw className="size-3" />
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
          <Pagination
            current={page}
            total={total}
            pageSize={PAGE_SIZE}
            onChange={setPage}
          />
        </>
      )}

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="w-[80vw] max-w-[80vw] sm:max-w-[80vw] max-h-[92vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <div className="flex items-center justify-between gap-3 pr-6">
              <div className="flex items-center gap-2 min-w-0">
                <DialogTitle className="truncate">
                  {selectedLog?.model ?? t.requestLogs.detailTitle}
                </DialogTitle>
                {selectedLog && <HttpStatusBadge status={selectedLog.status} />}
                {selectedLog && (
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatDatetimeFull(selectedLog.created_at)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {selectedLog && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={handleCopyCurl}
                    >
                      {curlCopied ? (
                        <Check className="mr-1 size-3 text-green-600" />
                      ) : (
                        <Copy className="mr-1 size-3" />
                      )}
                      {curlCopied ? "已复制" : "复制 cURL"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => openEditRetry(selectedLog)}
                    >
                      <RotateCcw className="mr-1 size-3" />
                      编辑重试
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={retrying === selectedLog.id}
                      onClick={() => handleRetry(selectedLog.id)}
                    >
                      {retrying === selectedLog.id ? (
                        <Loader2 className="mr-1 size-3 animate-spin" />
                      ) : (
                        <RotateCcw className="mr-1 size-3" />
                      )}
                      {t.requestLogs.retry}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-4 py-2">
            {detailLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">{t.common.loading}</span>
              </div>
            ) : selectedLog ? (
              <>
                {/* Metadata bar */}
                {(() => {
                  const routeInfo = selectedLog.route_id ? routeMap[selectedLog.route_id] : null;
                  const routeName = routeInfo?.name ?? selectedLog.route_id ?? "-";
                  const logUrl = buildLogUrl(selectedLog);
                  return (
                    <>
                      <div className="flex divide-x divide-border rounded-lg border bg-muted/30 text-xs overflow-hidden">
                        <div className="flex flex-col gap-0.5 px-3 py-2 min-w-0 flex-[2]">
                          <span className="text-muted-foreground text-[10px] uppercase tracking-wide">路由</span>
                          <span className="font-medium truncate">{routeName}</span>
                        </div>
                        <div className="flex flex-col gap-0.5 px-3 py-2 min-w-0 flex-[2]">
                          <span className="text-muted-foreground text-[10px] uppercase tracking-wide">格式</span>
                          <span className="font-medium">{formatConversion(selectedLog.input_format, selectedLog.output_format)}</span>
                        </div>
                        <div className="flex flex-col gap-0.5 px-3 py-2 shrink-0">
                          <span className="text-muted-foreground text-[10px] uppercase tracking-wide">延迟</span>
                          <span className="font-medium tabular-nums">{formatLatency(selectedLog.latency_ms)}</span>
                        </div>
                        <div className="flex flex-col gap-0.5 px-3 py-2 shrink-0">
                          <span className="text-muted-foreground text-[10px] uppercase tracking-wide">Token</span>
                          <span className="font-medium tabular-nums">{formatTokens(selectedLog.prompt_tokens, selectedLog.completion_tokens)}</span>
                        </div>
                      </div>
                      {/* URL row */}
                      <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-1.5 text-xs font-mono">
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-sans font-medium text-muted-foreground">POST</span>
                        <span className="flex-1 truncate select-all">{logUrl}</span>
                      </div>
                    </>
                  );
                })()}

                {/* Request / Response columns */}
                {(() => {
                  const reqHeaders = detectBodyContent(selectedLog.request_headers);
                  const reqBody = detectBodyContent(selectedLog.request_body);
                  const respHeaders = detectBodyContent(selectedLog.response_headers);
                  const respBody = detectBodyContent(selectedLog.response_body);
                  const hasHeaders =
                    !!selectedLog.request_headers || !!selectedLog.response_headers;

                  return (
                    <div className="grid grid-cols-2 gap-4">
                      {/* Request column */}
                      <div className="flex flex-col gap-0">
                        <Tabs defaultValue="body" className="flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold text-foreground">请求</p>
                            {hasHeaders && (
                              <TabsList className="h-6 gap-0 p-0.5">
                                <TabsTrigger value="headers" className="h-5 px-2 text-[11px]">
                                  Headers
                                </TabsTrigger>
                                <TabsTrigger value="body" className="h-5 px-2 text-[11px]">
                                  Body
                                </TabsTrigger>
                              </TabsList>
                            )}
                          </div>
                          {hasHeaders && (
                            <TabsContent value="headers" className="mt-0">
                              {selectedLog.request_headers ? (
                                <CodeEditor
                                  value={reqHeaders.text}
                                  readOnly
                                  language={reqHeaders.language}
                                  minHeight="8rem"
                                  maxHeight="20rem"
                                />
                              ) : (
                                <div className="flex h-20 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground/50">
                                  无记录
                                </div>
                              )}
                            </TabsContent>
                          )}
                          <TabsContent value="body" className="mt-0">
                            <CodeEditor
                              value={reqBody.text}
                              readOnly
                              language={reqBody.language}
                              minHeight="20rem"
                              resizable
                            />
                          </TabsContent>
                        </Tabs>
                      </div>

                      {/* Response column */}
                      <div className="flex flex-col gap-0">
                        <Tabs defaultValue="body" className="flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold text-foreground">响应</p>
                            {hasHeaders && (
                              <TabsList className="h-6 gap-0 p-0.5">
                                <TabsTrigger value="headers" className="h-5 px-2 text-[11px]">
                                  Headers
                                </TabsTrigger>
                                <TabsTrigger value="body" className="h-5 px-2 text-[11px]">
                                  Body
                                </TabsTrigger>
                              </TabsList>
                            )}
                          </div>
                          {hasHeaders && (
                            <TabsContent value="headers" className="mt-0">
                              {selectedLog.response_headers ? (
                                <CodeEditor
                                  value={respHeaders.text}
                                  readOnly
                                  language={respHeaders.language}
                                  minHeight="8rem"
                                  maxHeight="20rem"
                                />
                              ) : (
                                <div className="flex h-20 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground/50">
                                  无记录
                                </div>
                              )}
                            </TabsContent>
                          )}
                          <TabsContent value="body" className="mt-0">
                            <CodeEditor
                              value={respBody.text}
                              readOnly
                              language={respBody.language}
                              minHeight="20rem"
                              resizable
                            />
                          </TabsContent>
                        </Tabs>
                      </div>
                    </div>
                  );
                })()}
              </>
            ) : (
              <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                {t.requestLogs.logNotFound}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit & Retry Dialog */}
      <Dialog open={editRetryOpen} onOpenChange={setEditRetryOpen}>
        <DialogContent className="w-[80vw] max-w-[80vw] sm:max-w-[80vw] max-h-[92vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>编辑重试</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <HttpTestPanel
              key={editRetryKey}
              defaultMethod="POST"
              defaultUrl={editRetryDefaults.url}
              defaultHeaders={editRetryDefaults.headers}
              defaultBody={editRetryDefaults.body}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

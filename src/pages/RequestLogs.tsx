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
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  listRequestLogs,
  getRequestLog,
  clearRequestLogs,
  retryRequestLog,
  type RequestLog,
} from "@/lib/tauri";
import { Pagination } from "@/components/ui/pagination";
import { useLanguage } from "@/lib/i18n";
import { PageHeader } from "@/components/page-header";
import { HttpStatusBadge } from "@/components/status-badge";
import { toast } from "sonner";
import { parseIpcError } from "@/lib/tauri";

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

function prettyJson(raw: string | null): string {
  if (!raw) return "";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
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
  const [copiedTab, setCopiedTab] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const autoRefreshRef = useRef(autoRefresh);
  autoRefreshRef.current = autoRefresh;

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
    setCopiedTab(null);
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

  async function handleCopy(text: string, tab: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedTab(tab);
      setTimeout(() => setCopiedTab(null), 2000);
    } catch (err) {
      toast.error("Failed to copy");
    }
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
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedLog?.model ?? t.requestLogs.detailTitle}
              {selectedLog && <HttpStatusBadge status={selectedLog.status} />}
            </DialogTitle>
            <DialogDescription>
              {selectedLog ? formatDatetimeFull(selectedLog.created_at) : t.requestLogs.detailDesc}
            </DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">{t.common.loading}</span>
            </div>
          ) : selectedLog ? (
            <div className="flex flex-col gap-3 overflow-hidden">
              {/* Compact metadata */}
              <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 text-xs rounded-lg bg-muted/40 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t.requestLogs.latency}</span>
                  <span className="font-medium tabular-nums">{formatLatency(selectedLog.latency_ms)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t.requestLogs.tokensCol}</span>
                  <span className="font-medium tabular-nums">{formatTokens(selectedLog.prompt_tokens, selectedLog.completion_tokens)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t.requestLogs.conversion}</span>
                  <span className="font-medium">{formatConversion(selectedLog.input_format, selectedLog.output_format)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t.requestLogs.channelId}</span>
                  <span className="font-medium truncate ml-2">{selectedLog.channel_id ?? "-"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t.requestLogs.tokenId}</span>
                  <span className="font-medium truncate ml-2">{selectedLog.token_id ?? "-"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t.requestLogs.modalityLabel}</span>
                  <span className="font-medium">{selectedLog.modality ?? "-"}</span>
                </div>
              </div>

              {/* Request / Response tabs */}
              <Tabs defaultValue="request" className="flex-1 overflow-hidden">
                <div className="flex items-center justify-between">
                  <TabsList>
                    <TabsTrigger value="request">{t.requestLogs.requestBody}</TabsTrigger>
                    <TabsTrigger value="response">{t.requestLogs.responseBody}</TabsTrigger>
                  </TabsList>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={retrying === selectedLog.id}
                    onClick={() => handleRetry(selectedLog.id)}
                  >
                    {retrying === selectedLog.id ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <RotateCcw className="size-3" />
                    )}
                    {t.requestLogs.retry}
                  </Button>
                </div>
                <TabsContent
                  value="request"
                  className="overflow-auto max-h-[40vh]"
                >
                  <div className="relative">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="absolute right-2 top-2"
                      onClick={() => handleCopy(prettyJson(selectedLog.request_body) || "", "request")}
                    >
                      {copiedTab === "request" ? (
                        <Check className="size-3" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                    </Button>
                    <pre className="code-block text-[11px] leading-relaxed">
                      {prettyJson(selectedLog.request_body) || "(empty)"}
                    </pre>
                  </div>
                </TabsContent>
                <TabsContent
                  value="response"
                  className="overflow-auto max-h-[40vh]"
                >
                  <div className="relative">
                    {selectedLog.response_body && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="absolute right-2 top-2"
                        onClick={() => handleCopy(prettyJson(selectedLog.response_body) || "", "response")}
                      >
                        {copiedTab === "response" ? (
                          <Check className="size-3" />
                        ) : (
                          <Copy className="size-3" />
                        )}
                      </Button>
                    )}
                    <pre className="code-block text-[11px] leading-relaxed">
                      {prettyJson(selectedLog.response_body) || "(empty)"}
                    </pre>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          ) : (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              {t.requestLogs.logNotFound}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

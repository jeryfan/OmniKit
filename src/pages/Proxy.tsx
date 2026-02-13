import { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Eye,
  RefreshCw,
  MoreHorizontal,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  type ProxyRule,
  type ProxyLog,
  listProxyRules,
  createProxyRule,
  updateProxyRule,
  deleteProxyRule,
  listProxyLogs,
  getProxyLog,
  clearProxyLogs,
  getConfig,
} from "@/lib/tauri";
import { useLanguage } from "@/lib/i18n";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDatetime(iso: string): string {
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
  return `${ms}ms`;
}

function prettyJson(raw: string | null): string {
  if (!raw) return "";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function MethodBadge({ method }: { method: string }) {
  const upper = method.toUpperCase();
  const colorMap: Record<string, string> = {
    GET: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    POST: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    PUT: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
    DELETE: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    PATCH: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  };
  const color = colorMap[upper] ?? "bg-muted text-muted-foreground";
  return <Badge className={color}>{upper}</Badge>;
}

function StatusBadge({ status }: { status: number | null }) {
  if (status === null || status === undefined) {
    return (
      <Badge variant="secondary" className="bg-muted text-muted-foreground">
        N/A
      </Badge>
    );
  }
  if (status >= 200 && status < 300) {
    return (
      <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
        {status}
      </Badge>
    );
  }
  if (status >= 300 && status < 400) {
    return (
      <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
        {status}
      </Badge>
    );
  }
  if (status >= 400 && status < 500) {
    return (
      <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
        {status}
      </Badge>
    );
  }
  if (status >= 500) {
    return <Badge variant="destructive">{status}</Badge>;
  }
  return <Badge variant="outline">{status}</Badge>;
}

// ---------------------------------------------------------------------------
// Clipboard helper for URL copy
// ---------------------------------------------------------------------------

function CopyUrlButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const { t } = useLanguage();

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [url]);

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-6 w-6 shrink-0"
      onClick={(e) => {
        e.stopPropagation();
        handleCopy();
      }}
      title={copied ? t.common.copied : t.common.copy}
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Form state type
// ---------------------------------------------------------------------------

interface RuleFormData {
  name: string;
  path_prefix: string;
  target_base_url: string;
  enabled: boolean;
}

const defaultRuleFormData: RuleFormData = {
  name: "",
  path_prefix: "",
  target_base_url: "",
  enabled: true,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Proxy() {
  const { t } = useLanguage();

  // --- Server port for usage hint ---
  const [serverPort, setServerPort] = useState<number | null>(null);

  useEffect(() => {
    getConfig()
      .then((config) => setServerPort(config.server_port))
      .catch(() => {});
  }, []);

  // =========================================================================
  // Rules state
  // =========================================================================

  const [rules, setRules] = useState<ProxyRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(true);

  // --- Add/Edit dialog state ---
  const [formOpen, setFormOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<ProxyRule | null>(null);
  const [formData, setFormData] = useState<RuleFormData>(defaultRuleFormData);
  const [formSubmitting, setFormSubmitting] = useState(false);

  // --- Delete dialog state ---
  const [deleteTarget, setDeleteTarget] = useState<ProxyRule | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // =========================================================================
  // Logs state
  // =========================================================================

  const [logs, setLogs] = useState<ProxyLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsPage, setLogsPage] = useState(0);
  const [ruleFilter, setRuleFilter] = useState<string>("");
  const [clearing, setClearing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const autoRefreshRef = useRef(autoRefresh);
  autoRefreshRef.current = autoRefresh;

  // --- Detail dialog state ---
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedLog, setSelectedLog] = useState<ProxyLog | null>(null);

  // --- Clear logs confirmation ---
  const [clearDialogOpen, setClearDialogOpen] = useState(false);

  // =========================================================================
  // Fetch rules
  // =========================================================================

  const fetchRules = useCallback(async () => {
    try {
      setRulesLoading(true);
      const data = await listProxyRules();
      setRules(data);
    } catch (err) {
      console.error("Failed to load proxy rules:", err);
    } finally {
      setRulesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  // =========================================================================
  // Fetch logs
  // =========================================================================

  const fetchLogs = useCallback(async (silent = false) => {
    try {
      if (!silent) setLogsLoading(true);
      const params: { rule_id?: string; limit: number; offset: number } = {
        limit: PAGE_SIZE,
        offset: logsPage * PAGE_SIZE,
      };
      if (ruleFilter) {
        params.rule_id = ruleFilter;
      }
      const data = await listProxyLogs(params);
      setLogs(data);
    } catch (err) {
      console.error("Failed to load proxy logs:", err);
      if (!silent) setLogs([]);
    } finally {
      if (!silent) setLogsLoading(false);
    }
  }, [logsPage, ruleFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // --- Auto-refresh effect ---
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      if (autoRefreshRef.current) {
        fetchLogs(true);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs]);

  // =========================================================================
  // Rules handlers
  // =========================================================================

  function openAddDialog() {
    setEditingRule(null);
    setFormData(defaultRuleFormData);
    setFormOpen(true);
  }

  function openEditDialog(rule: ProxyRule) {
    setEditingRule(rule);
    setFormData({
      name: rule.name,
      path_prefix: rule.path_prefix,
      target_base_url: rule.target_base_url,
      enabled: rule.enabled,
    });
    setFormOpen(true);
  }

  async function handleFormSubmit() {
    try {
      setFormSubmitting(true);
      if (editingRule) {
        await updateProxyRule({
          id: editingRule.id,
          name: formData.name,
          path_prefix: formData.path_prefix,
          target_base_url: formData.target_base_url,
          enabled: formData.enabled,
        });
      } else {
        await createProxyRule({
          name: formData.name,
          path_prefix: formData.path_prefix,
          target_base_url: formData.target_base_url,
        });
      }
      setFormOpen(false);
      await fetchRules();
    } catch (err) {
      console.error("Failed to save proxy rule:", err);
    } finally {
      setFormSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      setDeleteSubmitting(true);
      await deleteProxyRule(deleteTarget.id);
      setDeleteTarget(null);
      await fetchRules();
    } catch (err) {
      console.error("Failed to delete proxy rule:", err);
    } finally {
      setDeleteSubmitting(false);
    }
  }

  // =========================================================================
  // Logs handlers
  // =========================================================================

  async function handleClearLogs() {
    setClearing(true);
    try {
      await clearProxyLogs(ruleFilter || undefined);
      setLogsPage(0);
      await fetchLogs();
    } catch (err) {
      console.error("Failed to clear proxy logs:", err);
    } finally {
      setClearing(false);
      setClearDialogOpen(false);
    }
  }

  async function handleViewDetails(id: string) {
    setDetailLoading(true);
    setDetailOpen(true);
    try {
      const log = await getProxyLog(id);
      setSelectedLog(log);
    } catch (err) {
      console.error("Failed to fetch proxy log detail:", err);
      setSelectedLog(null);
    } finally {
      setDetailLoading(false);
    }
  }

  const hasNextPage = logs.length === PAGE_SIZE;
  const hasPrevPage = logsPage > 0;

  // =========================================================================
  // Render
  // =========================================================================

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{t.proxy.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t.proxy.subtitle}
        </p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules">{t.proxy.rules}</TabsTrigger>
          <TabsTrigger value="logs">{t.proxy.logs}</TabsTrigger>
        </TabsList>

        {/* =============================================================== */}
        {/* Rules Tab                                                        */}
        {/* =============================================================== */}
        <TabsContent value="rules" className="space-y-4">
          {/* Rules toolbar */}
          <div className="flex items-center justify-end">
            <Button onClick={openAddDialog}>
              <Plus className="size-4" />
              {t.proxy.addRule}
            </Button>
          </div>

          {/* Rules table */}
          {rulesLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">{t.common.loading}</span>
            </div>
          ) : rules.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
              <p className="text-muted-foreground">{t.proxy.noRules}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t.proxy.noRulesHint}
              </p>
              <Button variant="outline" className="mt-4" onClick={openAddDialog}>
                <Plus className="size-4" />
                {t.proxy.addRule}
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.common.name}</TableHead>
                  <TableHead>{t.proxy.pathPrefix}</TableHead>
                  <TableHead>{t.proxy.targetBaseUrl}</TableHead>
                  <TableHead>{t.proxy.usage}</TableHead>
                  <TableHead className="text-center">{t.common.status}</TableHead>
                  <TableHead className="text-right">{t.common.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">
                      {rule.name || t.common.unnamed}
                    </TableCell>
                    <TableCell>
                      <code className="text-sm font-mono">{rule.path_prefix}</code>
                    </TableCell>
                    <TableCell className="max-w-[260px] truncate text-muted-foreground">
                      {rule.target_base_url}
                    </TableCell>
                    <TableCell>
                      <code className="text-xs font-mono text-muted-foreground">
                        http://127.0.0.1:{serverPort ?? "..."}{rule.path_prefix}
                      </code>
                    </TableCell>
                    <TableCell className="text-center">
                      {rule.enabled ? (
                        <Badge className="bg-green-600 text-white">{t.common.enabled}</Badge>
                      ) : (
                        <Badge variant="secondary">{t.common.disabled}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm">
                            <MoreHorizontal className="size-4" />
                            <span className="sr-only">{t.common.actions}</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditDialog(rule)}>
                            <Pencil className="size-4" />
                            {t.common.edit}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setDeleteTarget(rule)}
                          >
                            <Trash2 className="size-4" />
                            {t.common.delete}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        {/* =============================================================== */}
        {/* Logs Tab                                                         */}
        {/* =============================================================== */}
        <TabsContent value="logs" className="space-y-4">
          {/* Logs toolbar */}
          <div className="flex items-center gap-2">
            <Select
              value={ruleFilter}
              onValueChange={(value) => {
                setRuleFilter(value === "__all__" ? "" : value);
                setLogsPage(0);
              }}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder={t.proxy.filterByRule} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t.proxy.allRules}</SelectItem>
                {rules.map((rule) => (
                  <SelectItem key={rule.id} value={rule.id}>
                    {rule.name || rule.path_prefix}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant={autoRefresh ? "default" : "outline"}
              size="sm"
              onClick={() => setAutoRefresh((v) => !v)}
            >
              <RefreshCw className={autoRefresh ? "animate-spin" : ""} />
              {t.proxy.autoRefresh}
            </Button>

            <div className="flex-1" />

            <Button
              variant="destructive"
              size="sm"
              disabled={clearing}
              onClick={() => setClearDialogOpen(true)}
            >
              {clearing ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Trash2 />
              )}
              {t.proxy.clearLogs}
            </Button>
          </div>

          {/* Logs table */}
          {logsLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">{t.common.loading}</span>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <p className="text-lg font-medium">{t.proxy.noLogs}</p>
              <p className="mt-1 text-sm">{t.proxy.noLogsHint}</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.proxy.time}</TableHead>
                    <TableHead>{t.proxy.method}</TableHead>
                    <TableHead className="w-[300px]">{t.proxy.url}</TableHead>
                    <TableHead>{t.common.status}</TableHead>
                    <TableHead>{t.proxy.latency}</TableHead>
                    <TableHead className="text-right">{t.common.actions}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-muted-foreground">
                        {formatDatetime(log.created_at)}
                      </TableCell>
                      <TableCell>
                        <MethodBadge method={log.method} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 max-w-[280px]">
                          <span className="truncate font-mono text-xs" title={log.url}>
                            {log.url}
                          </span>
                          <CopyUrlButton url={log.url} />
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={log.status} />
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {formatLatency(log.latency_ms)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewDetails(log.id)}
                        >
                          <Eye />
                          {t.proxy.viewDetails}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {t.common.page(logsPage + 1)}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!hasPrevPage}
                    onClick={() => setLogsPage((p) => Math.max(0, p - 1))}
                  >
                    {t.common.previous}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!hasNextPage}
                    onClick={() => setLogsPage((p) => p + 1)}
                  >
                    {t.common.next}
                  </Button>
                </div>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* ================================================================= */}
      {/* Add / Edit Rule Dialog                                             */}
      {/* ================================================================= */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingRule ? t.proxy.editRule : t.proxy.addRule}
            </DialogTitle>
            <DialogDescription>
              {editingRule ? t.proxy.updateRule : t.proxy.createRule}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {/* Name */}
            <div className="grid gap-2">
              <Label htmlFor="rule-name">{t.common.name}</Label>
              <Input
                id="rule-name"
                placeholder={t.proxy.namePlaceholder}
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
              />
            </div>

            {/* Path Prefix */}
            <div className="grid gap-2">
              <Label htmlFor="rule-path-prefix">{t.proxy.pathPrefix}</Label>
              <Input
                id="rule-path-prefix"
                placeholder={t.proxy.pathPrefixPlaceholder}
                value={formData.path_prefix}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, path_prefix: e.target.value }))
                }
              />
            </div>

            {/* Target Base URL */}
            <div className="grid gap-2">
              <Label htmlFor="rule-target-url">{t.proxy.targetBaseUrl}</Label>
              <Input
                id="rule-target-url"
                placeholder={t.proxy.targetBaseUrlPlaceholder}
                value={formData.target_base_url}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, target_base_url: e.target.value }))
                }
              />
            </div>

            {/* Edit-only: Enabled toggle */}
            {editingRule && (
              <div className="flex items-center justify-between rounded-md border p-3">
                <Label htmlFor="rule-enabled" className="cursor-pointer">
                  {t.common.enabled}
                </Label>
                <Switch
                  id="rule-enabled"
                  checked={formData.enabled}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({ ...prev, enabled: !!checked }))
                  }
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setFormOpen(false)}
              disabled={formSubmitting}
            >
              {t.common.cancel}
            </Button>
            <Button
              onClick={handleFormSubmit}
              disabled={
                formSubmitting ||
                !formData.name.trim() ||
                !formData.path_prefix.trim() ||
                !formData.target_base_url.trim()
              }
            >
              {formSubmitting && <Loader2 className="size-4 animate-spin" />}
              {editingRule ? t.proxy.saveChanges : t.proxy.createRule}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================================================================= */}
      {/* Delete Confirmation Dialog                                         */}
      {/* ================================================================= */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.proxy.deleteRule}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.proxy.deleteRuleConfirm(deleteTarget?.name ?? "")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteSubmitting}>
              {t.common.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteSubmitting}
            >
              {deleteSubmitting && <Loader2 className="size-4 animate-spin" />}
              {t.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ================================================================= */}
      {/* Clear Logs Confirmation Dialog                                     */}
      {/* ================================================================= */}
      <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.proxy.clearLogsTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.proxy.clearLogsDesc}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearing}>
              {t.common.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleClearLogs}
              disabled={clearing}
            >
              {clearing && <Loader2 className="size-4 animate-spin" />}
              {t.proxy.clearAll}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ================================================================= */}
      {/* Log Detail Dialog                                                  */}
      {/* ================================================================= */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{t.proxy.detailTitle}</DialogTitle>
            <DialogDescription>
              {selectedLog && (
                <span className="inline-flex items-center gap-2">
                  <MethodBadge method={selectedLog.method} />
                  <StatusBadge status={selectedLog.status} />
                  <span className="font-mono text-xs">{selectedLog.url}</span>
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">{t.common.loading}</span>
            </div>
          ) : selectedLog ? (
            <div className="flex flex-col gap-4 overflow-hidden flex-1">
              {/* Metadata grid */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                <div>
                  <span className="text-muted-foreground">{t.proxy.method}</span>
                  <div className="mt-0.5">
                    <MethodBadge method={selectedLog.method} />
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">{t.common.status}</span>
                  <div className="mt-0.5">
                    <StatusBadge status={selectedLog.status} />
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">{t.proxy.latency}</span>
                  <p className="font-medium tabular-nums">
                    {formatLatency(selectedLog.latency_ms)}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">{t.proxy.time}</span>
                  <p className="font-medium">
                    {formatDatetime(selectedLog.created_at)}
                  </p>
                </div>
              </div>

              {/* URL */}
              <div>
                <span className="text-sm text-muted-foreground">{t.proxy.url}</span>
                <p className="mt-0.5 font-mono text-sm break-all">{selectedLog.url}</p>
              </div>

              {/* Tabs for request/response details */}
              <Tabs defaultValue="req-headers" className="flex-1 overflow-hidden">
                <TabsList>
                  <TabsTrigger value="req-headers">{t.proxy.requestHeaders}</TabsTrigger>
                  <TabsTrigger value="req-body">{t.proxy.requestBody}</TabsTrigger>
                  <TabsTrigger value="res-headers">{t.proxy.responseHeaders}</TabsTrigger>
                  <TabsTrigger value="res-body">{t.proxy.responseBody}</TabsTrigger>
                </TabsList>
                <TabsContent value="req-headers" className="overflow-auto max-h-[40vh]">
                  <pre className="rounded-md bg-muted p-4 text-xs leading-relaxed overflow-auto whitespace-pre-wrap break-all">
                    {prettyJson(selectedLog.request_headers) || "(empty)"}
                  </pre>
                </TabsContent>
                <TabsContent value="req-body" className="overflow-auto max-h-[40vh]">
                  <pre className="rounded-md bg-muted p-4 text-xs leading-relaxed overflow-auto whitespace-pre-wrap break-all">
                    {prettyJson(selectedLog.request_body) || "(empty)"}
                  </pre>
                </TabsContent>
                <TabsContent value="res-headers" className="overflow-auto max-h-[40vh]">
                  <pre className="rounded-md bg-muted p-4 text-xs leading-relaxed overflow-auto whitespace-pre-wrap break-all">
                    {prettyJson(selectedLog.response_headers) || "(empty)"}
                  </pre>
                </TabsContent>
                <TabsContent value="res-body" className="overflow-auto max-h-[40vh]">
                  <pre className="rounded-md bg-muted p-4 text-xs leading-relaxed overflow-auto whitespace-pre-wrap break-all">
                    {prettyJson(selectedLog.response_body) || "(empty)"}
                  </pre>
                </TabsContent>
              </Tabs>
            </div>
          ) : (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              {t.common.noData}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

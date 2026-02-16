import { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Loader2,
  Copy,
  Download,
  Upload,
  FileCode2,
  Play,
  CheckCircle2,
  Store,
  Sparkles,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  type ConversionRule,
  type RuleIndexEntry,
  type Channel,
  listConversionRules,
  createConversionRule,
  updateConversionRule,
  deleteConversionRule,
  duplicateConversionRule,
  validateRuleTemplates,
  testRuleTemplate,
  fetchRuleStoreIndex,
  installRuleFromStore,
  listChannels,
  listChannelApiKeys,
  generateRuleWithAi,
} from "@/lib/tauri";
import { toast } from "sonner";
import { parseIpcError } from "@/lib/tauri";
import { useLanguage } from "@/lib/i18n";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ---------------------------------------------------------------------------
// Form state type
// ---------------------------------------------------------------------------

interface RuleFormData {
  name: string;
  slug: string;
  description: string;
  author: string;
  version: string;
  tags: string;
  modality: string;
  http_config: string;
  decode_request: string;
  encode_request: string;
  decode_response: string;
  encode_response: string;
  decode_stream_chunk: string;
  encode_stream_chunk: string;
  enabled: boolean;
}

const defaultFormData: RuleFormData = {
  name: "",
  slug: "",
  description: "",
  author: "",
  version: "1.0.0",
  tags: "",
  modality: "chat",
  http_config: "",
  decode_request: "",
  encode_request: "",
  decode_response: "",
  encode_response: "",
  decode_stream_chunk: "",
  encode_stream_chunk: "",
  enabled: true,
};

// ---------------------------------------------------------------------------
// Template field definitions for the editor
// ---------------------------------------------------------------------------

const TEMPLATE_FIELDS = [
  { key: "decode_request", required: true },
  { key: "encode_request", required: true },
  { key: "decode_response", required: true },
  { key: "encode_response", required: true },
  { key: "decode_stream_chunk", required: false },
  { key: "encode_stream_chunk", required: false },
] as const;

type TemplateKey = (typeof TEMPLATE_FIELDS)[number]["key"];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Rules({ embedded = false }: { embedded?: boolean }) {
  const { t } = useLanguage();

  // --- Rule list state ---
  const [rules, setRules] = useState<ConversionRule[]>([]);
  const [loading, setLoading] = useState(true);

  // --- Add/Edit dialog state ---
  const [formOpen, setFormOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<ConversionRule | null>(null);
  const [formData, setFormData] = useState<RuleFormData>(defaultFormData);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  // --- Delete dialog state ---
  const [deleteTarget, setDeleteTarget] = useState<ConversionRule | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // --- Test panel state ---
  const [testInput, setTestInput] = useState("");
  const [testTemplate, setTestTemplate] = useState<TemplateKey>("decode_request");
  const [testOutput, setTestOutput] = useState("");
  const [testRunning, setTestRunning] = useState(false);
  const [validating, setValidating] = useState(false);

  // --- Import file input ref ---
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Rule Store state ---
  const [activeTab, setActiveTab] = useState("my-rules");
  const [storeIndex, setStoreIndex] = useState<RuleIndexEntry[]>([]);
  const [storeLoading, setStoreLoading] = useState(false);
  const [storeError, setStoreError] = useState(false);
  const [installingSlug, setInstallingSlug] = useState<string | null>(null);

  // --- AI Generation state ---
  const [aiExpanded, setAiExpanded] = useState(false);
  const [aiChannels, setAiChannels] = useState<Channel[]>([]);
  const [aiChannelId, setAiChannelId] = useState("");
  const [aiModel, setAiModel] = useState("gpt-4o");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);

  // --- Fetch rules ---
  const fetchRules = useCallback(async () => {
    try {
      setLoading(true);
      const data = await listConversionRules();
      setRules(data);
    } catch (err) {
      toast.error(parseIpcError(err).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  // --- Open add dialog ---
  function openAddDialog() {
    setEditingRule(null);
    setFormData(defaultFormData);
    setSlugManuallyEdited(false);
    setTestInput("");
    setTestOutput("");
    setTestTemplate("decode_request");
    setFormOpen(true);
  }

  // --- Open edit dialog ---
  function openEditDialog(rule: ConversionRule) {
    setEditingRule(rule);
    setFormData({
      name: rule.name,
      slug: rule.slug,
      description: rule.description ?? "",
      author: rule.author ?? "",
      version: rule.version,
      tags: rule.tags ?? "",
      modality: rule.modality,
      http_config: rule.http_config ?? "",
      decode_request: rule.decode_request,
      encode_request: rule.encode_request,
      decode_response: rule.decode_response,
      encode_response: rule.encode_response,
      decode_stream_chunk: rule.decode_stream_chunk ?? "",
      encode_stream_chunk: rule.encode_stream_chunk ?? "",
      enabled: rule.enabled,
    });
    setSlugManuallyEdited(true);
    setTestInput("");
    setTestOutput("");
    setTestTemplate("decode_request");
    setFormOpen(true);
  }

  // --- Submit add/edit ---
  async function handleFormSubmit() {
    try {
      setFormSubmitting(true);
      if (editingRule) {
        await updateConversionRule({
          id: editingRule.id,
          slug: formData.slug,
          name: formData.name,
          description: formData.description || undefined,
          author: formData.author || undefined,
          version: formData.version || undefined,
          tags: formData.tags || undefined,
          modality: formData.modality || undefined,
          decode_request: formData.decode_request,
          encode_request: formData.encode_request,
          decode_response: formData.decode_response,
          encode_response: formData.encode_response,
          decode_stream_chunk: formData.decode_stream_chunk || undefined,
          encode_stream_chunk: formData.encode_stream_chunk || undefined,
          http_config: formData.http_config || undefined,
          enabled: formData.enabled,
        });
      } else {
        await createConversionRule({
          slug: formData.slug,
          name: formData.name,
          description: formData.description || undefined,
          author: formData.author || undefined,
          version: formData.version || undefined,
          tags: formData.tags || undefined,
          modality: formData.modality || undefined,
          decode_request: formData.decode_request,
          encode_request: formData.encode_request,
          decode_response: formData.decode_response,
          encode_response: formData.encode_response,
          decode_stream_chunk: formData.decode_stream_chunk || undefined,
          encode_stream_chunk: formData.encode_stream_chunk || undefined,
          http_config: formData.http_config || undefined,
        });
      }
      setFormOpen(false);
      await fetchRules();
    } catch (err) {
      toast.error(parseIpcError(err).message);
    } finally {
      setFormSubmitting(false);
    }
  }

  // --- Delete rule ---
  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      setDeleteSubmitting(true);
      await deleteConversionRule(deleteTarget.id);
      setDeleteTarget(null);
      await fetchRules();
    } catch (err) {
      toast.error(parseIpcError(err).message);
    } finally {
      setDeleteSubmitting(false);
    }
  }

  // --- Duplicate rule ---
  async function handleDuplicate(rule: ConversionRule) {
    try {
      await duplicateConversionRule(rule.id);
      await fetchRules();
      toast.success(t.rules.duplicateRule + " - OK");
    } catch (err) {
      toast.error(parseIpcError(err).message);
    }
  }

  // --- Toggle enabled ---
  async function handleToggleEnabled(rule: ConversionRule, enabled: boolean) {
    try {
      await updateConversionRule({
        id: rule.id,
        slug: rule.slug,
        name: rule.name,
        description: rule.description ?? undefined,
        author: rule.author ?? undefined,
        version: rule.version,
        tags: rule.tags ?? undefined,
        modality: rule.modality,
        decode_request: rule.decode_request,
        encode_request: rule.encode_request,
        decode_response: rule.decode_response,
        encode_response: rule.encode_response,
        decode_stream_chunk: rule.decode_stream_chunk ?? undefined,
        encode_stream_chunk: rule.encode_stream_chunk ?? undefined,
        http_config: rule.http_config ?? undefined,
        enabled,
      });
      await fetchRules();
    } catch (err) {
      toast.error(parseIpcError(err).message);
    }
  }

  // --- Validate templates ---
  async function handleValidate() {
    try {
      setValidating(true);
      await validateRuleTemplates({
        decode_request: formData.decode_request,
        encode_request: formData.encode_request,
        decode_response: formData.decode_response,
        encode_response: formData.encode_response,
        decode_stream_chunk: formData.decode_stream_chunk || undefined,
        encode_stream_chunk: formData.encode_stream_chunk || undefined,
      });
      toast.success(t.rules.validationSuccess);
    } catch (err) {
      toast.error(parseIpcError(err).message);
    } finally {
      setValidating(false);
    }
  }

  // --- Run test ---
  async function handleRunTest() {
    try {
      setTestRunning(true);
      const expression = formData[testTemplate];
      if (!expression) {
        toast.error("Template is empty");
        return;
      }
      const result = await testRuleTemplate(expression, testInput);
      setTestOutput(result);
    } catch (err) {
      setTestOutput(parseIpcError(err).message);
    } finally {
      setTestRunning(false);
    }
  }

  // --- Export single rule ---
  function handleExportRule(rule: ConversionRule) {
    const exportData = {
      slug: rule.slug,
      name: rule.name,
      description: rule.description,
      author: rule.author,
      version: rule.version,
      tags: rule.tags,
      modality: rule.modality,
      decode_request: rule.decode_request,
      encode_request: rule.encode_request,
      decode_response: rule.decode_response,
      encode_response: rule.encode_response,
      decode_stream_chunk: rule.decode_stream_chunk,
      encode_stream_chunk: rule.encode_stream_chunk,
      http_config: rule.http_config,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${rule.slug}.omnikit.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t.rules.exportSuccess);
  }

  // --- Export all user rules ---
  function handleExportAll() {
    const userRules = rules.filter((r) => r.rule_type === "user");
    if (userRules.length === 0) return;
    for (const rule of userRules) {
      handleExportRule(rule);
    }
  }

  // --- Import rule ---
  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await createConversionRule({
        slug: data.slug,
        name: data.name,
        description: data.description || undefined,
        author: data.author || undefined,
        version: data.version || undefined,
        tags: data.tags || undefined,
        modality: data.modality || undefined,
        decode_request: data.decode_request,
        encode_request: data.encode_request,
        decode_response: data.decode_response,
        encode_response: data.encode_response,
        decode_stream_chunk: data.decode_stream_chunk || undefined,
        encode_stream_chunk: data.encode_stream_chunk || undefined,
        http_config: data.http_config || undefined,
      });
      toast.success(t.rules.importSuccess);
      await fetchRules();
    } catch (err) {
      toast.error(parseIpcError(err).message);
    } finally {
      // Reset file input so same file can be re-imported
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  // --- Fetch rule store index ---
  const fetchStore = useCallback(async () => {
    try {
      setStoreLoading(true);
      setStoreError(false);
      const data = await fetchRuleStoreIndex();
      setStoreIndex(data.rules);
    } catch {
      setStoreError(true);
    } finally {
      setStoreLoading(false);
    }
  }, []);

  // Load store when switching to store tab
  useEffect(() => {
    if (activeTab === "store") {
      fetchStore();
    }
  }, [activeTab, fetchStore]);

  // Load channels with API keys when AI section is expanded
  useEffect(() => {
    if (aiExpanded && aiChannels.length === 0) {
      (async () => {
        try {
          const channels = await listChannels();
          // Filter to only channels that have at least one API key
          const channelsWithKeys: Channel[] = [];
          for (const ch of channels) {
            const keys = await listChannelApiKeys(ch.id);
            if (keys.some((k) => k.enabled)) {
              channelsWithKeys.push(ch);
            }
          }
          setAiChannels(channelsWithKeys);
          if (channelsWithKeys.length > 0 && !aiChannelId) {
            setAiChannelId(channelsWithKeys[0].id);
          }
        } catch {
          // silently fail
        }
      })();
    }
  }, [aiExpanded]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Install rule from store ---
  async function handleInstallFromStore(slug: string) {
    try {
      setInstallingSlug(slug);
      await installRuleFromStore(slug);
      await fetchRules();
      toast.success(t.rules.install + " - OK");
    } catch (err) {
      toast.error(parseIpcError(err).message);
    } finally {
      setInstallingSlug(null);
    }
  }

  // --- AI Generate ---
  async function handleAiGenerate() {
    if (!aiChannelId || !aiPrompt.trim()) return;
    try {
      setAiGenerating(true);
      const result = await generateRuleWithAi(aiChannelId, aiModel, aiPrompt);
      setFormData((prev) => ({
        ...prev,
        name: result.name || prev.name,
        slug: result.slug || prev.slug,
        description: result.description || prev.description,
        decode_request: result.decode_request || prev.decode_request,
        encode_request: result.encode_request || prev.encode_request,
        decode_response: result.decode_response || prev.decode_response,
        encode_response: result.encode_response || prev.encode_response,
        decode_stream_chunk: result.decode_stream_chunk || prev.decode_stream_chunk,
        encode_stream_chunk: result.encode_stream_chunk || prev.encode_stream_chunk,
        http_config: result.http_config || prev.http_config,
      }));
      if (result.slug) setSlugManuallyEdited(true);
      toast.success(t.rules.aiGenerateSuccess);
    } catch (err) {
      toast.error(parseIpcError(err).message);
    } finally {
      setAiGenerating(false);
    }
  }

  // --- Check if a rule slug is already installed ---
  function isSlugInstalled(slug: string): boolean {
    return rules.some((r) => r.slug === slug);
  }

  // --- Template label helper ---
  function templateLabel(key: TemplateKey): string {
    const labels: Record<TemplateKey, string> = {
      decode_request: t.rules.decodeRequest,
      encode_request: t.rules.encodeRequest,
      decode_response: t.rules.decodeResponse,
      encode_response: t.rules.encodeResponse,
      decode_stream_chunk: t.rules.decodeStreamChunk,
      encode_stream_chunk: t.rules.encodeStreamChunk,
    };
    return labels[key];
  }

  // =========================================================================
  // Render
  // =========================================================================

  const actionButtons = (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="size-4" />
        {t.rules.importRule}
      </Button>
      <Button
        variant="outline"
        onClick={handleExportAll}
        disabled={rules.filter((r) => r.rule_type === "user").length === 0}
      >
        <Download className="size-4" />
        {t.rules.exportAll}
      </Button>
      <Button onClick={openAddDialog}>
        <Plus className="size-4" />
        {t.rules.createRule}
      </Button>
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.omnikit.json"
        className="hidden"
        onChange={handleImport}
      />

      {/* Header */}
      {!embedded ? (
        <PageHeader
          title={t.rules.title}
          description={t.rules.subtitle}
          actions={actionButtons}
        />
      ) : (
        <div className="flex justify-end">{actionButtons}</div>
      )}

      {/* Tabs: My Rules / Rule Store */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="my-rules">{t.rules.myRules}</TabsTrigger>
          <TabsTrigger value="store">{t.rules.storeTab}</TabsTrigger>
        </TabsList>

        {/* My Rules Tab */}
        <TabsContent value="my-rules">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">
                {t.common.loading}
              </span>
            </div>
          ) : rules.length === 0 ? (
            <EmptyState
              icon={FileCode2}
              title={t.common.noData}
              action={
                <Button variant="outline" onClick={openAddDialog}>
                  <Plus className="size-4" />
                  {t.rules.createRule}
                </Button>
              }
            />
          ) : (
            <div className="table-wrapper">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.common.name}</TableHead>
                    <TableHead>{t.rules.slug}</TableHead>
                    <TableHead className="text-center">{t.rules.ruleType}</TableHead>
                    <TableHead className="text-center">{t.rules.modality}</TableHead>
                    <TableHead className="text-center">{t.rules.version}</TableHead>
                    <TableHead className="text-center">{t.common.status}</TableHead>
                    <TableHead className="text-right">{t.common.actions}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell className="font-medium">{rule.name}</TableCell>
                      <TableCell>
                        <code className="text-sm font-mono text-muted-foreground">
                          {rule.slug}
                        </code>
                      </TableCell>
                      <TableCell className="text-center">
                        {rule.rule_type === "system" ? (
                          <Badge variant="secondary">{t.rules.system}</Badge>
                        ) : (
                          <Badge variant="outline">{t.rules.user}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline">{rule.modality}</Badge>
                      </TableCell>
                      <TableCell className="text-center text-muted-foreground">
                        {rule.version}
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          size="sm"
                          checked={rule.enabled}
                          onCheckedChange={(checked) =>
                            handleToggleEnabled(rule, !!checked)
                          }
                        />
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
                            {rule.rule_type !== "system" && (
                              <DropdownMenuItem
                                onClick={() => openEditDialog(rule)}
                              >
                                <Pencil className="size-4" />
                                {t.common.edit}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => handleDuplicate(rule)}
                            >
                              <Copy className="size-4" />
                              {t.rules.duplicateRule}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleExportRule(rule)}
                            >
                              <Download className="size-4" />
                              {t.rules.exportRule}
                            </DropdownMenuItem>
                            {rule.rule_type !== "system" && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={() => setDeleteTarget(rule)}
                                >
                                  <Trash2 className="size-4" />
                                  {t.common.delete}
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Rule Store Tab */}
        <TabsContent value="store">
          {storeLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">
                {t.rules.storeLoading}
              </span>
            </div>
          ) : storeError ? (
            <EmptyState
              icon={Store}
              title={t.rules.storeFetchError}
            />
          ) : storeIndex.length === 0 ? (
            <EmptyState
              icon={Store}
              title={t.rules.storeEmpty}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {storeIndex.map((entry) => {
                const installed = isSlugInstalled(entry.slug);
                const installing = installingSlug === entry.slug;
                return (
                  <div
                    key={entry.slug}
                    className="rounded-lg border bg-card p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 min-w-0">
                        <h3 className="font-semibold text-sm truncate">
                          {entry.name}
                        </h3>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {entry.description}
                        </p>
                      </div>
                      {installed ? (
                        <Badge variant="secondary" className="shrink-0">
                          {t.rules.installed}
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          className="shrink-0"
                          disabled={installing}
                          onClick={() => handleInstallFromStore(entry.slug)}
                        >
                          {installing && (
                            <Loader2 className="size-3 animate-spin" />
                          )}
                          {installing ? t.rules.installing : t.rules.install}
                        </Button>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px]">
                        {entry.modality}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        v{entry.version}
                      </span>
                      {entry.author && (
                        <span className="text-[10px] text-muted-foreground">
                          {entry.author}
                        </span>
                      )}
                    </div>
                    {entry.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {entry.tags.map((tag) => (
                          <Badge
                            key={tag}
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0"
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ================================================================= */}
      {/* Add / Edit Dialog                                                  */}
      {/* ================================================================= */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {editingRule ? t.rules.editRule : t.rules.createRule}
            </DialogTitle>
            <DialogDescription>
              {editingRule
                ? t.rules.editRule
                : t.rules.createRule}
            </DialogDescription>
          </DialogHeader>

          {/* AI Generation Section */}
          {!editingRule && (
            <div className="rounded-md border">
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-muted/50 transition-colors"
                onClick={() => setAiExpanded((v) => !v)}
              >
                {aiExpanded ? (
                  <ChevronDown className="size-4" />
                ) : (
                  <ChevronRight className="size-4" />
                )}
                <Sparkles className="size-4 text-amber-500" />
                {t.rules.aiGenerate}
              </button>
              {aiExpanded && (
                <div className="border-t px-3 py-3 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    {t.rules.aiGenerateDesc}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5">
                      <Label className="text-xs">{t.rules.selectChannel}</Label>
                      <Select
                        value={aiChannelId}
                        onValueChange={setAiChannelId}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder={t.rules.selectChannel} />
                        </SelectTrigger>
                        <SelectContent>
                          {aiChannels.map((ch) => (
                            <SelectItem key={ch.id} value={ch.id}>
                              {ch.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs">{t.rules.modelName}</Label>
                      <Input
                        className="h-8 text-xs"
                        value={aiModel}
                        onChange={(e) => setAiModel(e.target.value)}
                        placeholder="gpt-4o"
                      />
                    </div>
                  </div>
                  <div className="grid gap-1.5">
                    <textarea
                      className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y"
                      rows={2}
                      placeholder={t.rules.aiPromptPlaceholder}
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                    />
                  </div>
                  <Button
                    size="sm"
                    onClick={handleAiGenerate}
                    disabled={
                      aiGenerating ||
                      !aiChannelId ||
                      !aiPrompt.trim() ||
                      !aiModel.trim()
                    }
                  >
                    {aiGenerating ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Sparkles className="size-3" />
                    )}
                    {aiGenerating ? t.rules.generating : t.rules.aiGenerate}
                  </Button>
                </div>
              )}
            </div>
          )}

          <Tabs defaultValue="basic" className="flex-1 flex flex-col min-h-0">
            <TabsList className="w-fit">
              <TabsTrigger value="basic">{t.rules.basicInfo}</TabsTrigger>
              <TabsTrigger value="templates">{t.rules.templates}</TabsTrigger>
              <TabsTrigger value="test">{t.rules.testPanel}</TabsTrigger>
            </TabsList>

            {/* ---- Tab: Basic Info ---- */}
            <TabsContent value="basic" className="flex-1 overflow-y-auto mt-4">
              <div className="space-y-4">
                {/* Name + Slug */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="rule-name">
                      {t.common.name} <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="rule-name"
                      value={formData.name}
                      onChange={(e) => {
                        const name = e.target.value;
                        setFormData((prev) => ({
                          ...prev,
                          name,
                          slug: slugManuallyEdited ? prev.slug : slugify(name),
                        }));
                      }}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="rule-slug">
                      {t.rules.slug} <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="rule-slug"
                      value={formData.slug}
                      onChange={(e) => {
                        setSlugManuallyEdited(true);
                        setFormData((prev) => ({
                          ...prev,
                          slug: e.target.value,
                        }));
                      }}
                    />
                  </div>
                </div>

                {/* Description */}
                <div className="grid gap-2">
                  <Label htmlFor="rule-desc">{t.settings.description}</Label>
                  <textarea
                    id="rule-desc"
                    className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    rows={2}
                    value={formData.description}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                  />
                </div>

                {/* Author + Version + Tags */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="rule-author">{t.rules.author}</Label>
                    <Input
                      id="rule-author"
                      value={formData.author}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          author: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="rule-version">{t.rules.version}</Label>
                    <Input
                      id="rule-version"
                      value={formData.version}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          version: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="rule-tags">{t.rules.tags}</Label>
                    <Input
                      id="rule-tags"
                      placeholder="e.g. openai, chat"
                      value={formData.tags}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          tags: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                {/* Modality + Enabled */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="rule-modality">{t.rules.modality}</Label>
                    <Select
                      value={formData.modality}
                      onValueChange={(value) =>
                        setFormData((prev) => ({ ...prev, modality: value }))
                      }
                    >
                      <SelectTrigger id="rule-modality" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="chat">chat</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {editingRule && (
                    <div className="flex items-center justify-between rounded-md border p-3 self-end">
                      <Label htmlFor="rule-enabled" className="cursor-pointer">
                        {t.common.enabled}
                      </Label>
                      <Switch
                        id="rule-enabled"
                        checked={formData.enabled}
                        onCheckedChange={(checked) =>
                          setFormData((prev) => ({
                            ...prev,
                            enabled: !!checked,
                          }))
                        }
                      />
                    </div>
                  )}
                </div>

                {/* HTTP Config */}
                <div className="grid gap-2">
                  <Label htmlFor="rule-http-config">
                    {t.rules.httpConfig}{" "}
                    <span className="text-xs text-muted-foreground">
                      ({t.rules.optional})
                    </span>
                  </Label>
                  <textarea
                    id="rule-http-config"
                    className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    rows={3}
                    placeholder='{"auth_header_template": "Bearer {{key}}", "url_template": "...", "content_type": "application/json"}'
                    value={formData.http_config}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        http_config: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            </TabsContent>

            {/* ---- Tab: Templates ---- */}
            <TabsContent value="templates" className="flex-1 overflow-y-auto mt-4">
              <div className="space-y-4">
                {/* Required templates: 2 columns */}
                <div className="grid grid-cols-2 gap-4">
                  {TEMPLATE_FIELDS.filter((f) => f.required).map((field) => (
                    <div key={field.key} className="grid gap-1.5">
                      <Label htmlFor={`rule-${field.key}`} className="text-xs">
                        {templateLabel(field.key)}{" "}
                        <span className="text-destructive">*</span>
                      </Label>
                      <textarea
                        id={`rule-${field.key}`}
                        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                        rows={6}
                        value={formData[field.key]}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            [field.key]: e.target.value,
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>

                {/* Optional stream templates: 2 columns */}
                <Separator />
                <div className="grid grid-cols-2 gap-4">
                  {TEMPLATE_FIELDS.filter((f) => !f.required).map((field) => (
                    <div key={field.key} className="grid gap-1.5">
                      <Label htmlFor={`rule-${field.key}`} className="text-xs">
                        {templateLabel(field.key)}{" "}
                        <span className="text-muted-foreground">
                          ({t.rules.optional})
                        </span>
                      </Label>
                      <textarea
                        id={`rule-${field.key}`}
                        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                        rows={5}
                        value={formData[field.key]}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            [field.key]: e.target.value,
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* ---- Tab: Test ---- */}
            <TabsContent value="test" className="flex-1 overflow-y-auto mt-4">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleValidate}
                    disabled={validating}
                  >
                    {validating ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <CheckCircle2 className="size-3" />
                    )}
                    {t.rules.validate}
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Left: input + controls */}
                  <div className="space-y-3">
                    <div className="grid gap-1.5">
                      <Label className="text-xs">{t.rules.testInput}</Label>
                      <textarea
                        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y"
                        rows={10}
                        placeholder='{"model": "gpt-4", "messages": [...]}'
                        value={testInput}
                        onChange={(e) => setTestInput(e.target.value)}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={testTemplate}
                        onValueChange={(v) => setTestTemplate(v as TemplateKey)}
                      >
                        <SelectTrigger className="flex-1 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TEMPLATE_FIELDS.map((field) => (
                            <SelectItem key={field.key} value={field.key}>
                              {templateLabel(field.key)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        onClick={handleRunTest}
                        disabled={testRunning || !testInput.trim()}
                      >
                        {testRunning ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Play className="size-3" />
                        )}
                        {t.rules.runTest}
                      </Button>
                    </div>
                  </div>

                  {/* Right: output */}
                  <div className="grid gap-1.5">
                    <Label className="text-xs">{t.rules.testOutput}</Label>
                    <pre className="rounded-md border bg-muted/50 p-3 text-xs font-mono overflow-auto max-h-[320px] min-h-[260px] whitespace-pre-wrap break-all">
                      {testOutput || ""}
                    </pre>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>

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
                !formData.slug.trim() ||
                !formData.decode_request.trim() ||
                !formData.encode_request.trim() ||
                !formData.decode_response.trim() ||
                !formData.encode_response.trim()
              }
            >
              {formSubmitting && <Loader2 className="size-4 animate-spin" />}
              {editingRule ? t.common.save : t.rules.createRule}
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
            <AlertDialogTitle>{t.rules.deleteRule}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.rules.confirmDelete}
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
    </div>
  );
}

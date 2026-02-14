import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Zap,
  KeyRound,
  Loader2,
  CheckCircle2,
  XCircle,
  Copy,
  Eye,
  EyeOff,
  Send,
  Save,
  Network,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  type Channel,
  type ChannelApiKey,
  type TestResult,
  listChannels,
  createChannel,
  updateChannel,
  deleteChannel,
  listChannelApiKeys,
  addChannelApiKey,
  deleteChannelApiKey,
  toggleChannelApiKey,
  testChannel,
  testChannelCustom,
  saveChannelTestConfig,
} from "@/lib/tauri";
import { toast } from "sonner";
import { parseIpcError } from "@/lib/tauri";
import { useLanguage } from "@/lib/i18n";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROVIDERS = ["openai", "anthropic", "gemini", "moonshot"] as const;
type Provider = (typeof PROVIDERS)[number];

const PROVIDER_DEFAULT_URLS: Record<Provider, string> = {
  openai: "https://api.openai.com",
  anthropic: "https://api.anthropic.com",
  gemini: "https://generativelanguage.googleapis.com",
  moonshot: "https://api.moonshot.cn",
};

const PROVIDER_LABELS: Record<Provider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Gemini",
  moonshot: "Moonshot",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function maskKey(key: string): string {
  if (key.length <= 4) return key;
  return "****" + key.slice(-4);
}

// ---------------------------------------------------------------------------
// Form state type
// ---------------------------------------------------------------------------

interface ChannelFormData {
  name: string;
  provider: Provider;
  base_url: string;
  priority: number;
  weight: number;
  enabled: boolean;
  key_rotation: boolean;
}

const defaultFormData: ChannelFormData = {
  name: "",
  provider: "openai",
  base_url: "",
  priority: 0,
  weight: 1,
  enabled: true,
  key_rotation: false,
};

// ---------------------------------------------------------------------------
// Test result state per channel
// ---------------------------------------------------------------------------

interface TestState {
  loading: boolean;
  result: TestResult | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Channels() {
  const { t } = useLanguage();

  // --- Channel list state ---
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);

  // --- Add/Edit dialog state ---
  const [formOpen, setFormOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [formData, setFormData] = useState<ChannelFormData>(defaultFormData);
  const [formSubmitting, setFormSubmitting] = useState(false);

  // --- Delete dialog state ---
  const [deleteTarget, setDeleteTarget] = useState<Channel | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // --- API Keys dialog state ---
  const [keysChannel, setKeysChannel] = useState<Channel | null>(null);
  const [keys, setKeys] = useState<ChannelApiKey[]>([]);
  const [keysLoading, setKeysLoading] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState("");
  const [addingKey, setAddingKey] = useState(false);
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());

  // --- Test state per channel ---
  const [testStates, setTestStates] = useState<Record<string, TestState>>({});

  // --- Test detail dialog state ---
  const [testDetailChannel, setTestDetailChannel] = useState<Channel | null>(null);
  const [testDetailLoading, setTestDetailLoading] = useState(false);
  const [testDetailResult, setTestDetailResult] = useState<TestResult | null>(null);

  // --- Editable test form state ---
  const [testFormUrl, setTestFormUrl] = useState("");
  const [testFormHeaders, setTestFormHeaders] = useState<{ key: string; value: string }[]>([]);
  const [testFormSending, setTestFormSending] = useState(false);
  const [testConfigSaving, setTestConfigSaving] = useState(false);
  const [testConfigSaved, setTestConfigSaved] = useState(false);

  // --- Fetch channels ---
  const fetchChannels = useCallback(async () => {
    try {
      setLoading(true);
      const data = await listChannels();
      setChannels(data);
    } catch (err) {
      toast.error(parseIpcError(err).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  // --- Fetch API keys for a channel ---
  const fetchKeys = useCallback(async (channelId: string) => {
    try {
      setKeysLoading(true);
      const data = await listChannelApiKeys(channelId);
      setKeys(data);
    } catch (err) {
      toast.error(parseIpcError(err).message);
    } finally {
      setKeysLoading(false);
    }
  }, []);

  // --- Open add dialog ---
  function openAddDialog() {
    setEditingChannel(null);
    setFormData(defaultFormData);
    setFormOpen(true);
  }

  // --- Open edit dialog ---
  function openEditDialog(channel: Channel) {
    setEditingChannel(channel);
    setFormData({
      name: channel.name,
      provider: channel.provider as Provider,
      base_url: channel.base_url,
      priority: channel.priority,
      weight: channel.weight,
      enabled: channel.enabled,
      key_rotation: channel.key_rotation,
    });
    setFormOpen(true);
  }

  // --- Submit add/edit ---
  async function handleFormSubmit() {
    try {
      setFormSubmitting(true);
      if (editingChannel) {
        await updateChannel({
          id: editingChannel.id,
          name: formData.name,
          provider: formData.provider,
          base_url: formData.base_url || PROVIDER_DEFAULT_URLS[formData.provider],
          priority: formData.priority,
          weight: formData.weight,
          enabled: formData.enabled,
          key_rotation: formData.key_rotation,
        });
      } else {
        await createChannel({
          name: formData.name,
          provider: formData.provider,
          base_url: formData.base_url || PROVIDER_DEFAULT_URLS[formData.provider],
          priority: formData.priority,
          weight: formData.weight,
        });
      }
      setFormOpen(false);
      await fetchChannels();
    } catch (err) {
      toast.error(parseIpcError(err).message);
    } finally {
      setFormSubmitting(false);
    }
  }

  // --- Delete channel ---
  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      setDeleteSubmitting(true);
      await deleteChannel(deleteTarget.id);
      setDeleteTarget(null);
      await fetchChannels();
    } catch (err) {
      toast.error(parseIpcError(err).message);
    } finally {
      setDeleteSubmitting(false);
    }
  }

  // --- Test channel ---
  async function handleTest(channel: Channel) {
    // Open the test detail dialog and auto-run
    setTestDetailChannel(channel);
    setTestDetailLoading(true);
    setTestDetailResult(null);
    setTestFormUrl("");
    setTestFormHeaders([]);
    setTestConfigSaved(false);

    // Also update inline badge state
    setTestStates((prev) => ({
      ...prev,
      [channel.id]: { loading: true, result: null },
    }));
    try {
      const result = await testChannel(channel.id);
      setTestDetailResult(result);
      setTestDetailLoading(false);
      // Populate editable form from templates (with {{api_key}})
      if (result.request) {
        setTestFormUrl(result.request.url);
        const templates = result.request.header_templates ?? result.request.headers;
        setTestFormHeaders(
          Object.entries(templates).map(([key, value]) => ({ key, value }))
        );
      }
      setTestStates((prev) => ({
        ...prev,
        [channel.id]: { loading: false, result },
      }));
    } catch (err) {
      const errorResult: TestResult = {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
      setTestDetailResult(errorResult);
      setTestDetailLoading(false);
      setTestStates((prev) => ({
        ...prev,
        [channel.id]: { loading: false, result: errorResult },
      }));
    }
    // Clear inline badge after 5 seconds
    setTimeout(() => {
      setTestStates((prev) => {
        const next = { ...prev };
        delete next[channel.id];
        return next;
      });
    }, 5000);
  }

  // --- Send custom test request ---
  async function handleTestCustomSend() {
    setTestFormSending(true);
    try {
      const headersMap: Record<string, string> = {};
      for (const h of testFormHeaders) {
        if (h.key.trim()) {
          headersMap[h.key.trim()] = h.value;
        }
      }
      const result = await testChannelCustom({
        channelId: testDetailChannel?.id,
        method: "GET",
        url: testFormUrl,
        headers: headersMap,
      });
      setTestDetailResult(result);
      // Don't overwrite form — keep user's template values intact
    } catch (err) {
      setTestDetailResult({
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setTestFormSending(false);
    }
  }

  // --- Save test config to channel ---
  async function handleSaveTestConfig() {
    if (!testDetailChannel) return;
    setTestConfigSaving(true);
    try {
      const headersMap: Record<string, string> = {};
      for (const h of testFormHeaders) {
        if (h.key.trim()) {
          headersMap[h.key.trim()] = h.value;
        }
      }
      await saveChannelTestConfig({
        id: testDetailChannel.id,
        testUrl: testFormUrl || null,
        testHeaders: Object.keys(headersMap).length > 0
          ? JSON.stringify(headersMap)
          : null,
      });
      setTestConfigSaved(true);
      // Update local channel data so the badge shows
      setChannels((prev) =>
        prev.map((ch) =>
          ch.id === testDetailChannel.id
            ? { ...ch, test_url: testFormUrl || null, test_headers: Object.keys(headersMap).length > 0 ? JSON.stringify(headersMap) : null }
            : ch,
        ),
      );
    } catch (err) {
      toast.error(parseIpcError(err).message);
    } finally {
      setTestConfigSaving(false);
    }
  }

  // --- Open API Keys dialog ---
  function openKeysDialog(channel: Channel) {
    setKeysChannel(channel);
    setNewKeyValue("");
    setRevealedKeys(new Set());
    fetchKeys(channel.id);
  }

  // --- Add API key ---
  async function handleAddKey() {
    if (!keysChannel || !newKeyValue.trim()) return;
    try {
      setAddingKey(true);
      await addChannelApiKey(keysChannel.id, newKeyValue.trim());
      setNewKeyValue("");
      await fetchKeys(keysChannel.id);
    } catch (err) {
      toast.error(parseIpcError(err).message);
    } finally {
      setAddingKey(false);
    }
  }

  // --- Delete API key ---
  async function handleDeleteKey(keyId: string) {
    if (!keysChannel) return;
    try {
      await deleteChannelApiKey(keyId);
      await fetchKeys(keysChannel.id);
    } catch (err) {
      toast.error(parseIpcError(err).message);
    }
  }

  // --- Toggle API key ---
  async function handleToggleKey(keyId: string, enabled: boolean) {
    if (!keysChannel) return;
    try {
      await toggleChannelApiKey(keyId, enabled);
      await fetchKeys(keysChannel.id);
    } catch (err) {
      toast.error(parseIpcError(err).message);
    }
  }

  // --- Toggle key reveal ---
  function toggleRevealKey(keyId: string) {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(keyId)) {
        next.delete(keyId);
      } else {
        next.add(keyId);
      }
      return next;
    });
  }

  // --- Copy key to clipboard ---
  function copyKey(value: string) {
    navigator.clipboard.writeText(value).catch(() => {
      // Clipboard may not be available
    });
  }

  // --- Render test result badge ---
  function renderTestBadge(channelId: string) {
    const state = testStates[channelId];
    if (!state) return null;
    if (state.loading) {
      return (
        <Badge variant="secondary" className="ml-2 gap-1">
          <Loader2 className="size-3 animate-spin" />
          {t.channels.testing}
        </Badge>
      );
    }
    if (state.result?.success) {
      return (
        <Badge className="ml-2 gap-1 bg-green-600 text-white">
          <CheckCircle2 className="size-3" />
          {t.channels.testOk}
        </Badge>
      );
    }
    const errorDetail =
      state.result?.error ??
      (state.result?.response?.status ? `HTTP ${state.result.response.status}` : undefined);
    return (
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="destructive" className="ml-2 gap-1 cursor-default">
              <XCircle className="size-3" />
              {t.channels.testFailed}
            </Badge>
          </TooltipTrigger>
          {errorDetail && (
            <TooltipContent side="bottom" className="max-w-xs break-all">
              {errorDetail}
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
    );
  }

  // =========================================================================
  // Render
  // =========================================================================

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t.channels.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t.channels.subtitle}
          </p>
        </div>
        <Button onClick={openAddDialog}>
          <Plus className="size-4" />
          {t.channels.addChannel}
        </Button>
      </div>

      {/* Channel Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">{t.channels.loadingChannels}</span>
        </div>
      ) : channels.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20">
          <Network className="size-10 text-muted-foreground/30" />
          <p className="mt-4 text-sm font-medium text-muted-foreground">{t.channels.noChannels}</p>
          <Button variant="outline" className="mt-4" onClick={openAddDialog}>
            <Plus className="size-4" />
            {t.channels.addFirstChannel}
          </Button>
        </div>
      ) : (
        <div className="table-wrapper">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.common.name}</TableHead>
              <TableHead>{t.channels.provider}</TableHead>
              <TableHead>{t.channels.baseUrl}</TableHead>
              <TableHead className="text-center">{t.channels.priority}</TableHead>
              <TableHead className="text-center">{t.channels.weight}</TableHead>
              <TableHead className="text-center">{t.common.status}</TableHead>
              <TableHead className="text-right">{t.common.actions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {channels.map((channel) => (
              <TableRow key={channel.id}>
                <TableCell className="font-medium">
                  {channel.name}
                  {renderTestBadge(channel.id)}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {PROVIDER_LABELS[channel.provider as Provider] ?? channel.provider}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-[260px] truncate text-muted-foreground">
                  {channel.base_url}
                </TableCell>
                <TableCell className="text-center">{channel.priority}</TableCell>
                <TableCell className="text-center">{channel.weight}</TableCell>
                <TableCell className="text-center">
                  {channel.enabled ? (
                    <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">{t.common.enabled}</Badge>
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
                      <DropdownMenuItem onClick={() => openEditDialog(channel)}>
                        <Pencil className="size-4" />
                        {t.common.edit}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openKeysDialog(channel)}>
                        <KeyRound className="size-4" />
                        {t.channels.manageKeys}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleTest(channel)}
                        disabled={testStates[channel.id]?.loading}
                      >
                        <Zap className="size-4" />
                        {t.channels.testConnectivity}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setDeleteTarget(channel)}
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
        </div>
      )}

      {/* ================================================================= */}
      {/* Add / Edit Dialog                                                  */}
      {/* ================================================================= */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingChannel ? t.channels.editChannel : t.channels.addChannel}
            </DialogTitle>
            <DialogDescription>
              {editingChannel
                ? t.channels.updateChannelConfig
                : t.channels.configureNewChannel}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {/* Name */}
            <div className="grid gap-2">
              <Label htmlFor="channel-name">{t.common.name}</Label>
              <Input
                id="channel-name"
                placeholder={t.channels.namePlaceholder}
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
              />
            </div>

            {/* Provider */}
            <div className="grid gap-2">
              <Label htmlFor="channel-provider">{t.channels.provider}</Label>
              <Select
                value={formData.provider}
                onValueChange={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    provider: value as Provider,
                    base_url: "",
                  }))
                }
              >
                <SelectTrigger id="channel-provider" className="w-full">
                  <SelectValue placeholder={t.channels.selectProvider} />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {PROVIDER_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Base URL */}
            <div className="grid gap-2">
              <Label htmlFor="channel-url">{t.channels.baseUrl}</Label>
              <Input
                id="channel-url"
                placeholder={PROVIDER_DEFAULT_URLS[formData.provider]}
                value={formData.base_url}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, base_url: e.target.value }))
                }
              />
              <p className="text-xs text-muted-foreground">
                {t.channels.leaveBlankDefault(PROVIDER_DEFAULT_URLS[formData.provider])}
              </p>
            </div>

            {/* Priority & Weight */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="channel-priority">{t.channels.priority}</Label>
                <Input
                  id="channel-priority"
                  type="number"
                  min={0}
                  value={formData.priority}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      priority: parseInt(e.target.value, 10) || 0,
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {t.channels.lowerPriority}
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="channel-weight">{t.channels.weight}</Label>
                <Input
                  id="channel-weight"
                  type="number"
                  min={1}
                  value={formData.weight}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      weight: parseInt(e.target.value, 10) || 1,
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {t.channels.higherWeight}
                </p>
              </div>
            </div>

            {/* Edit-only: Enabled & Key Rotation */}
            {editingChannel && (
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="flex items-center justify-between rounded-md border p-3">
                  <Label htmlFor="channel-enabled" className="cursor-pointer">
                    {t.common.enabled}
                  </Label>
                  <Switch
                    id="channel-enabled"
                    checked={formData.enabled}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({ ...prev, enabled: !!checked }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <Label htmlFor="channel-rotation" className="cursor-pointer">
                    {t.channels.keyRotation}
                  </Label>
                  <Switch
                    id="channel-rotation"
                    checked={formData.key_rotation}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({
                        ...prev,
                        key_rotation: !!checked,
                      }))
                    }
                  />
                </div>
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
              disabled={formSubmitting || !formData.name.trim()}
            >
              {formSubmitting && <Loader2 className="size-4 animate-spin" />}
              {editingChannel ? t.channels.saveChanges : t.channels.createChannel}
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
            <AlertDialogTitle>{t.channels.deleteChannel}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.channels.deleteChannelConfirm(deleteTarget?.name ?? "")}
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
      {/* API Keys Management Dialog                                         */}
      {/* ================================================================= */}
      <Dialog
        open={keysChannel !== null}
        onOpenChange={(open) => {
          if (!open) {
            setKeysChannel(null);
            setKeys([]);
            setRevealedKeys(new Set());
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {t.channels.apiKeysFor(keysChannel?.name ?? "")}
            </DialogTitle>
            <DialogDescription>
              {t.channels.apiKeysDesc}
            </DialogDescription>
          </DialogHeader>

          {/* Add key form */}
          <div className="flex gap-2">
            <Input
              placeholder={t.channels.enterApiKey}
              value={newKeyValue}
              onChange={(e) => setNewKeyValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddKey();
              }}
            />
            <Button
              onClick={handleAddKey}
              disabled={addingKey || !newKeyValue.trim()}
              className="shrink-0"
            >
              {addingKey ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              {t.common.add}
            </Button>
          </div>

          {/* Keys list */}
          {keysLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">
                {t.channels.loadingKeys}
              </span>
            </div>
          ) : keys.length === 0 ? (
            <div className="flex items-center justify-center rounded-md border border-dashed py-8">
              <p className="text-sm text-muted-foreground">
                {t.channels.noApiKeys}
              </p>
            </div>
          ) : (
            <div className="max-h-[320px] space-y-2 overflow-y-auto">
              {keys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center gap-2 rounded-md border px-3 py-2"
                >
                  {/* Key value */}
                  <code className="flex-1 truncate text-sm font-mono">
                    {revealedKeys.has(key.id)
                      ? key.key_value
                      : maskKey(key.key_value)}
                  </code>

                  {/* Reveal / Hide */}
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => toggleRevealKey(key.id)}
                    title={revealedKeys.has(key.id) ? "Hide key" : "Reveal key"}
                  >
                    {revealedKeys.has(key.id) ? (
                      <EyeOff className="size-3" />
                    ) : (
                      <Eye className="size-3" />
                    )}
                  </Button>

                  {/* Copy */}
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => copyKey(key.key_value)}
                    title="Copy to clipboard"
                  >
                    <Copy className="size-3" />
                  </Button>

                  {/* Enabled toggle */}
                  <Switch
                    size="sm"
                    checked={key.enabled}
                    onCheckedChange={(checked) =>
                      handleToggleKey(key.id, !!checked)
                    }
                  />

                  {/* Delete */}
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => handleDeleteKey(key.id)}
                    className="text-destructive hover:text-destructive"
                    title="Delete key"
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>

      {/* ================================================================= */}
      {/* Test Detail Dialog                                                 */}
      {/* ================================================================= */}
      <Dialog
        open={testDetailChannel !== null}
        onOpenChange={(open) => {
          if (!open) {
            setTestDetailChannel(null);
            setTestDetailResult(null);
            setTestDetailLoading(false);
            setTestFormUrl("");
            setTestFormHeaders([]);
            setTestFormSending(false);
            setTestConfigSaving(false);
            setTestConfigSaved(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {t.channels.testDetail} — {testDetailChannel?.name ?? ""}
            </DialogTitle>
            <DialogDescription>
              {t.channels.testConnectivity}
              {(testDetailChannel?.test_url || testDetailChannel?.test_headers) && (
                <Badge variant="secondary" className="ml-2 text-xs">{t.channels.hasCustomConfig}</Badge>
              )}
            </DialogDescription>
          </DialogHeader>

          {testDetailLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">{t.channels.testing}...</span>
            </div>
          ) : testDetailResult ? (
            <div className="grid grid-cols-2 gap-4 min-h-0 flex-1 overflow-hidden">
              {/* Left: Editable Request */}
              <div className="space-y-3 overflow-y-auto pr-2">
                <h3 className="text-sm font-semibold">{t.channels.request}</h3>

                {/* Method + URL */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t.channels.url}</Label>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">GET</Badge>
                    <Input
                      className="flex-1 font-mono text-xs h-8"
                      value={testFormUrl}
                      onChange={(e) => setTestFormUrl(e.target.value)}
                    />
                  </div>
                </div>

                {/* Editable Request Headers */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t.channels.headers}</Label>
                  <div className="space-y-1.5">
                    {testFormHeaders.map((header, idx) => (
                      <div key={idx} className="flex items-center gap-1.5">
                        <Input
                          className="font-mono text-xs h-7 w-[140px]"
                          placeholder={t.channels.headerKey}
                          value={header.key}
                          onChange={(e) => {
                            const next = [...testFormHeaders];
                            next[idx] = { ...next[idx], key: e.target.value };
                            setTestFormHeaders(next);
                          }}
                        />
                        <Input
                          className="font-mono text-xs h-7 flex-1"
                          placeholder={t.channels.headerValue}
                          value={header.value}
                          onChange={(e) => {
                            const next = [...testFormHeaders];
                            next[idx] = { ...next[idx], value: e.target.value };
                            setTestFormHeaders(next);
                          }}
                        />
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="text-destructive hover:text-destructive shrink-0"
                          onClick={() => {
                            setTestFormHeaders((prev) => prev.filter((_, i) => i !== idx));
                          }}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-7 text-xs"
                      onClick={() => setTestFormHeaders((prev) => [...prev, { key: "", value: "" }])}
                    >
                      <Plus className="size-3" />
                      {t.channels.addHeader}
                    </Button>
                  </div>
                </div>

                {/* Send + Save buttons */}
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={handleTestCustomSend}
                    disabled={testFormSending || !testFormUrl.trim()}
                  >
                    {testFormSending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                    {t.channels.send}
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={handleSaveTestConfig}
                    disabled={testConfigSaving}
                  >
                    {testConfigSaving ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : testConfigSaved ? (
                      <CheckCircle2 className="size-4 text-green-600" />
                    ) : (
                      <Save className="size-4" />
                    )}
                    {testConfigSaved ? t.channels.testConfigSaved : t.channels.saveToChannel}
                  </Button>
                </div>
              </div>

              {/* Right: Response */}
              <div className="space-y-3 overflow-y-auto pr-2">
                <h3 className="text-sm font-semibold">{t.channels.response}</h3>

                {testDetailResult.error ? (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t.channels.networkError}</Label>
                    <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3">
                      <p className="text-sm text-destructive break-all">{testDetailResult.error}</p>
                    </div>
                  </div>
                ) : testDetailResult.response ? (
                  <>
                    {/* Status Code */}
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{t.channels.statusCode}</Label>
                      <div>
                        <Badge
                          className={
                            testDetailResult.response.status >= 200 && testDetailResult.response.status < 300
                              ? "bg-green-600 text-white"
                              : ""
                          }
                          variant={
                            testDetailResult.response.status >= 200 && testDetailResult.response.status < 300
                              ? "default"
                              : "destructive"
                          }
                        >
                          {testDetailResult.response.status}
                        </Badge>
                      </div>
                    </div>

                    {/* Response Headers */}
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{t.channels.responseHeaders}</Label>
                      <div className="rounded-md border max-h-[120px] overflow-y-auto">
                        <Table>
                          <TableBody>
                            {Object.entries(testDetailResult.response.headers).map(([key, value]) => (
                              <TableRow key={key}>
                                <TableCell className="py-1 px-2 font-mono text-xs font-medium w-[160px]">{key}</TableCell>
                                <TableCell className="py-1 px-2 font-mono text-xs break-all">{value}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>

                    {/* Response Body */}
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{t.channels.responseBody}</Label>
                      <pre className="rounded-md border bg-muted/50 p-3 text-xs font-mono overflow-auto max-h-[240px] whitespace-pre-wrap break-all">
                        {(() => {
                          try {
                            return JSON.stringify(JSON.parse(testDetailResult.response.body), null, 2);
                          } catch {
                            return testDetailResult.response.body;
                          }
                        })()}
                      </pre>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}

          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>
    </div>
  );
}

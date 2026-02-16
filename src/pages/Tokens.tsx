import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Plus,
  Copy,
  Check,
  MoreHorizontal,
  Pencil,
  Trash2,
  RotateCcw,
  Loader2,
  KeyRound,
} from "lucide-react";
import {
  type Token,
  listTokens,
  createToken,
  updateToken,
  deleteToken,
  resetTokenQuota,
  parseIpcError,
} from "@/lib/tauri";
import { useLanguage } from "@/lib/i18n";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge as SharedStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
  DialogFooter,
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
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function maskKey(key: string): string {
  if (key.length <= 8) return "sk-****";
  return "sk-****" + key.slice(-4);
}

function getTokenStatus(
  token: Token
): "active" | "disabled" | "expired" {
  if (!token.enabled) return "disabled";
  if (token.expires_at && new Date(token.expires_at) < new Date())
    return "expired";
  return "active";
}

function formatQuota(used: number, limit: number | null): string {
  if (limit === null) return `${used} / unlimited`;
  return `${used} / ${limit}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatModels(models: string | null): string {
  if (!models || models.trim() === "") return "All";
  return models;
}

// ---------------------------------------------------------------------------
// Status Badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: "active" | "disabled" | "expired" }) {
  const { t } = useLanguage();
  const statusMap = {
    active: { type: "success" as const, label: t.tokens.active },
    disabled: { type: "neutral" as const, label: t.common.disabled },
    expired: { type: "error" as const, label: t.tokens.expired },
  };
  const s = statusMap[status];
  return <SharedStatusBadge status={s.type}>{s.label}</SharedStatusBadge>;
}

// ---------------------------------------------------------------------------
// Copy Button (inline)
// ---------------------------------------------------------------------------

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button variant="ghost" size="icon-xs" onClick={handleCopy}>
      {copied ? (
        <Check className="size-3 text-emerald-500" />
      ) : (
        <Copy className="size-3" />
      )}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Generate Token Dialog
// ---------------------------------------------------------------------------

interface GenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (token: Token) => void;
}

function GenerateTokenDialog({
  open,
  onOpenChange,
  onCreated,
}: GenerateDialogProps) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [quotaLimit, setQuotaLimit] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [allowedModels, setAllowedModels] = useState("");
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setName("");
    setQuotaLimit("");
    setExpiresAt("");
    setAllowedModels("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const token = await createToken({
        name: name.trim() || null,
        quota_limit: quotaLimit.trim() ? Number(quotaLimit) : null,
        expires_at: expiresAt || null,
        allowed_models: allowedModels.trim() || null,
      });
      onCreated(token);
      resetForm();
      onOpenChange(false);
    } catch (err) {
      toast.error(parseIpcError(err).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.tokens.generateTitle}</DialogTitle>
          <DialogDescription>
            {t.tokens.generateDesc}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="gen-name">{t.common.name}</Label>
            <Input
              id="gen-name"
              placeholder={t.tokens.namePlaceholder}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="gen-quota">{t.tokens.quotaLimit}</Label>
            <Input
              id="gen-quota"
              type="number"
              min={0}
              placeholder={t.tokens.quotaPlaceholder}
              value={quotaLimit}
              onChange={(e) => setQuotaLimit(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="gen-expires">{t.tokens.expiresAtLabel}</Label>
            <Input
              id="gen-expires"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="gen-models">{t.tokens.allowedModelsLabel}</Label>
            <Textarea
              id="gen-models"
              placeholder={t.tokens.allowedModelsPlaceholder}
              value={allowedModels}
              onChange={(e) => setAllowedModels(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => { resetForm(); onOpenChange(false); }}
            >
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              {t.tokens.generate}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Key Reveal Dialog (shown once after creation)
// ---------------------------------------------------------------------------

interface KeyRevealDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  keyValue: string;
}

function KeyRevealDialog({ open, onOpenChange, keyValue }: KeyRevealDialogProps) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(keyValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.tokens.tokenCreated}</DialogTitle>
          <DialogDescription>
            {t.tokens.tokenCreatedDesc}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-3">
          <code className="flex-1 break-all text-sm font-mono">{keyValue}</code>
          <Button variant="outline" size="sm" onClick={handleCopy}>
            {copied ? (
              <>
                <Check className="size-3.5 text-emerald-500" />
                {t.common.copied}
              </>
            ) : (
              <>
                <Copy className="size-3.5" />
                {t.common.copy}
              </>
            )}
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>{t.common.done}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Edit Token Dialog
// ---------------------------------------------------------------------------

interface EditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: Token | null;
  onSaved: () => void;
}

function EditTokenDialog({ open, onOpenChange, token, onSaved }: EditDialogProps) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [quotaLimit, setQuotaLimit] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [allowedModels, setAllowedModels] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (token) {
      setName(token.name ?? "");
      setQuotaLimit(token.quota_limit !== null ? String(token.quota_limit) : "");
      setExpiresAt(token.expires_at ? token.expires_at.split("T")[0] : "");
      setAllowedModels(token.allowed_models ?? "");
      setEnabled(token.enabled);
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    try {
      await updateToken({
        id: token.id,
        name: name.trim() || null,
        quota_limit: quotaLimit.trim() ? Number(quotaLimit) : null,
        expires_at: expiresAt || null,
        allowed_models: allowedModels.trim() || null,
        enabled,
      });
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(parseIpcError(err).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.tokens.editTitle}</DialogTitle>
          <DialogDescription>
            {t.tokens.editDesc}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="edit-name">{t.common.name}</Label>
            <Input
              id="edit-name"
              placeholder={t.tokens.namePlaceholder}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-quota">{t.tokens.quotaLimit}</Label>
            <Input
              id="edit-quota"
              type="number"
              min={0}
              placeholder={t.tokens.quotaPlaceholder}
              value={quotaLimit}
              onChange={(e) => setQuotaLimit(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-expires">{t.tokens.expiresAtLabel}</Label>
            <Input
              id="edit-expires"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-models">{t.tokens.allowedModelsLabel}</Label>
            <Textarea
              id="edit-models"
              placeholder={t.tokens.allowedModelsPlaceholder}
              value={allowedModels}
              onChange={(e) => setAllowedModels(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="edit-enabled">{t.common.enabled}</Label>
            <Switch
              id="edit-enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              {t.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Delete Confirmation
// ---------------------------------------------------------------------------

interface DeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: Token | null;
  onConfirm: () => void;
}

function DeleteTokenDialog({
  open,
  onOpenChange,
  token,
  onConfirm,
}: DeleteDialogProps) {
  const { t } = useLanguage();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t.tokens.deleteTitle}</AlertDialogTitle>
          <AlertDialogDescription>
            {t.tokens.deleteDesc(token?.name ?? "")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            {t.common.delete}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------------------
// Reset Quota Confirmation
// ---------------------------------------------------------------------------

interface ResetQuotaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: Token | null;
  onConfirm: () => void;
}

function ResetQuotaDialog({
  open,
  onOpenChange,
  token,
  onConfirm,
}: ResetQuotaDialogProps) {
  const { t } = useLanguage();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t.tokens.resetQuotaTitle}</AlertDialogTitle>
          <AlertDialogDescription>
            {t.tokens.resetQuotaDesc(token?.name ?? "")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{t.tokens.reset}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function Tokens({ embedded = false }: { embedded?: boolean }) {
  const { t } = useLanguage();
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [generateOpen, setGenerateOpen] = useState(false);
  const [revealKey, setRevealKey] = useState<string | null>(null);
  const [editToken, setEditToken] = useState<Token | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Token | null>(null);
  const [resetTarget, setResetTarget] = useState<Token | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await listTokens();
      setTokens(list);
    } catch (err) {
      toast.error(parseIpcError(err).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCreated = (token: Token) => {
    setRevealKey(token.key_value);
    refresh();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteToken(deleteTarget.id);
      setDeleteTarget(null);
      refresh();
    } catch (err) {
      toast.error(parseIpcError(err).message);
    }
  };

  const handleResetQuota = async () => {
    if (!resetTarget) return;
    try {
      await resetTokenQuota(resetTarget.id);
      setResetTarget(null);
      refresh();
    } catch (err) {
      toast.error(parseIpcError(err).message);
    }
  };

  // --- Loading state ---
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const actionButtons = (
    <Button onClick={() => setGenerateOpen(true)}>
      <Plus />
      {t.tokens.generateToken}
    </Button>
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      {!embedded ? (
        <PageHeader
          title={t.tokens.title}
          description={t.tokens.subtitle}
          actions={actionButtons}
        />
      ) : (
        <div className="flex justify-end">{actionButtons}</div>
      )}

      {/* Table or Empty State */}
      {tokens.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title={t.tokens.noTokens}
          description={t.tokens.noTokensHint}
          action={
            <Button variant="outline" onClick={() => setGenerateOpen(true)}>
              <Plus />
              {t.tokens.generateToken}
            </Button>
          }
        />
      ) : (
        <div className="table-wrapper">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.common.name}</TableHead>
              <TableHead>{t.tokens.key}</TableHead>
              <TableHead>{t.tokens.quota}</TableHead>
              <TableHead>{t.tokens.expiresAt}</TableHead>
              <TableHead>{t.tokens.allowedModels}</TableHead>
              <TableHead>{t.common.status}</TableHead>
              <TableHead className="w-[60px]">{t.common.actions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tokens.map((token) => {
              const status = getTokenStatus(token);
              return (
                <TableRow key={token.id}>
                  <TableCell className="font-medium">
                    {token.name || (
                      <span className="text-muted-foreground">{t.common.unnamed}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <code className="text-xs text-muted-foreground">
                        {maskKey(token.key_value)}
                      </code>
                      <CopyButton value={token.key_value} />
                    </div>
                  </TableCell>
                  <TableCell>
                    {formatQuota(token.quota_used, token.quota_limit)}
                  </TableCell>
                  <TableCell>{formatDate(token.expires_at)}</TableCell>
                  <TableCell>
                    <span className="max-w-[200px] truncate inline-block text-sm">
                      {formatModels(token.allowed_models)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={status} />
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-xs">
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => setEditToken(token)}
                        >
                          <Pencil />
                          {t.common.edit}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setResetTarget(token)}
                        >
                          <RotateCcw />
                          {t.tokens.resetQuota}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setDeleteTarget(token)}
                        >
                          <Trash2 />
                          {t.common.delete}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        </div>
      )}

      {/* Dialogs */}
      <GenerateTokenDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        onCreated={handleCreated}
      />

      <KeyRevealDialog
        open={revealKey !== null}
        onOpenChange={(v) => { if (!v) setRevealKey(null); }}
        keyValue={revealKey ?? ""}
      />

      <EditTokenDialog
        open={editToken !== null}
        onOpenChange={(v) => { if (!v) setEditToken(null); }}
        token={editToken}
        onSaved={refresh}
      />

      <DeleteTokenDialog
        open={deleteTarget !== null}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
        token={deleteTarget}
        onConfirm={handleDelete}
      />

      <ResetQuotaDialog
        open={resetTarget !== null}
        onOpenChange={(v) => { if (!v) setResetTarget(null); }}
        token={resetTarget}
        onConfirm={handleResetQuota}
      />
    </div>
  );
}

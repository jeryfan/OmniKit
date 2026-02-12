import { useState, useEffect, useCallback } from "react";
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
} from "@/lib/tauri";
import { useLanguage } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  switch (status) {
    case "active":
      return (
        <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/25">
          {t.tokens.active}
        </Badge>
      );
    case "disabled":
      return (
        <Badge variant="secondary">
          {t.common.disabled}
        </Badge>
      );
    case "expired":
      return (
        <Badge variant="destructive">
          {t.tokens.expired}
        </Badge>
      );
  }
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

export default function Tokens() {
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
    await deleteToken(deleteTarget.id);
    setDeleteTarget(null);
    refresh();
  };

  const handleResetQuota = async () => {
    if (!resetTarget) return;
    await resetTokenQuota(resetTarget.id);
    setResetTarget(null);
    refresh();
  };

  // --- Loading state ---
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t.tokens.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t.tokens.subtitle}
          </p>
        </div>
        <Button onClick={() => setGenerateOpen(true)}>
          <Plus />
          {t.tokens.generateToken}
        </Button>
      </div>

      {/* Table or Empty State */}
      {tokens.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
          <KeyRound className="size-10 text-muted-foreground/50" />
          <p className="mt-4 text-sm font-medium text-muted-foreground">
            {t.tokens.noTokens}
          </p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            {t.tokens.noTokensHint}
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => setGenerateOpen(true)}
          >
            <Plus />
            {t.tokens.generateToken}
          </Button>
        </div>
      ) : (
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

import { useState, useEffect, useMemo, useCallback } from "react";
import { Plus, Pencil, Trash2, Loader2, Route } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listModelMappings,
  createModelMapping,
  updateModelMapping,
  deleteModelMapping,
  listChannels,
  type ModelMapping,
  type Channel,
} from "@/lib/tauri";
import { useLanguage } from "@/lib/i18n";

const MODALITIES = [
  { value: "chat", label: "Chat" },
  { value: "image", label: "Image" },
  { value: "tts", label: "TTS" },
  { value: "asr", label: "ASR" },
] as const;

interface MappingFormData {
  public_name: string;
  channel_id: string;
  actual_name: string;
  modality: string;
}

const emptyFormData: MappingFormData = {
  public_name: "",
  channel_id: "",
  actual_name: "",
  modality: "chat",
};

function modalityBadgeVariant(modality: string) {
  switch (modality) {
    case "chat":
      return "default" as const;
    case "image":
      return "secondary" as const;
    case "tts":
      return "outline" as const;
    case "asr":
      return "outline" as const;
    default:
      return "secondary" as const;
  }
}

export default function ModelMappings() {
  const { t } = useLanguage();
  const [mappings, setMappings] = useState<ModelMapping[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMapping, setEditingMapping] = useState<ModelMapping | null>(null);
  const [formData, setFormData] = useState<MappingFormData>(emptyFormData);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<ModelMapping | null>(null);
  const [deleting, setDeleting] = useState(false);

  const channelMap = useMemo(() => {
    const map: Record<string, Channel> = {};
    for (const ch of channels) {
      map[ch.id] = ch;
    }
    return map;
  }, [channels]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [m, c] = await Promise.all([listModelMappings(), listChannels()]);
      setMappings(m);
      setChannels(c);
    } catch (err) {
      console.error("Failed to fetch model mappings:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const refreshMappings = useCallback(async () => {
    try {
      const m = await listModelMappings();
      setMappings(m);
    } catch (err) {
      console.error("Failed to refresh model mappings:", err);
    }
  }, []);

  // --- Add / Edit dialog handlers ---

  function openAddDialog() {
    setEditingMapping(null);
    setFormData(emptyFormData);
    setDialogOpen(true);
  }

  function openEditDialog(mapping: ModelMapping) {
    setEditingMapping(mapping);
    setFormData({
      public_name: mapping.public_name,
      channel_id: mapping.channel_id,
      actual_name: mapping.actual_name,
      modality: mapping.modality,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!formData.public_name || !formData.channel_id || !formData.actual_name || !formData.modality) {
      return;
    }

    try {
      setSaving(true);
      if (editingMapping) {
        await updateModelMapping({
          id: editingMapping.id,
          ...formData,
        });
      } else {
        await createModelMapping(formData);
      }
      setDialogOpen(false);
      await refreshMappings();
    } catch (err) {
      console.error("Failed to save model mapping:", err);
    } finally {
      setSaving(false);
    }
  }

  // --- Delete handlers ---

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await deleteModelMapping(deleteTarget.id);
      setDeleteTarget(null);
      await refreshMappings();
    } catch (err) {
      console.error("Failed to delete model mapping:", err);
    } finally {
      setDeleting(false);
    }
  }

  const isFormValid =
    formData.public_name.trim() !== "" &&
    formData.channel_id !== "" &&
    formData.actual_name.trim() !== "" &&
    formData.modality !== "";

  // --- Render ---

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t.modelMappings.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t.modelMappings.subtitle}
          </p>
        </div>
        <Button onClick={openAddDialog}>
          <Plus className="size-4" />
          {t.modelMappings.addMapping}
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : mappings.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-20">
          <Route className="size-10 text-muted-foreground/50" />
          <p className="mt-4 text-sm font-medium text-muted-foreground">
            {t.modelMappings.noMappings}
          </p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            {t.modelMappings.noMappingsHint}
          </p>
          <Button variant="outline" className="mt-4" onClick={openAddDialog}>
            <Plus className="size-4" />
            {t.modelMappings.addMapping}
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.modelMappings.publicName}</TableHead>
                <TableHead>{t.modelMappings.channel}</TableHead>
                <TableHead>{t.modelMappings.actualName}</TableHead>
                <TableHead>{t.modelMappings.modality}</TableHead>
                <TableHead className="text-right">{t.common.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mappings.map((mapping) => {
                const channel = channelMap[mapping.channel_id];
                return (
                  <TableRow key={mapping.id}>
                    <TableCell className="font-medium">
                      {mapping.public_name}
                    </TableCell>
                    <TableCell>
                      {channel ? (
                        <span className="text-muted-foreground">
                          {channel.name}
                          <span className="ml-1.5 text-xs text-muted-foreground/60">
                            ({channel.provider})
                          </span>
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground/50 italic">
                          {t.modelMappings.unknownChannel}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {mapping.actual_name}
                    </TableCell>
                    <TableCell>
                      <Badge variant={modalityBadgeVariant(mapping.modality)}>
                        {mapping.modality}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(mapping)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTarget(mapping)}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingMapping ? t.modelMappings.editMapping : t.modelMappings.addMapping}
            </DialogTitle>
            <DialogDescription>
              {editingMapping
                ? t.modelMappings.updateMappingConfig
                : t.modelMappings.createMappingDesc}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {/* Public Name */}
            <div className="grid gap-2">
              <Label htmlFor="public_name">{t.modelMappings.publicName}</Label>
              <Input
                id="public_name"
                placeholder={t.modelMappings.publicNamePlaceholder}
                value={formData.public_name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, public_name: e.target.value }))
                }
              />
              <p className="text-xs text-muted-foreground">
                {t.modelMappings.publicNameHint}
              </p>
            </div>

            {/* Channel */}
            <div className="grid gap-2">
              <Label htmlFor="channel">{t.modelMappings.channel}</Label>
              <Select
                value={formData.channel_id}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, channel_id: value }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t.modelMappings.selectChannel} />
                </SelectTrigger>
                <SelectContent>
                  {channels.length === 0 ? (
                    <SelectItem value="__none" disabled>
                      {t.modelMappings.noChannelsAvailable}
                    </SelectItem>
                  ) : (
                    channels.map((ch) => (
                      <SelectItem key={ch.id} value={ch.id}>
                        {ch.name}
                        <span className="ml-1.5 text-muted-foreground">
                          ({ch.provider})
                        </span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Actual Name */}
            <div className="grid gap-2">
              <Label htmlFor="actual_name">{t.modelMappings.actualName}</Label>
              <Input
                id="actual_name"
                placeholder={t.modelMappings.actualNamePlaceholder}
                value={formData.actual_name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, actual_name: e.target.value }))
                }
              />
              <p className="text-xs text-muted-foreground">
                {t.modelMappings.actualNameHint}
              </p>
            </div>

            {/* Modality */}
            <div className="grid gap-2">
              <Label htmlFor="modality">{t.modelMappings.modality}</Label>
              <Select
                value={formData.modality}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, modality: value }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t.modelMappings.selectModality} />
                </SelectTrigger>
                <SelectContent>
                  {MODALITIES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              {t.common.cancel}
            </Button>
            <Button onClick={handleSave} disabled={!isFormValid || saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              {editingMapping ? t.modelMappings.saveChanges : t.modelMappings.createMapping}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.modelMappings.deleteMapping}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.modelMappings.deleteMappingConfirm(deleteTarget?.public_name ?? "")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 className="size-4 animate-spin" />}
              {t.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

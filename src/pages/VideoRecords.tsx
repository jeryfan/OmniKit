import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router";
import { listen } from "@tauri-apps/api/event";
import {
  ArrowLeft,
  Download,
  FolderOpen,
  Loader2,
  Pause,
  Play,
  Search,
  SkipBack,
  SkipForward,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
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
import { toast } from "sonner";
import { useLanguage } from "@/lib/i18n";
import {
  getConfig,
  listVideoRecords,
  deleteVideoRecord,
  updateVideoRecordStatus,
  downloadVideo,
  cancelVideoDownload,
  openInFolder,
  type VideoRecord,
  type VideoFormat,
  type DownloadProgress,
  type DownloadStatus,
} from "@/lib/tauri";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatSpeed(bytesPerSec: number): string {
  return formatBytes(bytesPerSec) + "/s";
}

interface ActiveDownload {
  taskId: string;
  recordId: string;
  downloaded: number;
  total: number | null;
  speed: number;
  status: DownloadStatus;
}

interface PlayerState {
  recordId: string;
  quality: string;
}

function parseFormats(rawFormats: string): VideoFormat[] {
  try {
    const parsed = JSON.parse(rawFormats) as VideoFormat[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function VideoRecords() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [records, setRecords] = useState<VideoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [playerState, setPlayerState] = useState<PlayerState | null>(null);
  const [serverPort, setServerPort] = useState<number | null>(null);
  const [activeDownloads, setActiveDownloads] = useState<ActiveDownload[]>([]);

  const loadRecords = useCallback(async () => {
    try {
      const data = await listVideoRecords();
      setRecords(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecords();
    getConfig().then((config) => setServerPort(config.server_port));
  }, [loadRecords]);

  useEffect(() => {
    const unlisten = listen<DownloadProgress>("video-download-progress", (event) => {
      const progress = event.payload;
      setActiveDownloads((prev) => {
        const dl = prev.find((d) => d.taskId === progress.task_id);
        if (!dl) return prev;
        return prev.map((d) =>
          d.taskId === progress.task_id
            ? {
                ...d,
                downloaded: progress.downloaded,
                total: progress.total,
                speed: progress.speed,
                status: progress.status,
              }
            : d,
        );
      });

      if (progress.status === "Completed") {
        toast.success(t.videoDownload.downloadComplete);
      } else if (typeof progress.status === "object" && "Failed" in progress.status) {
        toast.error(`${t.videoDownload.downloadFailed}: ${progress.status.Failed}`);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [t]);

  const formatsByRecordId = useMemo(() => {
    const map: Record<string, VideoFormat[]> = {};
    for (const record of records) {
      map[record.id] = parseFormats(record.formats);
    }
    return map;
  }, [records]);

  const filteredRecords = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return records;
    return records.filter((record) => {
      const title = record.title.toLowerCase();
      const platform = record.platform.toLowerCase();
      return title.includes(keyword) || platform.includes(keyword);
    });
  }, [records, search]);

  const playingRecord = useMemo(() => {
    if (!playerState) return null;
    return records.find((record) => record.id === playerState.recordId) ?? null;
  }, [records, playerState]);

  const playingFormats = useMemo(() => {
    if (!playerState) return [];
    return formatsByRecordId[playerState.recordId] ?? [];
  }, [formatsByRecordId, playerState]);

  const playingFormat = useMemo(() => {
    if (!playerState || playingFormats.length === 0) return null;
    return playingFormats.find((format) => format.quality === playerState.quality) ?? playingFormats[0];
  }, [playerState, playingFormats]);

  const playerVideoUrl = useMemo(() => {
    if (!serverPort || !playingFormat) return null;
    return `http://127.0.0.1:${serverPort}/video-proxy?url=${encodeURIComponent(playingFormat.url)}`;
  }, [serverPort, playingFormat]);

  const playingIndex = useMemo(() => {
    if (!playingRecord) return -1;
    return records.findIndex((record) => record.id === playingRecord.id);
  }, [playingRecord, records]);

  const hasPreviousPlayable = useMemo(() => {
    if (playingIndex <= 0) return false;
    for (let i = playingIndex - 1; i >= 0; i -= 1) {
      if ((formatsByRecordId[records[i].id] ?? []).length > 0) return true;
    }
    return false;
  }, [formatsByRecordId, playingIndex, records]);

  const hasNextPlayable = useMemo(() => {
    if (playingIndex < 0 || playingIndex >= records.length - 1) return false;
    for (let i = playingIndex + 1; i < records.length; i += 1) {
      if ((formatsByRecordId[records[i].id] ?? []).length > 0) return true;
    }
    return false;
  }, [formatsByRecordId, playingIndex, records]);

  useEffect(() => {
    if (!playerState) return;
    const formats = formatsByRecordId[playerState.recordId] ?? [];
    if (formats.length === 0) {
      setPlayerState(null);
      return;
    }

    const selectedFormatExists = formats.some((format) => format.quality === playerState.quality);
    if (!selectedFormatExists) {
      setPlayerState({ recordId: playerState.recordId, quality: formats[0].quality });
    }
  }, [formatsByRecordId, playerState]);

  const handleDelete = useCallback(async () => {
    if (!deleteId) return;
    try {
      await deleteVideoRecord(deleteId);
      setRecords((prev) => prev.filter((record) => record.id !== deleteId));
      if (playerState?.recordId === deleteId) {
        setPlayerState(null);
      }
    } catch (e: unknown) {
      const err = e as { message?: string };
      toast.error(err.message || "Failed to delete");
    } finally {
      setDeleteId(null);
    }
  }, [deleteId, playerState]);

  const handleDownload = useCallback(
    async (record: VideoRecord) => {
      const formats = formatsByRecordId[record.id] ?? [];
      if (formats.length === 0) {
        toast.error(t.videoDownload.noFormats);
        return;
      }
      const format = formats[0];

      const taskId = crypto.randomUUID();
      setActiveDownloads((prev) => [
        ...prev,
        { taskId, recordId: record.id, downloaded: 0, total: format.size, speed: 0, status: "Downloading" },
      ]);

      try {
        const savePath = await downloadVideo({
          taskId,
          title: record.title,
          videoUrl: format.url,
          audioUrl: format.audio_url,
          quality: format.quality,
          saveDir: null,
        });
        await updateVideoRecordStatus({ id: record.id, downloadStatus: "downloaded", savePath });
        setRecords((prev) =>
          prev.map((r) => (r.id === record.id ? { ...r, download_status: "downloaded", save_path: savePath } : r)),
        );
      } catch (e: unknown) {
        const err = e as { message?: string };
        await updateVideoRecordStatus({ id: record.id, downloadStatus: "failed", savePath: null }).catch(() => {});
        setRecords((prev) => prev.map((r) => (r.id === record.id ? { ...r, download_status: "failed" } : r)));
        toast.error(err.message || t.videoDownload.downloadFailed);
      } finally {
        setActiveDownloads((prev) => prev.filter((dl) => dl.recordId !== record.id));
      }
    },
    [formatsByRecordId, t],
  );

  const handleCancelDownload = useCallback(async (taskId: string) => {
    try {
      await cancelVideoDownload(taskId);
    } catch {
      // Task might already be done
    }
  }, []);

  const handleOpenFolder = useCallback(async (path: string) => {
    try {
      await openInFolder(path);
    } catch (e: unknown) {
      const err = e as { message?: string };
      toast.error(err.message || "Failed to open folder");
    }
  }, []);

  const handleOpenPlayer = useCallback(
    (record: VideoRecord) => {
      const formats = formatsByRecordId[record.id] ?? [];
      if (formats.length === 0) {
        toast.error(t.videoDownload.noFormats);
        return;
      }
      setPlayerState({ recordId: record.id, quality: formats[0].quality });
    },
    [formatsByRecordId, t],
  );

  const handlePlayerQualityChange = useCallback((quality: string) => {
    setPlayerState((prev) => (prev ? { ...prev, quality } : prev));
  }, []);

  const handleClosePlayer = useCallback(() => {
    setPlayerState(null);
  }, []);

  const handlePlayNeighbor = useCallback(
    (step: -1 | 1) => {
      if (playingIndex < 0) return;
      for (let i = playingIndex + step; i >= 0 && i < records.length; i += step) {
        const candidate = records[i];
        const formats = formatsByRecordId[candidate.id] ?? [];
        if (formats.length > 0) {
          setPlayerState({ recordId: candidate.id, quality: formats[0].quality });
          return;
        }
      }
    },
    [formatsByRecordId, playingIndex, records],
  );

  const getStatusBadge = useCallback(
    (record: VideoRecord) => {
      const dl = activeDownloads.find((d) => d.recordId === record.id);
      if (dl) {
        return (
          <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
            {t.videoDownload.downloading}
          </span>
        );
      }
      if (record.download_status === "downloaded") {
        return (
          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
            {t.videoRecords.downloaded}
          </span>
        );
      }
      if (record.download_status === "failed") {
        return (
          <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/30 dark:text-red-400">
            {t.videoRecords.failed}
          </span>
        );
      }
      return (
        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-800 dark:bg-gray-900/30 dark:text-gray-400">
          {t.videoRecords.pending}
        </span>
      );
    },
    [activeDownloads, t],
  );

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={t.videoRecords.title}
        description={t.videoRecords.subtitle}
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate("/video-download")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t.videoRecords.backToDownload}
          </Button>
        }
      />

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-lg font-medium text-muted-foreground">{t.videoRecords.noRecords}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t.videoRecords.noRecordsHint}</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t.videoRecords.searchPlaceholder}
                />
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{t.common.totalItems(filteredRecords.length)}</span>
            </div>

            {filteredRecords.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center">
                  <p className="text-sm font-medium text-muted-foreground">{t.videoRecords.noSearchResults}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{t.videoRecords.noSearchResultsHint}</p>
                </CardContent>
              </Card>
            ) : (
              filteredRecords.map((record) => {
                const activeDl = activeDownloads.find((download) => download.recordId === record.id);
                const isPlaying = playerState?.recordId === record.id;
                const formats = formatsByRecordId[record.id] ?? [];
                const hasPlayableFormat = formats.length > 0;

                return (
                  <Card key={record.id} className={isPlaying ? "border-primary/50 bg-primary/5" : ""}>
                    <CardContent className="p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
                        {record.cover_url && (
                          <button
                            type="button"
                            className="h-20 w-full overflow-hidden rounded-md bg-muted sm:w-36 sm:shrink-0"
                            onClick={() => handleOpenPlayer(record)}
                            disabled={!hasPlayableFormat}
                          >
                            <img src={record.cover_url} alt={record.title} className="h-full w-full object-cover" />
                          </button>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <button
                                type="button"
                                className="text-left transition-colors hover:text-primary disabled:cursor-not-allowed disabled:hover:text-foreground"
                                onClick={() => handleOpenPlayer(record)}
                                disabled={!hasPlayableFormat}
                              >
                                <h3 className="line-clamp-1 font-medium">{record.title}</h3>
                              </button>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <span className="capitalize">{record.platform}</span>
                                {record.duration && <span>{formatDuration(record.duration)}</span>}
                                {isPlaying && (
                                  <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                                    {t.videoRecords.watching}
                                  </span>
                                )}
                                {getStatusBadge(record)}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-1">
                              <Button
                                variant={isPlaying ? "secondary" : "outline"}
                                size="sm"
                                onClick={() => handleOpenPlayer(record)}
                                disabled={!hasPlayableFormat}
                              >
                                {isPlaying ? <Pause className="mr-1.5 h-4 w-4" /> : <Play className="mr-1.5 h-4 w-4" />}
                                {isPlaying ? t.videoRecords.watching : t.videoRecords.watch}
                              </Button>

                              {!activeDl && record.download_status !== "downloaded" && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDownload(record)}
                                  title={t.videoDownload.download}
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                              )}

                              {activeDl && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleCancelDownload(activeDl.taskId)}
                                  title={t.videoDownload.cancel}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              )}

                              {record.download_status === "downloaded" && record.save_path && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleOpenFolder(record.save_path!)}
                                  title={t.videoDownload.openFolder}
                                >
                                  <FolderOpen className="h-4 w-4" />
                                </Button>
                              )}

                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setDeleteId(record.id)}
                                title={t.videoRecords.deleteRecord}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </div>

                          {activeDl && activeDl.status === "Downloading" && (
                            <div className="mt-2">
                              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                                <span>{formatSpeed(activeDl.speed)}</span>
                                {activeDl.total && (
                                  <span>
                                    {formatBytes(activeDl.downloaded)} / {formatBytes(activeDl.total)}
                                  </span>
                                )}
                              </div>
                              <Progress value={activeDl.total ? (activeDl.downloaded / activeDl.total) * 100 : undefined} />
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        )}
      </div>

      <Dialog
        open={playerState !== null}
        onOpenChange={(open) => {
          if (!open) handleClosePlayer();
        }}
      >
        <DialogContent className="max-w-5xl p-0 sm:max-w-5xl">
          <DialogHeader className="gap-2 border-b p-4 pb-3 pr-12">
            <DialogTitle className="line-clamp-1">{playingRecord?.title ?? t.videoRecords.watching}</DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-3 text-xs">
              {playingRecord && <span className="capitalize">{playingRecord.platform}</span>}
              {playingRecord?.duration && <span>{formatDuration(playingRecord.duration)}</span>}
              {playingFormat && <span>{playingFormat.quality}</span>}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => handlePlayNeighbor(-1)}
                disabled={!hasPreviousPlayable}
                title={t.videoRecords.previous}
              >
                <SkipBack className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => handlePlayNeighbor(1)}
                disabled={!hasNextPlayable}
                title={t.videoRecords.next}
              >
                <SkipForward className="h-4 w-4" />
              </Button>

              {playingFormats.length > 0 && (
                <Select
                  value={playingFormat?.quality ?? playingFormats[0].quality}
                  onValueChange={handlePlayerQualityChange}
                >
                  <SelectTrigger className="h-9 w-44">
                    <SelectValue placeholder={t.videoDownload.selectQuality} />
                  </SelectTrigger>
                  <SelectContent>
                    {playingFormats.map((format) => (
                      <SelectItem key={format.quality} value={format.quality}>
                        {format.quality}
                        {format.size ? ` (${formatBytes(format.size)})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {playerVideoUrl ? (
              <div className="overflow-hidden rounded-lg bg-black">
                <video
                  key={`${playingRecord?.id ?? "unknown"}-${playingFormat?.quality ?? "default"}`}
                  controls
                  autoPlay
                  className="mx-auto max-h-[70vh] w-full"
                  src={playerVideoUrl}
                />
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                {t.common.loading}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.videoRecords.deleteRecord}</AlertDialogTitle>
            <AlertDialogDescription>{t.videoRecords.deleteConfirm}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>{t.common.delete}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

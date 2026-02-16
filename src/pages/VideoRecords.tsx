import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import { listen } from "@tauri-apps/api/event";
import { ArrowLeft, Download, FolderOpen, Play, Trash2, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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

export default function VideoRecords() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [records, setRecords] = useState<VideoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
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
            ? { ...d, downloaded: progress.downloaded, total: progress.total, speed: progress.speed, status: progress.status }
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

  const handleDelete = useCallback(async () => {
    if (!deleteId) return;
    try {
      await deleteVideoRecord(deleteId);
      setRecords((prev) => prev.filter((r) => r.id !== deleteId));
    } catch (e: unknown) {
      const err = e as { message?: string };
      toast.error(err.message || "Failed to delete");
    } finally {
      setDeleteId(null);
    }
  }, [deleteId]);

  const handleDownload = useCallback(async (record: VideoRecord) => {
    const formats: VideoFormat[] = JSON.parse(record.formats);
    if (formats.length === 0) return;
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
      setRecords((prev) =>
        prev.map((r) => (r.id === record.id ? { ...r, download_status: "failed" } : r)),
      );
      toast.error(err.message || t.videoDownload.downloadFailed);
    } finally {
      setActiveDownloads((prev) => prev.filter((dl) => dl.recordId !== record.id));
    }
  }, [t]);

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

  const getVideoProxyUrl = useCallback(
    (record: VideoRecord) => {
      if (!serverPort) return null;
      const formats: VideoFormat[] = JSON.parse(record.formats);
      if (formats.length === 0) return null;
      return `http://127.0.0.1:${serverPort}/video-proxy?url=${encodeURIComponent(formats[0].url)}`;
    },
    [serverPort],
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
          <div className="space-y-4">
            {records.map((record) => {
              const activeDl = activeDownloads.find((d) => d.recordId === record.id);
              const videoUrl = playingId === record.id ? getVideoProxyUrl(record) : null;

              return (
                <Card key={record.id}>
                  <CardContent className="p-4">
                    <div className="flex gap-4">
                      {record.cover_url && (
                        <div className="h-20 w-36 shrink-0 overflow-hidden rounded-md bg-muted">
                          <img
                            src={record.cover_url}
                            alt={record.title}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="font-medium line-clamp-1">{record.title}</h3>
                            <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                              <span className="capitalize">{record.platform}</span>
                              {record.duration && <span>{formatDuration(record.duration)}</span>}
                              {getStatusBadge(record)}
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setPlayingId(playingId === record.id ? null : record.id)}
                              title={t.videoRecords.watch}
                            >
                              <Play className="h-4 w-4" />
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
                            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                              <span>{formatSpeed(activeDl.speed)}</span>
                              {activeDl.total && (
                                <span>
                                  {formatBytes(activeDl.downloaded)} / {formatBytes(activeDl.total)}
                                </span>
                              )}
                            </div>
                            <Progress
                              value={activeDl.total ? (activeDl.downloaded / activeDl.total) * 100 : undefined}
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    {videoUrl && (
                      <div className="mt-3 overflow-hidden rounded-lg bg-black">
                        <video
                          key={videoUrl}
                          controls
                          autoPlay
                          className="mx-auto max-h-[480px] w-full"
                          src={videoUrl}
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

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

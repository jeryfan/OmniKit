import { useState, useEffect, useCallback, useMemo } from "react";
import { listen } from "@tauri-apps/api/event";
import { Download, FolderOpen, History, Link, Loader2, Music, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/page-header";
import { DashPlayer } from "@/components/dash-player";
import { PlatformBadge } from "@/components/PlatformBadge";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useLanguage } from "@/lib/i18n";
import {
  getConfig,
  parseVideoUrl,
  downloadVideo,
  cancelVideoDownload,
  openInFolder,
  saveVideoRecord,
  type VideoInfo,
  type DownloadProgress,
  type DownloadStatus,
} from "@/lib/tauri";

interface DownloadTask {
  taskId: string;
  title: string;
  platform: string;
  quality: string;
  savePath: string;
  downloaded: number;
  total: number | null;
  speed: number;
  status: DownloadStatus;
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

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function getStatusLabel(status: DownloadStatus, t: ReturnType<typeof useLanguage>["t"]): string {
  if (status === "Downloading") return t.videoDownload.downloading;
  if (status === "Completed") return t.videoDownload.completed;
  if (status === "Cancelled") return t.videoDownload.cancelled;
  if (typeof status === "object" && "Failed" in status) return `${t.videoDownload.failed}: ${status.Failed}`;
  return "";
}

export default function VideoDownload() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [parsing, setParsing] = useState(false);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<string>("");
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [serverPort, setServerPort] = useState<number | null>(null);

  useEffect(() => {
    getConfig().then((config) => setServerPort(config.server_port));
  }, []);

  useEffect(() => {
    const unlisten = listen<DownloadProgress>("video-download-progress", (event) => {
      const progress = event.payload;
      setTasks((prev) =>
        prev.map((task) =>
          task.taskId === progress.task_id
            ? {
                ...task,
                downloaded: progress.downloaded,
                total: progress.total,
                speed: progress.speed,
                status: progress.status,
              }
            : task,
        ),
      );

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

  const handleParse = useCallback(async () => {
    if (!url.trim()) return;
    setParsing(true);
    setVideoInfo(null);
    setSelectedFormat("");
    try {
      const info = await parseVideoUrl(url.trim());
      setVideoInfo(info);
      // Save parse record
      saveVideoRecord({
        url: url.trim(),
        title: info.title,
        coverUrl: info.cover_url,
        duration: info.duration,
        platform: info.platform,
        formats: JSON.stringify(info.formats),
      }).catch(() => {
        // Silently ignore save failures
      });
      if (info.formats.length > 0) {
        setSelectedFormat(info.formats[0].quality);
      }
    } catch (e: unknown) {
      const err = e as { message?: string };
      toast.error(err.message || t.videoDownload.unsupportedUrl);
    } finally {
      setParsing(false);
    }
  }, [url, t]);

  const selectedFormatInfo = useMemo(() => {
    if (!videoInfo || !selectedFormat) return null;
    return videoInfo.formats.find((f) => f.quality === selectedFormat) ?? null;
  }, [videoInfo, selectedFormat]);

  const handleDownload = useCallback(async (audioOnly: boolean) => {
    if (!videoInfo || !selectedFormat) return;
    const format = videoInfo.formats.find((f) => f.quality === selectedFormat);
    if (!format) return;
    if (audioOnly && !format.audio_url) {
      toast.error(t.videoDownload.audioNotAvailable);
      return;
    }

    const taskId = crypto.randomUUID();
    const newTask: DownloadTask = {
      taskId,
      title: videoInfo.title,
      platform: videoInfo.platform,
      quality: format.quality,
      savePath: "",
      downloaded: 0,
      total: audioOnly ? null : format.size,
      speed: 0,
      status: "Downloading",
    };

    setTasks((prev) => [newTask, ...prev]);

    try {
      const savePath = await downloadVideo({
        taskId,
        title: videoInfo.title,
        videoUrl: format.url,
        audioUrl: format.audio_url,
        quality: format.quality,
        saveDir: null,
        audioOnly,
      });
      setTasks((prev) =>
        prev.map((task) => (task.taskId === taskId ? { ...task, savePath } : task)),
      );
      toast.success(t.videoDownload.downloadStarted);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setTasks((prev) =>
        prev.map((task) =>
          task.taskId === taskId
            ? { ...task, status: { Failed: err.message || "Unknown error" } }
            : task,
        ),
      );
      toast.error(err.message || t.videoDownload.downloadFailed);
    }
  }, [videoInfo, selectedFormat, t]);

  const handleCancel = useCallback(async (taskId: string) => {
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

  const videoProxyUrl = useMemo(() => {
    if (!videoInfo || !selectedFormat || !serverPort) return null;
    const format = videoInfo.formats.find((f) => f.quality === selectedFormat);
    if (!format) return null;
    return `http://127.0.0.1:${serverPort}/video-proxy?url=${encodeURIComponent(format.url)}`;
  }, [videoInfo, selectedFormat, serverPort]);

  const audioProxyUrl = useMemo(() => {
    if (!videoInfo || !selectedFormat || !serverPort) return null;
    const format = videoInfo.formats.find((f) => f.quality === selectedFormat);
    if (!format?.audio_url) return null;
    return `http://127.0.0.1:${serverPort}/video-proxy?url=${encodeURIComponent(format.audio_url)}`;
  }, [videoInfo, selectedFormat, serverPort]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={t.videoDownload.title}
        description={t.videoDownload.subtitle}
        actions={
          <Button variant="outline" size="icon" onClick={() => navigate("/video-records")}>
            <History className="h-4 w-4" />
          </Button>
        }
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* URL Input */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Link className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 pl-9 text-sm"
              placeholder={t.videoDownload.urlPlaceholder}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleParse()}
            />
          </div>
          <Button size="sm" onClick={handleParse} disabled={parsing || !url.trim()}>
            {parsing && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {parsing ? t.videoDownload.parsing : t.videoDownload.parse}
          </Button>
        </div>

        {/* Video Info, Controls & Player */}
        {videoInfo && (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-medium line-clamp-2">{videoInfo.title}</h3>
                <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                  <PlatformBadge platform={videoInfo.platform} />
                  {videoInfo.duration && <span>{formatDuration(videoInfo.duration)}</span>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Select value={selectedFormat} onValueChange={setSelectedFormat}>
                  <SelectTrigger className="h-8 w-36 text-xs">
                    <SelectValue placeholder={t.videoDownload.selectQuality} />
                  </SelectTrigger>
                  <SelectContent>
                    {videoInfo.formats.map((f) => (
                      <SelectItem key={f.quality} value={f.quality} className="text-xs">
                        {f.quality}
                        {f.size ? ` (${formatBytes(f.size)})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={() => handleDownload(false)} disabled={!selectedFormat}>
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  {t.videoDownload.download}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleDownload(true)}
                  disabled={!selectedFormatInfo?.audio_url}
                >
                  <Music className="mr-1.5 h-3.5 w-3.5" />
                  {t.videoDownload.downloadAudio}
                </Button>
              </div>
            </div>
            {videoProxyUrl && (
              <div className="overflow-hidden rounded-lg bg-black">
                <DashPlayer
                  key={videoProxyUrl}
                  videoUrl={videoProxyUrl}
                  audioUrl={audioProxyUrl}
                  className="max-h-[480px]"
                />
              </div>
            )}
          </div>
        )}

        {/* Download Tasks */}
        {tasks.length > 0 && (
          <div className="space-y-2">
            {tasks.map((task) => (
              <Card key={task.taskId} className="overflow-hidden">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{task.title}</span>
                        <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                          task.status === "Completed"
                            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                            : task.status === "Downloading"
                            ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                            : task.status === "Cancelled"
                            ? "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400"
                            : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                        }`}>
                          {getStatusLabel(task.status, t)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex gap-3 text-xs text-muted-foreground">
                        <PlatformBadge platform={task.platform} />
                        <span>{task.quality}</span>
                        {task.status === "Downloading" && task.speed > 0 && (
                          <span>{formatSpeed(task.speed)}</span>
                        )}
                        {task.total && (
                          <span>
                            {formatBytes(task.downloaded)} / {formatBytes(task.total)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5">
                      {task.status === "Downloading" && (
                        <Button variant="ghost" size="icon-sm" onClick={() => handleCancel(task.taskId)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {task.status === "Completed" && task.savePath && (
                        <Button variant="ghost" size="icon-sm" onClick={() => handleOpenFolder(task.savePath)}>
                          <FolderOpen className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {task.status === "Downloading" && (
                    <Progress
                      className="mt-2 h-1"
                      value={task.total ? (task.downloaded / task.total) * 100 : undefined}
                    />
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

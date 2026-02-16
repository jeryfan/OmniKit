# Video Records Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add persistent video parse records with a dedicated page for browsing, deleting, downloading, and watching parsed videos.

**Architecture:** New SQLite table `video_records` stores parse results. Backend exposes CRUD IPC commands. Frontend adds a `/video-records` page with card-based list showing cover thumbnails, inline video player, download/delete actions. Entry point is a history icon on the VideoDownload page header.

**Tech Stack:** Rust (sqlx, serde), React 19, TypeScript, shadcn/ui, Tailwind CSS, Tauri IPC

---

### Task 1: Database Migration

**Files:**
- Create: `src-tauri/migrations/006_video_records.sql`

**Step 1: Create the migration file**

```sql
-- Video parse records
CREATE TABLE IF NOT EXISTS video_records (
    id TEXT PRIMARY KEY NOT NULL,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    cover_url TEXT,
    duration INTEGER,
    platform TEXT NOT NULL,
    formats TEXT NOT NULL,
    download_status TEXT NOT NULL DEFAULT 'pending',
    save_path TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_video_records_created_at ON video_records(created_at);
```

**Step 2: Verify compilation**

Run: `cd src-tauri && cargo check`
Expected: PASS (sqlx migrate macro picks up new file automatically)

---

### Task 2: Rust Model & IPC Commands

**Files:**
- Modify: `src-tauri/src/db/models.rs` — add `VideoRecord` struct
- Modify: `src-tauri/src/commands/video.rs` — add 4 new commands
- Modify: `src-tauri/src/lib.rs` — register new commands

**Step 1: Add VideoRecord model to `src-tauri/src/db/models.rs`**

Append after the last struct:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct VideoRecord {
    pub id: String,
    pub url: String,
    pub title: String,
    pub cover_url: Option<String>,
    pub duration: Option<i64>,
    pub platform: String,
    pub formats: String,
    pub download_status: String,
    pub save_path: Option<String>,
    pub created_at: String,
}
```

**Step 2: Add IPC commands to `src-tauri/src/commands/video.rs`**

Add these imports at the top:

```rust
use crate::db::models::VideoRecord;
use sqlx::SqlitePool;
```

Add a helper to get the pool from AppState:

```rust
use crate::AppState;
```

Add these commands:

```rust
#[tauri::command]
pub async fn save_video_record(
    state: State<'_, AppState>,
    url: String,
    title: String,
    cover_url: Option<String>,
    duration: Option<i64>,
    platform: String,
    formats: String,
) -> Result<VideoRecord, IpcError> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO video_records (id, url, title, cover_url, duration, platform, formats, download_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)"
    )
    .bind(&id)
    .bind(&url)
    .bind(&title)
    .bind(&cover_url)
    .bind(&duration)
    .bind(&platform)
    .bind(&formats)
    .bind(&now)
    .execute(&state.db)
    .await
    .map_err(|e| IpcError::internal(e.to_string()))?;

    let record = sqlx::query_as::<_, VideoRecord>("SELECT * FROM video_records WHERE id = ?")
        .bind(&id)
        .fetch_one(&state.db)
        .await
        .map_err(|e| IpcError::internal(e.to_string()))?;

    Ok(record)
}

#[tauri::command]
pub async fn list_video_records(
    state: State<'_, AppState>,
) -> Result<Vec<VideoRecord>, IpcError> {
    let records = sqlx::query_as::<_, VideoRecord>(
        "SELECT * FROM video_records ORDER BY created_at DESC"
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| IpcError::internal(e.to_string()))?;

    Ok(records)
}

#[tauri::command]
pub async fn delete_video_record(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), IpcError> {
    sqlx::query("DELETE FROM video_records WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await
        .map_err(|e| IpcError::internal(e.to_string()))?;
    Ok(())
}

#[tauri::command]
pub async fn update_video_record_status(
    state: State<'_, AppState>,
    id: String,
    download_status: String,
    save_path: Option<String>,
) -> Result<(), IpcError> {
    sqlx::query(
        "UPDATE video_records SET download_status = ?, save_path = ? WHERE id = ?"
    )
    .bind(&download_status)
    .bind(&save_path)
    .bind(&id)
    .execute(&state.db)
    .await
    .map_err(|e| IpcError::internal(e.to_string()))?;
    Ok(())
}
```

**Step 3: Register commands in `src-tauri/src/lib.rs`**

Add after the existing `commands::video::open_in_folder` line in the `invoke_handler`:

```rust
commands::video::save_video_record,
commands::video::list_video_records,
commands::video::delete_video_record,
commands::video::update_video_record_status,
```

**Step 4: Verify compilation**

Run: `cd src-tauri && cargo check`
Expected: PASS

---

### Task 3: Frontend IPC Wrappers

**Files:**
- Modify: `src/lib/tauri.ts` — add types and IPC functions

**Step 1: Add VideoRecord type and IPC functions**

Add after the `openInFolder` function at the end of the video section:

```typescript
// === Video Records ===

export interface VideoRecord {
  id: string;
  url: string;
  title: string;
  cover_url: string | null;
  duration: number | null;
  platform: string;
  formats: string; // JSON string of VideoFormat[]
  download_status: string; // "pending" | "downloaded" | "failed"
  save_path: string | null;
  created_at: string;
}

export async function saveVideoRecord(params: {
  url: string;
  title: string;
  coverUrl: string | null;
  duration: number | null;
  platform: string;
  formats: string;
}): Promise<VideoRecord> {
  return invoke<VideoRecord>("save_video_record", {
    url: params.url,
    title: params.title,
    coverUrl: params.coverUrl,
    duration: params.duration,
    platform: params.platform,
    formats: params.formats,
  });
}

export async function listVideoRecords(): Promise<VideoRecord[]> {
  return invoke<VideoRecord[]>("list_video_records");
}

export async function deleteVideoRecord(id: string): Promise<void> {
  return invoke<void>("delete_video_record", { id });
}

export async function updateVideoRecordStatus(params: {
  id: string;
  downloadStatus: string;
  savePath: string | null;
}): Promise<void> {
  return invoke<void>("update_video_record_status", {
    id: params.id,
    downloadStatus: params.downloadStatus,
    savePath: params.savePath,
  });
}
```

---

### Task 4: i18n Translations

**Files:**
- Modify: `src/lib/i18n.tsx` — add `videoRecords` section to Translations type and both language objects

**Step 1: Add type definition**

Add to the `Translations` interface after `videoDownload`:

```typescript
videoRecords: {
  title: string;
  subtitle: string;
  noRecords: string;
  noRecordsHint: string;
  watch: string;
  deleteRecord: string;
  deleteConfirm: string;
  downloaded: string;
  pending: string;
  failed: string;
  backToDownload: string;
};
```

Also add to `sidebar` interface:

```typescript
videoRecords: string;
```

**Step 2: Add English translations**

Add to `en` object after `videoDownload`:

```typescript
videoRecords: {
  title: "Video Records",
  subtitle: "Browse and manage your parsed video history.",
  noRecords: "No video records yet",
  noRecordsHint: "Parse a video URL to create your first record.",
  watch: "Watch",
  deleteRecord: "Delete Record",
  deleteConfirm: "Are you sure you want to delete this record?",
  downloaded: "Downloaded",
  pending: "Not downloaded",
  failed: "Download failed",
  backToDownload: "Back to Download",
},
```

Add to `en.sidebar`:

```typescript
videoRecords: "Video Records",
```

**Step 3: Add Chinese translations**

Add to `zh` object after `videoDownload`:

```typescript
videoRecords: {
  title: "解析记录",
  subtitle: "浏览和管理视频解析历史。",
  noRecords: "暂无解析记录",
  noRecordsHint: "解析一个视频链接以创建第一条记录。",
  watch: "观看",
  deleteRecord: "删除记录",
  deleteConfirm: "确定要删除此记录吗？",
  downloaded: "已下载",
  pending: "未下载",
  failed: "下载失败",
  backToDownload: "返回下载",
},
```

Add to `zh.sidebar`:

```typescript
videoRecords: "解析记录",
```

---

### Task 5: VideoRecords Page

**Files:**
- Create: `src/pages/VideoRecords.tsx`

**Step 1: Create the VideoRecords page**

```tsx
import { useState, useEffect, useCallback, useMemo } from "react";
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
      setActiveDownloads((prev) =>
        prev.map((dl) =>
          dl.taskId === progress.task_id
            ? { ...dl, downloaded: progress.downloaded, total: progress.total, speed: progress.speed, status: progress.status }
            : dl,
        ),
      );

      if (progress.status === "Completed") {
        const dl = activeDownloads.find((d) => d.taskId === progress.task_id);
        if (dl) {
          // Will be updated via the savePath callback
          toast.success(t.videoDownload.downloadComplete);
        }
      } else if (typeof progress.status === "object" && "Failed" in progress.status) {
        toast.error(`${t.videoDownload.downloadFailed}: ${progress.status.Failed}`);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [t, activeDownloads]);

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
    const format = formats[0]; // Use best quality

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
      await updateVideoRecordStatus({ id: record.id, downloadStatus: "failed", savePath: null });
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
                      {/* Cover thumbnail */}
                      {record.cover_url && (
                        <div className="h-20 w-36 shrink-0 overflow-hidden rounded-md bg-muted">
                          <img
                            src={record.cover_url}
                            alt={record.title}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      )}

                      {/* Info */}
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

                          {/* Actions */}
                          <div className="flex shrink-0 items-center gap-1">
                            {/* Watch */}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setPlayingId(playingId === record.id ? null : record.id)}
                              title={t.videoRecords.watch}
                            >
                              <Play className="h-4 w-4" />
                            </Button>

                            {/* Download */}
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

                            {/* Cancel download */}
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

                            {/* Open folder */}
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

                            {/* Delete */}
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

                        {/* Download progress */}
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

                    {/* Inline player */}
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

      {/* Delete confirmation dialog */}
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
```

---

### Task 6: Wire Up Routing & Entry Point

**Files:**
- Modify: `src/App.tsx` — add route
- Modify: `src/pages/VideoDownload.tsx` — add history icon button in PageHeader

**Step 1: Add route in `src/App.tsx`**

Add import:
```typescript
import VideoRecords from "@/pages/VideoRecords";
```

Add route after the video-download route:
```tsx
<Route path="video-records" element={<VideoRecords />} />
```

**Step 2: Add history icon in VideoDownload page**

In `src/pages/VideoDownload.tsx`:

Add import for `History` icon:
```typescript
import { Download, FolderOpen, History, Link, Loader2, X } from "lucide-react";
```

Add import for `useNavigate`:
```typescript
import { useNavigate } from "react-router";
```

Add inside the component:
```typescript
const navigate = useNavigate();
```

Change the PageHeader to include an actions prop:
```tsx
<PageHeader
  title={t.videoDownload.title}
  description={t.videoDownload.subtitle}
  actions={
    <Button variant="outline" size="icon" onClick={() => navigate("/video-records")}>
      <History className="h-4 w-4" />
    </Button>
  }
/>
```

**Step 3: Save record on successful parse**

In `src/pages/VideoDownload.tsx`, add import:
```typescript
import { saveVideoRecord } from "@/lib/tauri";
```

In the `handleParse` function, after `setVideoInfo(info)`, add:
```typescript
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
```

---

### Task 7: Verify & Build

**Step 1: Full build check**

Run: `cd src-tauri && cargo check`
Expected: PASS

Run: `cd .. && npm run build`
Expected: PASS (or at least no TypeScript errors)

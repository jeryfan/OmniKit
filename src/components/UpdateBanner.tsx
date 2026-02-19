import { useState, useEffect } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { X, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/i18n";

const IGNORED_VERSION_KEY = "omnikit-ignored-update-version";

export function UpdateBanner() {
  const { t } = useLanguage();
  const [update, setUpdate] = useState<Update | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [error, setError] = useState<string>("");

  const doCheck = async (bypassIgnore: boolean) => {
    try {
      const result = await check();
      if (result) {
        const ignoredVersion = localStorage.getItem(IGNORED_VERSION_KEY);
        if (!bypassIgnore && ignoredVersion === result.version) {
          return;
        }
        setUpdate(result);
        setDismissed(false);
      }
    } catch {
      // Silently ignore check failures on startup
    }
  };

  useEffect(() => {
    doCheck(false);
  }, []);

  // Listen for manual check trigger from Settings page
  useEffect(() => {
    const handler = () => doCheck(true);
    window.addEventListener("omnikit-check-update", handler);
    return () => window.removeEventListener("omnikit-check-update", handler);
  }, []);

  const handleUpdate = async () => {
    if (!update) return;
    setDownloading(true);
    setError("");
    setProgress(t.updater.downloading);
    let downloaded = 0;
    let totalSize = 0;
    try {
      console.log("[Updater] Starting download and install...");
      await update.downloadAndInstall((event) => {
        console.log("[Updater] Event:", event);
        if (event.event === "Started") {
          totalSize = event.data.contentLength ?? 0;
          if (totalSize) {
            const totalMB = (totalSize / 1024 / 1024).toFixed(1);
            setProgress(`${t.updater.downloading} (0 / ${totalMB} MB)`);
          } else {
            setProgress(t.updater.downloading);
          }
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          const downloadedMB = (downloaded / 1024 / 1024).toFixed(1);
          if (totalSize) {
            const totalMB = (totalSize / 1024 / 1024).toFixed(1);
            const percent = Math.round((downloaded / totalSize) * 100);
            setProgress(`${t.updater.downloading} (${percent}% — ${downloadedMB} / ${totalMB} MB)`);
          } else {
            setProgress(`${t.updater.downloading} (${downloadedMB} MB)`);
          }
        } else if (event.event === "Finished") {
          setProgress(t.updater.installing);
        }
      });
      console.log("[Updater] Download and install completed, relaunching...");
      await relaunch();
    } catch (err) {
      console.error("[Updater] Error during update:", err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(`${t.updater.updateFailed}${errorMsg ? `: ${errorMsg}` : ""}`);
      setDownloading(false);
    }
  };

  const handleIgnore = () => {
    if (update) {
      localStorage.setItem(IGNORED_VERSION_KEY, update.version);
    }
    setDismissed(true);
  };

  if (!update || dismissed) return null;

  return (
    <div className="flex items-center justify-between gap-4 border-b bg-blue-500/10 px-6 py-2.5 text-sm">
      <div className="flex items-center gap-2">
        <Download className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
        <span className="text-blue-700 dark:text-blue-300">
          {t.updater.newVersion(update.version)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {downloading ? (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {progress}
          </span>
        ) : (
          <>
            {error && (
              <span className="text-xs text-red-600 dark:text-red-400 mr-2">{error}</span>
            )}
            <Button size="sm" variant="default" className="h-7 text-xs" onClick={handleUpdate}>
              {error ? t.updater.retry : t.updater.updateNow}
            </Button>
            <button
              onClick={handleIgnore}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {t.updater.ignoreThisVersion}
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="text-muted-foreground hover:text-foreground transition-colors ml-1"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

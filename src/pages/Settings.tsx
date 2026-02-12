import { useState, useEffect } from "react";
import { Loader2, Sun, Moon, Monitor, Server, Palette, Info, Languages, Save, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useTheme } from "@/components/layout/ThemeProvider";
import { getConfig, getServerStatus, updateConfig } from "@/lib/tauri";
import type { AppConfig, ServerStatus } from "@/lib/tauri";
import { useLanguage } from "@/lib/i18n";

export default function Settings() {
  const { theme, setTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [loading, setLoading] = useState(true);

  // Editable form state
  const [editPort, setEditPort] = useState("");
  const [editRetention, setEditRetention] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [portChanged, setPortChanged] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [cfg, status] = await Promise.all([
          getConfig(),
          getServerStatus(),
        ]);
        setConfig(cfg);
        setEditPort(String(cfg.server_port));
        setEditRetention(String(cfg.log_retention_days));
        setServerStatus(status);
      } catch (err) {
        console.error("Failed to load settings:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleSave = async () => {
    const port = parseInt(editPort, 10);
    const retention = parseInt(editRetention, 10);
    if (isNaN(port) || port < 1 || port > 65535) return;
    if (isNaN(retention) || retention < 1) return;

    setSaving(true);
    setSaveSuccess(false);
    const portWillChange = config !== null && config.server_port !== port;
    try {
      const updated = await updateConfig({
        server_port: port,
        log_retention_days: retention,
      });
      setConfig(updated);
      setSaveSuccess(true);
      setPortChanged(portWillChange);
      setTimeout(() => { setSaveSuccess(false); setPortChanged(false); }, 5000);
    } catch (err) {
      console.error("Failed to save config:", err);
    } finally {
      setSaving(false);
    }
  };

  const hasChanges =
    config !== null &&
    (String(config.server_port) !== editPort ||
      String(config.log_retention_days) !== editRetention);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const themeOptions: { value: "light" | "dark" | "system"; label: string; icon: React.ReactNode }[] = [
    { value: "light", label: t.settings.light, icon: <Sun className="h-4 w-4" /> },
    { value: "dark", label: t.settings.dark, icon: <Moon className="h-4 w-4" /> },
    { value: "system", label: t.settings.system, icon: <Monitor className="h-4 w-4" /> },
  ];

  const isServerOk = serverStatus?.status === "ok";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{t.settings.title}</h1>
        <p className="mt-1 text-muted-foreground">
          {t.settings.subtitle}
        </p>
      </div>

      {/* Server Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            {t.settings.serverConfig}
          </CardTitle>
          <CardDescription>
            {t.settings.serverConfigDesc}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Server Port */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-muted-foreground">
                {t.settings.serverPort}
              </label>
              <Input
                type="number"
                min={1}
                max={65535}
                value={editPort}
                onChange={(e) => setEditPort(e.target.value)}
                className="font-mono w-32"
              />
              <p className="text-xs text-muted-foreground">
                {t.settings.requiresRestart}
              </p>
            </div>

            {/* Log Retention */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-muted-foreground">
                {t.settings.logRetention}
              </label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  value={editRetention}
                  onChange={(e) => setEditRetention(e.target.value)}
                  className="font-mono w-32"
                />
                <span className="text-sm text-muted-foreground">{t.settings.days}</span>
              </div>
            </div>

            {/* Server Status */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-muted-foreground">
                {t.settings.serverStatusLabel}
              </label>
              <div>
                <Badge
                  className={
                    isServerOk
                      ? "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/25"
                      : "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/25"
                  }
                  variant="outline"
                >
                  {isServerOk ? t.settings.running : serverStatus?.status ?? t.settings.unknown}
                </Badge>
              </div>
              {serverStatus?.message && (
                <p className="text-xs text-muted-foreground">
                  {serverStatus.message}
                </p>
              )}
            </div>

            {/* Version */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-muted-foreground">
                {t.settings.versionLabel}
              </label>
              <div className="text-sm font-mono">
                {serverStatus?.version ?? "--"}
              </div>
            </div>
          </div>

          {/* Save button + hint */}
          <div className="mt-4 flex items-center gap-3">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className="gap-2"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {t.common.save}
            </Button>
            {saveSuccess && (
              <span className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-4 w-4" />
                {t.settings.saveSuccess}
                {portChanged && (
                  <span className="text-muted-foreground ml-1">— {t.settings.restartHint}</span>
                )}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            {t.settings.appearance}
          </CardTitle>
          <CardDescription>
            {t.settings.appearanceDesc}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <label className="text-sm font-medium text-muted-foreground">
              {t.settings.theme}
            </label>
            <div className="flex gap-2">
              {themeOptions.map((option) => (
                <Button
                  key={option.value}
                  variant={theme === option.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTheme(option.value)}
                  className="gap-2"
                >
                  {option.icon}
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Language */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Languages className="h-5 w-5" />
            {t.settings.languageLabel}
          </CardTitle>
          <CardDescription>
            {t.settings.languageDesc}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <label className="text-sm font-medium text-muted-foreground">
              {t.settings.languageLabel}
            </label>
            <div className="flex gap-2">
              <Button
                variant={language === "en" ? "default" : "outline"}
                size="sm"
                onClick={() => setLanguage("en")}
              >
                English
              </Button>
              <Button
                variant={language === "zh" ? "default" : "outline"}
                size="sm"
                onClick={() => setLanguage("zh")}
              >
                中文
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            {t.settings.about}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-sm font-medium text-muted-foreground">
                  {t.settings.application}
                </label>
                <div className="text-sm font-semibold">AnyLLM</div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-muted-foreground">
                  {t.settings.description}
                </label>
                <div className="text-sm">{t.settings.descriptionText}</div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-muted-foreground">
                  {t.settings.license}
                </label>
                <div className="text-sm">Apache 2.0</div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-muted-foreground">
                  {t.settings.techStack}
                </label>
                <div className="text-sm">Tauri v2 + React + Rust</div>
              </div>
            </div>

            <Separator />

            <p className="text-xs text-muted-foreground">
              {t.settings.aboutText}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

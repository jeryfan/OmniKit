import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, FlaskConical, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import HttpTestPanel from "@/components/HttpTestPanel";
import {
  Route,
  TargetInput,
  SUPPORTED_FORMATS,
  listRoutes,
  createRoute,
  updateRoute,
  deleteRoute,
  parseIpcError,
  getConfig,
} from "@/lib/tauri";

interface TargetFormState {
  upstream_format: string;
  base_url: string;
  weight: number;
  enabled: boolean;
  key_rotation: boolean;
  keys: string[];
  expanded: boolean;
}

interface RouteFormState {
  name: string;
  path_prefix: string;
  input_format: string;
  enabled: boolean;
  targets: TargetFormState[];
}

const defaultTarget = (): TargetFormState => ({
  upstream_format: "openai-chat",
  base_url: "",
  weight: 1,
  enabled: true,
  key_rotation: true,
  keys: [""],
  expanded: true,
});

const defaultForm = (): RouteFormState => ({
  name: "",
  path_prefix: "/",
  input_format: "anthropic",
  enabled: true,
  targets: [defaultTarget()],
});

function formatLabel(value: string): string {
  return SUPPORTED_FORMATS.find((f) => f.value === value)?.label ?? value;
}

interface RoutesProps {
  embedded?: boolean;
}

export default function Routes({ embedded }: RoutesProps) {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<Route | null>(null);
  const [form, setForm] = useState<RouteFormState>(defaultForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Set of "ti-ki" keys that are currently visible (not masked)
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Route test dialog
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testDialogTitle, setTestDialogTitle] = useState("");
  const [testPanelInfo, setTestPanelInfo] = useState<{
    url: string;
    headers: Array<{ key: string; value: string }>;
    body: string;
  } | null>(null);
  const [testPanelKey, setTestPanelKey] = useState(0);

  // Upstream target test dialog
  const [upstreamTestOpen, setUpstreamTestOpen] = useState(false);
  const [upstreamTestTitle, setUpstreamTestTitle] = useState("");
  const [upstreamTestInfo, setUpstreamTestInfo] = useState<{
    url: string;
    headers: Array<{ key: string; value: string }>;
    body: string;
  } | null>(null);
  const [upstreamTestKey, setUpstreamTestKey] = useState(0);

  const [serverPort, setServerPort] = useState<number>(9000);

  useEffect(() => {
    load();
    getConfig().then((c) => setServerPort(c.server_port));
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setRoutes(await listRoutes());
    } catch (e) {
      setError(parseIpcError(e).message);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditingRoute(null);
    setForm(defaultForm());
    setFormError(null);
    setDialogOpen(true);
  }

  function openEdit(route: Route) {
    setEditingRoute(route);
    setForm({
      name: route.name,
      path_prefix: route.path_prefix,
      input_format: route.input_format,
      enabled: route.enabled,
      targets: route.targets.map((t) => ({
        upstream_format: t.upstream_format,
        base_url: t.base_url,
        weight: t.weight,
        enabled: t.enabled,
        key_rotation: t.key_rotation,
        keys: t.keys.length > 0 ? t.keys.map((k) => k.key_value) : [""],
        expanded: true,
      })),
    });
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleSave() {
    setFormError(null);

    if (!form.name.trim()) {
      setFormError("请输入路由名称");
      return;
    }
    if (!form.path_prefix.startsWith("/") || form.path_prefix.length < 2) {
      setFormError("路径前缀必须以 / 开头且不能为空");
      return;
    }
    if (form.path_prefix.slice(1).includes("/")) {
      setFormError("路径前缀只能有一个层级，例如 /anthropic");
      return;
    }
    if (form.targets.length === 0) {
      setFormError("至少需要一个上游目标");
      return;
    }
    for (const t of form.targets) {
      if (!t.base_url.trim()) {
        setFormError("每个目标都需要填写 Base URL");
        return;
      }
      if (t.upstream_format !== "none") {
        const validKeys = t.keys.filter((k) => k.trim());
        if (validKeys.length === 0) {
          setFormError("每个目标至少需要一个 API Key");
          return;
        }
      }
    }

    const targets: TargetInput[] = form.targets.map((t) => ({
      upstream_format: t.upstream_format,
      base_url: t.base_url.trim(),
      weight: t.weight,
      enabled: t.enabled,
      key_rotation: t.key_rotation,
      keys: t.keys.filter((k) => k.trim()),
    }));

    setSaving(true);
    try {
      if (editingRoute) {
        await updateRoute({
          id: editingRoute.id,
          name: form.name.trim(),
          path_prefix: form.path_prefix.trim(),
          input_format: form.input_format,
          enabled: form.enabled,
          targets,
        });
      } else {
        await createRoute({
          name: form.name.trim(),
          path_prefix: form.path_prefix.trim(),
          input_format: form.input_format,
          enabled: form.enabled,
          targets,
        });
      }
      setDialogOpen(false);
      setVisibleKeys(new Set());
    } catch (e) {
      setFormError(parseIpcError(e).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      await deleteRoute(deleteId);
      await load();
    } catch (e) {
      setError(parseIpcError(e).message);
    } finally {
      setDeleteId(null);
    }
  }

  function openTest(route: Route) {
    const url = `http://localhost:${serverPort}${route.path_prefix}${getTestPath(route.input_format)}`;
    setTestDialogTitle(`测试路由 "${route.name}"`);
    setTestPanelInfo({
      url,
      headers: [
        { key: "Authorization", value: "Bearer " },
        { key: "Content-Type", value: "application/json" },
      ],
      body: getTestBody(route.input_format),
    });
    setTestPanelKey((k) => k + 1);
    setTestDialogOpen(true);
  }

  function getTestPath(inputFormat: string): string {
    const paths: Record<string, string> = {
      anthropic: "/v1/messages",
      "openai-chat": "/v1/chat/completions",
      moonshot: "/v1/chat/completions",
      "openai-responses": "/v1/responses",
      gemini: "/v1beta/models/gemini-pro:generateContent",
    };
    return paths[inputFormat] ?? "/v1/chat/completions";
  }

  function getTestBody(inputFormat: string): string {
    const bodies: Record<string, object> = {
      anthropic: { model: "claude-3-haiku-20240307", max_tokens: 10, messages: [{ role: "user", content: "Hi" }] },
      "openai-chat": { model: "gpt-3.5-turbo", max_tokens: 10, messages: [{ role: "user", content: "Hi" }] },
      moonshot: { model: "moonshot-v1-8k", max_tokens: 10, messages: [{ role: "user", content: "Hi" }] },
      "openai-responses": { model: "gpt-3.5-turbo", max_tokens: 10, input: "Hi" },
      gemini: { contents: [{ parts: [{ text: "Hi" }] }] },
    };
    return JSON.stringify(bodies[inputFormat] ?? bodies["openai-chat"], null, 2);
  }

  function buildUpstreamTestUrl(baseUrl: string, upstreamFormat: string): string {
    const base = baseUrl.trim().replace(/\/$/, "");
    switch (upstreamFormat) {
      case "openai-chat":
      case "moonshot":
        return `${base}/v1/chat/completions`;
      case "openai-responses":
        return `${base}/v1/responses`;
      case "anthropic":
        return `${base}/v1/messages`;
      case "gemini":
        return `${base}/v1beta/models/gemini-pro:generateContent`;
      default:
        return `${base}/v1/chat/completions`;
    }
  }

  function buildUpstreamHeaders(
    upstreamFormat: string,
    apiKey: string
  ): Array<{ key: string; value: string }> {
    const ct = { key: "Content-Type", value: "application/json" };
    switch (upstreamFormat) {
      case "anthropic":
        return [
          { key: "x-api-key", value: apiKey },
          { key: "anthropic-version", value: "2023-06-01" },
          ct,
        ];
      case "gemini":
        return [{ key: "x-goog-api-key", value: apiKey }, ct];
      default:
        return [{ key: "Authorization", value: `Bearer ${apiKey}` }, ct];
    }
  }

  function openUpstreamTest(target: TargetFormState, targetIdx: number) {
    const firstKey = target.keys.find((k) => k.trim()) ?? "";
    setUpstreamTestTitle(`测试上游目标 ${targetIdx + 1}${target.base_url ? ` · ${target.base_url}` : ""}`);
    setUpstreamTestInfo({
      url: buildUpstreamTestUrl(target.base_url, target.upstream_format),
      headers: buildUpstreamHeaders(target.upstream_format, firstKey),
      body: getTestBody(target.upstream_format),
    });
    setUpstreamTestKey((k) => k + 1);
    setUpstreamTestOpen(true);
  }

  function updateTarget(idx: number, patch: Partial<TargetFormState>) {
    setForm((prev) => ({
      ...prev,
      targets: prev.targets.map((t, i) => (i === idx ? { ...t, ...patch } : t)),
    }));
  }

  function addTarget() {
    setForm((prev) => ({ ...prev, targets: [...prev.targets, defaultTarget()] }));
  }

  function removeTarget(idx: number) {
    setForm((prev) => ({
      ...prev,
      targets: prev.targets.filter((_, i) => i !== idx),
    }));
  }

  function updateKey(targetIdx: number, keyIdx: number, value: string) {
    setForm((prev) => ({
      ...prev,
      targets: prev.targets.map((t, i) =>
        i === targetIdx
          ? { ...t, keys: t.keys.map((k, j) => (j === keyIdx ? value : k)) }
          : t
      ),
    }));
  }

  function addKey(targetIdx: number) {
    setForm((prev) => ({
      ...prev,
      targets: prev.targets.map((t, i) =>
        i === targetIdx ? { ...t, keys: [...t.keys, ""] } : t
      ),
    }));
  }

  function removeKey(targetIdx: number, keyIdx: number) {
    setForm((prev) => ({
      ...prev,
      targets: prev.targets.map((t, i) =>
        i === targetIdx ? { ...t, keys: t.keys.filter((_, j) => j !== keyIdx) } : t
      ),
    }));
  }

  const containerClass = embedded ? "" : "container mx-auto";

  return (
    <div className={containerClass}>
      <div className="mb-4 flex items-center justify-end">
        <Button onClick={openCreate} size="sm">
          <Plus className="mr-1 h-4 w-4" />
          新建路由
        </Button>
      </div>

      {error && (
        <div className="text-destructive mb-4 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="text-muted-foreground text-sm">加载中...</div>
      ) : routes.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed py-12 text-center text-sm">
          暂无路由，点击「新建路由」开始配置
        </div>
      ) : (
        <div className="space-y-3">
          {routes.map((route) => (
            <div key={route.id} className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{route.name}</span>
                      <code className="bg-muted rounded px-1.5 py-0.5 text-xs">
                        {route.path_prefix}
                      </code>
                      <Badge variant="outline" className="text-xs">
                        {formatLabel(route.input_format)}
                      </Badge>
                      {!route.enabled && (
                        <Badge variant="secondary" className="text-xs">
                          已禁用
                        </Badge>
                      )}
                    </div>
                    <div className="text-muted-foreground mt-1 text-xs">
                      {route.targets.filter((t) => t.enabled).length} 个活跃目标
                      {" · "}
                      {route.targets.reduce((n, t) => n + t.keys.length, 0)} 个 Key
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => openTest(route)}>
                    测试
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(route)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleteId(route.id)}>
                    <Trash2 className="text-destructive h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setVisibleKeys(new Set()); }}>
        <DialogContent className="max-h-[85vh] max-w-3xl flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>{editingRoute ? "编辑路由" : "新建路由"}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>名称</Label>
                <Input
                  placeholder="我的 Anthropic 路由"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>路径前缀</Label>
                <Input
                  placeholder="/anthropic"
                  value={form.path_prefix}
                  onChange={(e) => setForm((p) => ({ ...p, path_prefix: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>输入格式（客户端使用的格式）</Label>
                <Select
                  value={form.input_format}
                  onValueChange={(v) => setForm((p) => ({ ...p, input_format: v }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_FORMATS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2 pb-0.5">
                <Switch
                  checked={form.enabled}
                  onCheckedChange={(v) => setForm((p) => ({ ...p, enabled: v }))}
                />
                <Label>启用</Label>
              </div>
            </div>

            {/* Targets */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label className="text-base">上游目标</Label>
                <Button variant="outline" size="sm" onClick={addTarget}>
                  <Plus className="mr-1 h-3 w-3" />
                  添加目标
                </Button>
              </div>

              <div className="space-y-3">
                {form.targets.map((target, ti) => (
                  <div key={ti} className="rounded-md border p-3">
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        className="flex items-center gap-1 text-sm font-medium"
                        onClick={() => updateTarget(ti, { expanded: !target.expanded })}
                      >
                        {target.expanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                        目标 {ti + 1}
                        {target.base_url && (
                          <span className="text-muted-foreground ml-1 font-normal">
                            · {target.base_url}
                          </span>
                        )}
                      </button>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => openUpstreamTest(target, ti)}
                        >
                          <FlaskConical className="mr-1 h-3 w-3" />
                          测试
                        </Button>
                        <Switch
                          checked={target.enabled}
                          onCheckedChange={(v) => updateTarget(ti, { enabled: v })}
                        />
                        {form.targets.length > 1 && (
                          <Button variant="ghost" size="sm" onClick={() => removeTarget(ti)}>
                            <Trash2 className="text-destructive h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {target.expanded && (
                      <div className="mt-3 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs">上游格式</Label>
                            <Select
                              value={target.upstream_format}
                              onValueChange={(v) => updateTarget(ti, { upstream_format: v })}
                            >
                              <SelectTrigger className="w-full h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {SUPPORTED_FORMATS.map((f) => (
                                  <SelectItem key={f.value} value={f.value}>
                                    {f.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">权重</Label>
                            <Input
                              type="number"
                              min={1}
                              className="h-8 text-xs"
                              value={target.weight}
                              onChange={(e) =>
                                updateTarget(ti, { weight: parseInt(e.target.value) || 1 })
                              }
                            />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs">Base URL</Label>
                          <Input
                            className="h-8 text-xs"
                            placeholder="https://api.openai.com"
                            value={target.base_url}
                            onChange={(e) => updateTarget(ti, { base_url: e.target.value })}
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <Switch
                            checked={target.key_rotation}
                            onCheckedChange={(v) => updateTarget(ti, { key_rotation: v })}
                          />
                          <Label className="text-xs">Key 轮询</Label>
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs">API Keys</Label>
                          <div className="space-y-1.5">
                            {target.keys.map((key, ki) => {
                              const keyId = `${ti}-${ki}`;
                              const visible = visibleKeys.has(keyId);
                              return (
                                <div key={ki} className="flex gap-1.5">
                                  <Input
                                    className="h-7 flex-1 font-mono text-xs"
                                    placeholder="sk-..."
                                    type={visible ? "text" : "password"}
                                    value={key}
                                    onChange={(e) => updateKey(ti, ki, e.target.value)}
                                  />
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0"
                                    onClick={() =>
                                      setVisibleKeys((prev) => {
                                        const next = new Set(prev);
                                        next.has(keyId) ? next.delete(keyId) : next.add(keyId);
                                        return next;
                                      })
                                    }
                                  >
                                    {visible ? (
                                      <EyeOff className="h-3 w-3" />
                                    ) : (
                                      <Eye className="h-3 w-3" />
                                    )}
                                  </Button>
                                  {target.keys.length > 1 && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0"
                                      onClick={() => removeKey(ti, ki)}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => addKey(ti)}
                          >
                            <Plus className="mr-1 h-3 w-3" />
                            添加 Key
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {formError && <p className="text-destructive text-sm">{formError}</p>}
          </div>

          <DialogFooter className="shrink-0">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              删除路由将同时删除其所有目标和 API Key，此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Route Test Dialog */}
      <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
        <DialogContent className="w-[80vw] max-w-[80vw] sm:max-w-[80vw] h-[88vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>{testDialogTitle}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 flex flex-col py-2">
            {testPanelInfo && (
              <HttpTestPanel
                key={testPanelKey}
                defaultUrl={testPanelInfo.url}
                defaultHeaders={testPanelInfo.headers}
                defaultBody={testPanelInfo.body}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Upstream Target Test Dialog */}
      <Dialog open={upstreamTestOpen} onOpenChange={setUpstreamTestOpen}>
        <DialogContent className="w-[80vw] max-w-[80vw] sm:max-w-[80vw] h-[88vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>{upstreamTestTitle}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 flex flex-col py-2">
            {upstreamTestInfo && (
              <HttpTestPanel
                key={upstreamTestKey}
                defaultUrl={upstreamTestInfo.url}
                defaultHeaders={upstreamTestInfo.headers}
                defaultBody={upstreamTestInfo.body}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

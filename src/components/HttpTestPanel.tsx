import { useState, useRef } from "react";
import { Plus, Trash2, Check, Copy, FileInput, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import CodeEditor from "@/components/CodeEditor";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
type HttpMethod = (typeof METHODS)[number];

interface HttpHeader {
  id: string;
  key: string;
  value: string;
}

interface TestResult {
  status: number;
  body: string;
  latency_ms: number;
  error: string | null;
}

export interface HttpTestPanelProps {
  defaultUrl?: string;
  defaultMethod?: HttpMethod;
  defaultHeaders?: Array<{ key: string; value: string }>;
  defaultBody?: string;
}

let _seq = 0;
function uid() {
  return String(++_seq);
}

function formatResponseBody(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

// ── cURL parser ──────────────────────────────────────────────────────────────

interface ParsedCurl {
  url: string;
  method: HttpMethod;
  headers: Array<{ key: string; value: string }>;
  body: string;
}

/** Split a cURL string into tokens, respecting single/double quotes. */
function tokenizeCurl(input: string): string[] {
  // Normalise line continuations and collapse whitespace runs
  const flat = input.replace(/\\\r?\n\s*/g, " ").trim();
  const tokens: string[] = [];
  let i = 0;

  while (i < flat.length) {
    // skip whitespace
    while (i < flat.length && /\s/.test(flat[i])) i++;
    if (i >= flat.length) break;

    const ch = flat[i];
    if (ch === "'" || ch === '"') {
      const quote = ch;
      i++;
      let tok = "";
      while (i < flat.length && flat[i] !== quote) {
        if (flat[i] === "\\" && i + 1 < flat.length) {
          i++;
          tok += flat[i];
        } else {
          tok += flat[i];
        }
        i++;
      }
      i++; // closing quote
      tokens.push(tok);
    } else {
      let tok = "";
      while (i < flat.length && !/\s/.test(flat[i])) {
        tok += flat[i];
        i++;
      }
      tokens.push(tok);
    }
  }
  return tokens;
}

function parseCurl(input: string): ParsedCurl | null {
  const tokens = tokenizeCurl(input.trim());
  if (!tokens.length) return null;

  // Must start with 'curl' (possibly with path like /usr/bin/curl)
  if (!tokens[0].toLowerCase().endsWith("curl")) return null;

  let idx = 1;
  let url = "";
  let method: HttpMethod | null = null;
  const headers: Array<{ key: string; value: string }> = [];
  let body = "";

  const DATA_FLAGS = new Set(["-d", "--data", "--data-raw", "--data-binary", "--data-urlencode"]);
  const HEADER_FLAGS = new Set(["-H", "--header"]);
  const METHOD_FLAGS = new Set(["-X", "--request"]);
  // Flags that take a value we don't care about (skip them)
  const SKIP_VALUE_FLAGS = new Set([
    "--max-time", "-m", "--connect-timeout", "--limit-rate",
    "--user", "-u", "--proxy", "-x", "--output", "-o",
    "--cert", "--key", "--cacert", "--capath", "--user-agent", "-A",
    "--referer", "-e", "--cookie", "-b", "--cookie-jar", "-c",
    "--form", "-F", "--upload-file", "-T", "--range", "-r",
    "--retry", "--dns-servers", "--resolve", "--interface",
    "--unix-socket", "--abstract-unix-socket",
  ]);
  // Boolean flags to silently ignore
  const BOOL_FLAGS = /^-[a-zA-Z]*[sSvVkKiIgnlLfFqQwW][a-zA-Z]*$|^--(silent|verbose|insecure|fail|location|include|head|no-buffer|compressed|http[123].*)$/;

  while (idx < tokens.length) {
    const tok = tokens[idx];

    if (METHOD_FLAGS.has(tok)) {
      method = (tokens[++idx] ?? "GET") as HttpMethod;
    } else if (HEADER_FLAGS.has(tok)) {
      const raw = tokens[++idx] ?? "";
      const colon = raw.indexOf(":");
      if (colon > 0) {
        headers.push({
          key: raw.slice(0, colon).trim(),
          value: raw.slice(colon + 1).trim(),
        });
      }
    } else if (DATA_FLAGS.has(tok)) {
      body = tokens[++idx] ?? "";
    } else if (SKIP_VALUE_FLAGS.has(tok)) {
      idx++; // skip the following value
    } else if (tok.startsWith("--") || BOOL_FLAGS.test(tok)) {
      // ignore unknown boolean flags
    } else if (!tok.startsWith("-")) {
      // positional: URL
      if (!url) url = tok;
    }
    // short options that embed a value like -H"…" are unusual; skip
    idx++;
  }

  if (!url) return null;

  // Infer method
  if (!method) method = body ? "POST" : "GET";

  // Pretty-print body if JSON
  if (body) {
    try {
      body = JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      /* keep as-is */
    }
  }

  return { url, method, headers, body };
}

// ─────────────────────────────────────────────────────────────────────────────

export default function HttpTestPanel({
  defaultUrl = "",
  defaultMethod = "POST",
  defaultHeaders = [],
  defaultBody = "",
}: HttpTestPanelProps) {
  const [url, setUrl] = useState(defaultUrl);
  const [method, setMethod] = useState<HttpMethod>(defaultMethod);
  const [headers, setHeaders] = useState<HttpHeader[]>(() =>
    defaultHeaders.map((h) => ({ ...h, id: uid() }))
  );
  const [body, setBody] = useState(defaultBody);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [curlCopied, setCurlCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Import cURL dialog
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");

  const hasBody = !["GET", "HEAD"].includes(method);

  async function handleSend() {
    if (!url.trim()) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setTesting(true);
    setResult(null);
    try {
      const hdrs: Record<string, string> = {};
      for (const h of headers) {
        if (h.key.trim()) hdrs[h.key.trim()] = h.value;
      }
      const start = Date.now();
      const resp = await fetch(url.trim(), {
        method,
        headers: hdrs,
        body: hasBody && body ? body : undefined,
        signal: controller.signal,
      });
      const latency_ms = Date.now() - start;
      const respBody = await resp.text();
      setResult({ status: resp.status, body: respBody, latency_ms, error: null });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setResult({ status: 0, body: "", latency_ms: 0, error: "请求已取消" });
      } else {
        setResult({ status: 0, body: "", latency_ms: 0, error: String(e) });
      }
    } finally {
      abortRef.current = null;
      setTesting(false);
    }
  }

  function handleAbort() {
    abortRef.current?.abort();
  }

  async function handleCopyCurl() {
    const parts = [`curl -X ${method} '${url}'`];
    for (const h of headers) {
      if (h.key.trim()) parts.push(`  -H '${h.key.trim()}: ${h.value}'`);
    }
    if (hasBody && body) {
      let b: string;
      try {
        b = JSON.stringify(JSON.parse(body));
      } catch {
        b = body;
      }
      parts.push(`  -d '${b}'`);
    }
    await navigator.clipboard.writeText(parts.join(" \\\n"));
    setCurlCopied(true);
    toast.success("cURL 命令已复制");
    setTimeout(() => setCurlCopied(false), 1000);
  }

  function handleImportApply() {
    const parsed = parseCurl(importText);
    if (!parsed) {
      toast.error("无法解析 cURL 命令，请检查格式");
      return;
    }
    setUrl(parsed.url);
    setMethod(parsed.method);
    setHeaders(parsed.headers.map((h) => ({ ...h, id: uid() })));
    setBody(parsed.body);
    setImportOpen(false);
    setImportText("");
    toast.success("已导入 cURL 命令");
  }

  function addHeader() {
    setHeaders((prev) => [...prev, { id: uid(), key: "", value: "" }]);
  }

  function removeHeader(id: string) {
    setHeaders((prev) => prev.filter((h) => h.id !== id));
  }

  function updateHeader(id: string, field: "key" | "value", value: string) {
    setHeaders((prev) =>
      prev.map((h) => (h.id === id ? { ...h, [field]: value } : h))
    );
  }

  const responseValue = result
    ? result.error ?? formatResponseBody(result.body)
    : "";

  const responseLanguage =
    result && !result.error
      ? (() => {
          try {
            JSON.parse(result.body);
            return "json" as const;
          } catch {
            return "text" as const;
          }
        })()
      : ("text" as const);

  return (
    <>
      <div className="flex flex-col gap-4">
        {/* URL bar */}
        <div className="flex gap-2">
          <Select value={method} onValueChange={(v) => setMethod(v as HttpMethod)}>
            <SelectTrigger className="w-28 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {METHODS.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            className="flex-1 font-mono text-sm"
            placeholder="https://api.example.com/v1/chat/completions"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
            title="从 cURL 命令导入"
          >
            <FileInput className="mr-1 h-3.5 w-3.5" />
            导入 cURL
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyCurl}
            disabled={!url.trim()}
          >
            {curlCopied ? (
              <Check className="mr-1 h-3.5 w-3.5 text-green-600" />
            ) : (
              <Copy className="mr-1 h-3.5 w-3.5" />
            )}
            {curlCopied ? "已复制" : "复制 cURL"}
          </Button>
          {testing ? (
            <Button variant="destructive" size="sm" onClick={handleAbort}>
              <Square className="mr-1 h-3.5 w-3.5" />
              取消
            </Button>
          ) : (
            <Button onClick={handleSend} disabled={!url.trim()} size="sm">
              发送
            </Button>
          )}
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-2 gap-4">
          {/* Request panel */}
          <div className="flex flex-col gap-3">
            {/* Headers */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  请求头
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={addHeader}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  添加
                </Button>
              </div>
              {headers.length === 0 ? (
                <p className="text-xs text-muted-foreground">暂无请求头</p>
              ) : (
                <div className="space-y-1.5">
                  {headers.map((h) => (
                    <div key={h.id} className="flex gap-1.5">
                      <Input
                        className="h-7 flex-1 font-mono text-xs"
                        placeholder="Header-Name"
                        value={h.key}
                        onChange={(e) => updateHeader(h.id, "key", e.target.value)}
                      />
                      <Input
                        className="h-7 flex-[2] font-mono text-xs"
                        placeholder="value"
                        value={h.value}
                        onChange={(e) => updateHeader(h.id, "value", e.target.value)}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 shrink-0 p-0"
                        onClick={() => removeHeader(h.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Body */}
            {hasBody && (
              <div className="flex flex-col gap-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  请求体
                </p>
                <CodeEditor
                  value={body}
                  onChange={setBody}
                  language="json"
                  minHeight="14rem"
                  resizable
                />
              </div>
            )}
          </div>

          {/* Response panel */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              响应
            </p>
            {!result && !testing && (
              <div className="flex min-h-40 flex-1 items-center justify-center rounded-md border bg-muted/30 text-sm text-muted-foreground">
                点击"发送"查看响应
              </div>
            )}
            {testing && (
              <div className="flex min-h-40 flex-1 items-center justify-center rounded-md border bg-muted/30 text-sm text-muted-foreground">
                请求中，点击"取消"可中断…
              </div>
            )}
            {result && !testing && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3 text-xs">
                  <span
                    className={
                      result.error
                        ? "rounded px-1.5 py-0.5 bg-red-100 text-red-700 font-semibold"
                        : result.status >= 200 && result.status < 300
                        ? "rounded px-1.5 py-0.5 bg-green-100 text-green-700 font-semibold"
                        : "rounded px-1.5 py-0.5 bg-red-100 text-red-700 font-semibold"
                    }
                  >
                    {result.error ? "ERROR" : result.status}
                  </span>
                  {!result.error && (
                    <span className="text-muted-foreground">{result.latency_ms} ms</span>
                  )}
                </div>
                <CodeEditor
                  value={responseValue}
                  readOnly
                  language={responseLanguage}
                  minHeight="14rem"
                  resizable
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Import cURL Dialog */}
      <Dialog open={importOpen} onOpenChange={(o) => { setImportOpen(o); if (!o) setImportText(""); }}>
        <DialogContent className="max-w-2xl sm:max-w-2xl flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>导入 cURL 命令</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <p className="text-sm text-muted-foreground">
              粘贴 cURL 命令，自动解析 URL、请求方法、请求头和请求体。
            </p>
            <textarea
              className="min-h-[10rem] w-full resize-none rounded-md border bg-muted/30 p-3 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder={"curl -X POST 'https://api.example.com/v1/chat/completions' \\\n  -H 'Authorization: Bearer sk-...' \\\n  -H 'Content-Type: application/json' \\\n  -d '{\"model\":\"gpt-4\",\"messages\":[]}'"}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              spellCheck={false}
              autoFocus
            />
            <div className="flex justify-end">
              <Button onClick={handleImportApply} disabled={!importText.trim()}>
                应用
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

import { useState, useCallback } from "react";
import { ArrowLeft, Copy, Check, X, Globe, Send, Clock, Settings2 } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useLanguage } from "@/lib/i18n";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS";

interface MethodOption {
  id: HttpMethod;
  label: string;
  desc: string;
  color: string;
}

interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  time: number;
}

export default function HttpDebugger() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [url, setUrl] = useState("");
  const [method, setMethod] = useState<HttpMethod>("GET");
  const [headers, setHeaders] = useState("");
  const [body, setBody] = useState("");
  const [response, setResponse] = useState<HttpResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"request" | "response">("request");

  const methodOptions: MethodOption[] = [
    { id: "GET", label: "GET", desc: "获取资源", color: "text-green-600 dark:text-green-400" },
    { id: "POST", label: "POST", desc: "创建资源", color: "text-blue-600 dark:text-blue-400" },
    { id: "PUT", label: "PUT", desc: "更新资源", color: "text-yellow-600 dark:text-yellow-400" },
    { id: "DELETE", label: "DELETE", desc: "删除资源", color: "text-red-600 dark:text-red-400" },
    { id: "PATCH", label: "PATCH", desc: "部分更新", color: "text-purple-600 dark:text-purple-400" },
  ];

  const sendRequest = useCallback(async () => {
    if (!url) {
      toast.error("请输入 URL");
      return;
    }

    setLoading(true);
    setResponse(null);
    const startTime = Date.now();

    try {
      const requestInit: RequestInit = {
        method,
        headers: headers ? JSON.parse(headers) : undefined,
        body: body && method !== "GET" ? body : undefined,
      };

      const res = await fetch(url, requestInit);
      const responseHeaders: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      const responseBody = await res.text();

      setResponse({
        status: res.status,
        statusText: res.statusText,
        headers: responseHeaders,
        body: responseBody,
        time: Date.now() - startTime,
      });
      setActiveTab("response");
    } catch (err) {
      toast.error("请求失败: " + (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [url, method, headers, body]);

  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success(t.common.copied);
    } catch {
      toast.error(t.common.unknownError);
    }
  }, [t]);

  const handleClear = useCallback(() => {
    setUrl("");
    setHeaders("");
    setBody("");
    setResponse(null);
  }, []);

  const formatJson = (text: string) => {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  };

  return (
    <div className="flex h-full flex-col min-h-0 p-2">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8 rounded-full hover:bg-muted" 
          onClick={() => navigate("/toolbox")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">{t.tools.httpDebugger.title}</h1>
          <p className="text-sm text-muted-foreground">{t.tools.httpDebugger.subtitle}</p>
        </div>
      </div>

      {/* URL Bar */}
      <div className="bg-muted/30 rounded-2xl border overflow-hidden">
        <div className="flex items-center gap-2 p-2 bg-background border-b">
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as HttpMethod)}
            className="h-9 px-3 rounded-lg border bg-muted font-mono text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {methodOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://api.example.com/data"
            className="flex-1 font-mono text-sm"
          />
          <Button
            onClick={sendRequest}
            disabled={loading || !url}
            size="sm"
            className="h-9 px-4 gap-1.5"
          >
            <Send className="h-3.5 w-3.5" />
            {loading ? "发送中..." : t.tools.httpDebugger.send}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={handleClear}
            disabled={!url && !response}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-0 bg-muted/30 rounded-2xl border overflow-hidden p-4">
        {/* Toolbar with Tabs */}
        <div className="flex items-center justify-between px-4 h-12 border-b bg-background -mx-4 -mt-4 mb-4">
          <div className="flex items-center gap-1">
            <TabButton 
              active={activeTab === "request"} 
              onClick={() => setActiveTab("request")}
              label={t.tools.httpDebugger.bodyLabel}
              showCount={false}
            />
            <TabButton 
              active={activeTab === "response"} 
              onClick={() => setActiveTab("response")}
              label={t.tools.httpDebugger.responseLabel}
              showCount={false}
            />
          </div>
          {response && activeTab === "response" && (
            <div className="flex items-center gap-2">
              <span className={cn(
                "text-sm font-medium",
                response.status >= 200 && response.status < 300 ? "text-green-600" : "text-red-600"
              )}>
                {response.status} {response.statusText}
              </span>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {response.time}ms
              </span>
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 min-h-0">
          {activeTab === "request" ? (
            <div className="h-full space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                  <Globe className="h-4 w-4" />
                  {t.tools.httpDebugger.headersLabel} (JSON)
                </label>
                <Textarea
                  value={headers}
                  onChange={(e) => setHeaders(e.target.value)}
                  placeholder={`{\n  "Content-Type": "application/json",\n  "Authorization": "Bearer token"\n}`}
                  className="h-24 resize-none font-mono text-sm border bg-background"
                />
              </div>
              <div className="space-y-2 flex-1 flex flex-col">
                <label className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                  <Send className="h-4 w-4" />
                  {t.tools.httpDebugger.bodyLabel}
                </label>
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={`{\n  "key": "value"\n}`}
                  className="flex-1 resize-none font-mono text-sm border bg-background"
                  disabled={method === "GET" || method === "HEAD"}
                />
              </div>
            </div>
          ) : (
            <div className="h-full">
              {response ? (
                <div className="h-full space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-muted-foreground">
                        {t.tools.httpDebugger.headersLabel}
                      </label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => handleCopy(JSON.stringify(response.headers, null, 2))}
                      >
                        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                    <div className="bg-background border rounded-lg p-3 overflow-auto max-h-32">
                      <pre className="text-xs font-mono">
                        {JSON.stringify(response.headers, null, 2)}
                      </pre>
                    </div>
                  </div>
                  <div className="space-y-2 flex-1 flex flex-col">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-muted-foreground">
                        {t.tools.httpDebugger.bodyLabel}
                      </label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => handleCopy(response.body)}
                      >
                        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                    <div className="flex-1 bg-background border rounded-lg p-3 overflow-auto">
                      <pre className="text-xs font-mono whitespace-pre-wrap">
                        {formatJson(response.body)}
                      </pre>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                  <Globe className="h-16 w-16 mb-2 opacity-30" />
                  <p className="text-sm">发送请求查看响应</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Options Panel */}
      <div className="mt-4 space-y-3">
        {/* Options Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Settings2 className="h-4 w-4" />
            <span className="text-sm font-medium">{t.tools.httpDebugger.methodLabel}</span>
          </div>
        </div>

        {/* Options Grid */}
        <div className="grid grid-cols-5 gap-2">
          {methodOptions.map((option) => (
            <MethodOptionCard
              key={option.id}
              id={option.id}
              label={option.label}
              desc={option.desc}
              color={option.color}
              checked={method === option.id}
              onCheckedChange={() => setMethod(option.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// Tab Button Component
interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  label: string;
  showCount?: boolean;
}

function TabButton({ active, onClick, label }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
        active 
          ? "bg-primary text-primary-foreground" 
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <span>{label}</span>
    </button>
  );
}

// Method Option Card Component
interface MethodOptionCardProps {
  id: string;
  label: string;
  desc: string;
  color: string;
  checked: boolean;
  onCheckedChange: () => void;
}

function MethodOptionCard({ id, label, desc, color, checked, onCheckedChange }: MethodOptionCardProps) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-200",
        checked
          ? "border-primary/50 bg-primary/5"
          : "border-border bg-background hover:border-muted-foreground/30 hover:bg-accent/30"
      )}
    >
      <div className={cn(
        "w-9 h-9 rounded-lg flex items-center justify-center shrink-0 font-mono text-sm font-bold transition-colors",
        checked ? "bg-primary text-primary-foreground" : "bg-muted " + color
      )}>
        {label.slice(0, 3)}
      </div>
      <div className="flex-1 min-w-0">
        <div className={cn(
          "text-sm font-medium",
          checked ? "text-primary" : "text-foreground"
        )}>
          {label}
        </div>
        <div className="text-xs text-muted-foreground truncate">{desc}</div>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="sr-only"
      />
    </label>
  );
}

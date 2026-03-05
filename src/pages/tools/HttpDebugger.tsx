import { useState, useCallback } from "react";
import { ArrowLeft, Copy, Check, Send, Trash2, Plus, X } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/page-header";
import { useLanguage } from "@/lib/i18n";
import { toast } from "sonner";

interface Header {
  key: string;
  value: string;
}

export default function HttpDebugger() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [url, setUrl] = useState("");
  const [method, setMethod] = useState("GET");
  const [headers, setHeaders] = useState<Header[]>([{ key: "Content-Type", value: "application/json" }]);
  const [body, setBody] = useState("");
  const [response, setResponse] = useState<{
    status: number;
    statusText: string;
    headers: Record<string, string>;
    data: unknown;
    time: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const addHeader = useCallback(() => {
    setHeaders((prev) => [...prev, { key: "", value: "" }]);
  }, []);

  const removeHeader = useCallback((index: number) => {
    setHeaders((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateHeader = useCallback((index: number, field: keyof Header, value: string) => {
    setHeaders((prev) =>
      prev.map((h, i) => (i === index ? { ...h, [field]: value } : h))
    );
  }, []);

  const sendRequest = useCallback(async () => {
    if (!url) {
      toast.error("Please enter a URL");
      return;
    }

    setLoading(true);
    const startTime = performance.now();

    try {
      const headerRecord: Record<string, string> = {};
      headers.forEach((h) => {
        if (h.key && h.value) {
          headerRecord[h.key] = h.value;
        }
      });

      const fetchOptions: {
        method: string;
        headers: Record<string, string>;
        body?: string;
      } = {
        method,
        headers: headerRecord,
      };

      if (method !== "GET" && method !== "HEAD" && body) {
        fetchOptions.body = body;
      }

      const result = await fetch(url, fetchOptions);
      const endTime = performance.now();

      let responseData: unknown;
      try {
        responseData = await result.json();
      } catch {
        responseData = await result.text();
      }

      setResponse({
        status: result.status,
        statusText: result.statusText || (result.status < 400 ? "OK" : "Error"),
        headers: Object.fromEntries(result.headers.entries()),
        data: responseData,
        time: Math.round(endTime - startTime),
      });
    } catch (error) {
      const endTime = performance.now();
      setResponse({
        status: 0,
        statusText: "Network Error",
        headers: {},
        data: { error: String(error) },
        time: Math.round(endTime - startTime),
      });
    } finally {
      setLoading(false);
    }
  }, [url, method, headers, body]);

  const handleCopyResponse = useCallback(async () => {
    if (!response) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(response.data, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success(t.common.copied);
    } catch {
      toast.error(t.common.unknownError);
    }
  }, [response, t]);

  const handleClear = useCallback(() => {
    setUrl("");
    setBody("");
    setResponse(null);
    setHeaders([{ key: "Content-Type", value: "application/json" }]);
  }, []);

  return (
    <div className="flex h-full flex-col min-h-0">
      <PageHeader
        title={t.tools.httpDebugger.title}
        description={t.tools.httpDebugger.subtitle}
        actions={
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => navigate("/toolbox")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        }
      />

      <div className="flex-1 flex flex-col min-h-0 py-6 gap-4">
        {/* Request Section */}
        <div className="rounded-xl border bg-card flex flex-col">
          <div className="flex items-center gap-2 px-4 py-3 border-b">
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://api.example.com/data"
              className="flex-1"
            />
            <Button onClick={sendRequest} disabled={loading || !url}>
              <Send className="mr-2 h-4 w-4" />
              {loading ? "..." : t.tools.httpDebugger.send}
            </Button>
            <Button variant="ghost" size="icon" onClick={handleClear} disabled={!url && !response}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <Tabs defaultValue="headers" className="flex-1 flex flex-col min-h-0">
            <TabsList className="mx-4 mt-2">
              <TabsTrigger value="headers">{t.tools.httpDebugger.headersLabel}</TabsTrigger>
              <TabsTrigger value="body">{t.tools.httpDebugger.bodyLabel}</TabsTrigger>
            </TabsList>

            <TabsContent value="headers" className="flex-1 flex flex-col min-h-0 p-4 m-0 overflow-auto">
              <div className="space-y-2">
                {headers.map((header, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      placeholder={t.channels.headerKey}
                      value={header.key}
                      onChange={(e) => updateHeader(index, "key", e.target.value)}
                      className="flex-1"
                    />
                    <Input
                      placeholder={t.channels.headerValue}
                      value={header.value}
                      onChange={(e) => updateHeader(index, "value", e.target.value)}
                      className="flex-1"
                    />
                    <Button variant="ghost" size="icon" onClick={() => removeHeader(index)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addHeader} className="w-full">
                  <Plus className="mr-2 h-4 w-4" />
                  {t.channels.addHeader}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="body" className="flex-1 flex flex-col min-h-0 p-4 m-0">
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder='{"key": "value"}'
                className="h-full font-mono text-sm resize-none"
              />
            </TabsContent>
          </Tabs>
        </div>

        {/* Response Section */}
        {response ? (
          <div className="rounded-xl border bg-card flex flex-col flex-1 min-h-0">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="flex items-center gap-4">
                <span className="font-medium">{t.tools.httpDebugger.responseLabel}</span>
                <span
                  className={`text-sm px-2 py-1 rounded ${
                    response.status < 400 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                  }`}
                >
                  {response.status} {response.statusText}
                </span>
                <span className="text-sm text-muted-foreground">
                  {response.time}ms
                </span>
              </div>
              <Button variant="ghost" size="sm" onClick={handleCopyResponse}>
                {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                {copied ? t.common.copied : t.tools.httpDebugger.copyResponse}
              </Button>
            </div>
            <div className="flex-1 p-4 overflow-auto">
              <pre className="font-mono text-sm whitespace-pre-wrap">
                {JSON.stringify(response.data, null, 2)}
              </pre>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

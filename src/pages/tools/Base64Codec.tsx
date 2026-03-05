import { useState, useCallback } from "react";
import { ArrowLeft, Copy, Check, Code2 } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/page-header";
import { useLanguage } from "@/lib/i18n";
import { toast } from "sonner";

type CodecMode = "base64" | "url" | "hex";

export default function Base64Codec() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [mode, setMode] = useState<CodecMode>("base64");
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [copied, setCopied] = useState(false);

  const encode = useCallback(() => {
    if (!input) {
      toast.error(t.tools.base64Codec.invalidInput);
      return;
    }

    try {
      let result = "";
      switch (mode) {
        case "base64":
          result = btoa(unescape(encodeURIComponent(input)));
          break;
        case "url":
          result = encodeURIComponent(input);
          break;
        case "hex":
          result = input
            .split("")
            .map((c) => c.charCodeAt(0).toString(16).padStart(2, "0"))
            .join("");
          break;
      }
      setOutput(result);
    } catch {
      toast.error(t.tools.base64Codec.invalidInput);
    }
  }, [input, mode, t]);

  const decode = useCallback(() => {
    if (!input) {
      toast.error(t.tools.base64Codec.invalidInput);
      return;
    }

    try {
      let result = "";
      switch (mode) {
        case "base64":
          result = decodeURIComponent(escape(atob(input)));
          break;
        case "url":
          result = decodeURIComponent(input);
          break;
        case "hex":
          result = input
            .match(/.{1,2}/g)
            ?.map((byte) => String.fromCharCode(parseInt(byte, 16)))
            .join("") || "";
          break;
      }
      setOutput(result);
    } catch {
      toast.error(t.tools.base64Codec.invalidInput);
    }
  }, [input, mode, t]);

  const handleCopy = useCallback(async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success(t.common.copied);
    } catch {
      toast.error(t.common.unknownError);
    }
  }, [output, t]);

  const handleClear = useCallback(() => {
    setInput("");
    setOutput("");
  }, []);

  return (
    <div className="flex h-full flex-col min-h-0">
      <PageHeader
        title={t.tools.base64Codec.title}
        description={t.tools.base64Codec.subtitle}
        actions={
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => navigate("/toolbox")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        }
      />

      <div className="flex-1 flex flex-col min-h-0 py-6 gap-4">
        {/* Mode Selector */}
        <Tabs value={mode} onValueChange={(v) => setMode(v as CodecMode)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="base64">{t.tools.base64Codec.modeBase64}</TabsTrigger>
            <TabsTrigger value="url">{t.tools.base64Codec.modeUrl}</TabsTrigger>
            <TabsTrigger value="hex">{t.tools.base64Codec.modeHex}</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Input */}
        <div className="rounded-xl border bg-card flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div className="flex items-center gap-2">
              <Code2 className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{t.tools.base64Codec.inputLabel}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleClear} disabled={!input}>
              {t.common.clear}
            </Button>
          </div>
          <div className="p-4">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Enter text to ${mode === "base64" ? "encode/decode" : mode === "url" ? "encode/decode" : "encode/decode"}...`}
              className="h-full resize-none font-mono text-sm"
            />
          </div>
          <div className="px-4 pb-4 flex gap-2">
            <Button onClick={encode} disabled={!input} className="flex-1">
              {t.tools.base64Codec.encode}
            </Button>
            <Button onClick={decode} disabled={!input} variant="outline" className="flex-1">
              {t.tools.base64Codec.decode}
            </Button>
          </div>
        </div>

        {/* Output */}
        {output ? (
          <div className="rounded-xl border bg-card flex flex-col flex-1">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <span className="font-medium">{t.tools.base64Codec.outputLabel}</span>
              <Button variant="ghost" size="sm" onClick={handleCopy}>
                {copied ? (
                  <>
                    <Check className="mr-1.5 h-3.5 w-3.5" />
                    {t.common.copied}
                  </>
                ) : (
                  <>
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    {t.common.copy}
                  </>
                )}
              </Button>
            </div>
            <div className="flex-1 p-4 overflow-auto">
              <pre className="font-mono text-sm whitespace-pre-wrap break-all">{output}</pre>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

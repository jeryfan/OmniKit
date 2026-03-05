import { useState, useCallback } from "react";
import { ArrowLeft, Copy, Check, FileJson } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/page-header";
import { useLanguage } from "@/lib/i18n";
import { toast } from "sonner";

export default function JwtDecoder() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [input, setInput] = useState("");
  const [header, setHeader] = useState("");
  const [payload, setPayload] = useState("");
  const [signature, setSignature] = useState("");
  const [headerCopied, setHeaderCopied] = useState(false);
  const [payloadCopied, setPayloadCopied] = useState(false);

  const decodeJwt = useCallback(() => {
    if (!input.trim()) {
      toast.error(t.tools.jwtDecoder.invalidToken);
      return;
    }

    try {
      const parts = input.trim().split(".");
      if (parts.length !== 3) {
        throw new Error("Invalid JWT format");
      }

      const base64UrlDecode = (str: string): string => {
        const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
        const padding = "=".repeat((4 - (base64.length % 4)) % 4);
        const decoded = atob(base64 + padding);
        return decoded;
      };

      const headerJson = JSON.parse(base64UrlDecode(parts[0]));
      const payloadJson = JSON.parse(base64UrlDecode(parts[1]));

      setHeader(JSON.stringify(headerJson, null, 2));
      setPayload(JSON.stringify(payloadJson, null, 2));
      setSignature(parts[2]);
      toast.success(t.tools.jwtDecoder.decoded);
    } catch {
      toast.error(t.tools.jwtDecoder.invalidToken);
      setHeader("");
      setPayload("");
      setSignature("");
    }
  }, [input, t]);

  const handleCopyHeader = useCallback(async () => {
    if (!header) return;
    try {
      await navigator.clipboard.writeText(header);
      setHeaderCopied(true);
      setTimeout(() => setHeaderCopied(false), 2000);
      toast.success(t.common.copied);
    } catch {
      toast.error(t.common.unknownError);
    }
  }, [header, t]);

  const handleCopyPayload = useCallback(async () => {
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(payload);
      setPayloadCopied(true);
      setTimeout(() => setPayloadCopied(false), 2000);
      toast.success(t.common.copied);
    } catch {
      toast.error(t.common.unknownError);
    }
  }, [payload, t]);

  const handleClear = useCallback(() => {
    setInput("");
    setHeader("");
    setPayload("");
    setSignature("");
  }, []);

  return (
    <div className="flex h-full flex-col min-h-0">
      <PageHeader
        title={t.tools.jwtDecoder.title}
        description={t.tools.jwtDecoder.subtitle}
        actions={
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => navigate("/toolbox")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        }
      />

      <div className="flex-1 flex flex-col min-h-0 py-6 gap-4">
        {/* Input Section */}
        <div className="rounded-xl border bg-card flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div className="flex items-center gap-2">
              <FileJson className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{t.tools.jwtDecoder.inputLabel}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleClear} disabled={!input}>
                {t.common.clear}
              </Button>
              <Button onClick={decodeJwt} disabled={!input.trim()} size="sm">
                {t.tools.jwtDecoder.decode}
              </Button>
            </div>
          </div>
          <div className="p-4">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t.tools.jwtDecoder.inputPlaceholder}
              className="h-full resize-none font-mono text-sm"
            />
          </div>
        </div>

        {/* Output Section */}
        {(header || payload) ? (
          <div className="flex-1 flex flex-col min-h-0">
            <Tabs defaultValue="payload" className="h-full flex flex-col">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="header">{t.tools.jwtDecoder.headerLabel}</TabsTrigger>
                <TabsTrigger value="payload">{t.tools.jwtDecoder.payloadLabel}</TabsTrigger>
                <TabsTrigger value="signature">{t.tools.jwtDecoder.signatureLabel}</TabsTrigger>
              </TabsList>

              <TabsContent value="header" className="flex-1 mt-4">
                <div className="rounded-xl border bg-card h-full flex flex-col">
                  <div className="flex items-center justify-end px-4 py-2 border-b">
                    <Button variant="ghost" size="sm" onClick={handleCopyHeader} disabled={!header}>
                      {headerCopied ? (
                        <Check className="mr-1.5 h-3.5 w-3.5" />
                      ) : (
                        <Copy className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {headerCopied ? t.common.copied : t.tools.jwtDecoder.copyHeader}
                    </Button>
                  </div>
                  <div className="flex-1 p-4 overflow-auto">
                    <pre className="font-mono text-sm whitespace-pre-wrap">{header}</pre>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="payload" className="flex-1 mt-4">
                <div className="rounded-xl border bg-card h-full flex flex-col">
                  <div className="flex items-center justify-end px-4 py-2 border-b">
                    <Button variant="ghost" size="sm" onClick={handleCopyPayload} disabled={!payload}>
                      {payloadCopied ? (
                        <Check className="mr-1.5 h-3.5 w-3.5" />
                      ) : (
                        <Copy className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {payloadCopied ? t.common.copied : t.tools.jwtDecoder.copyPayload}
                    </Button>
                  </div>
                  <div className="flex-1 p-4 overflow-auto">
                    <pre className="font-mono text-sm whitespace-pre-wrap">{payload}</pre>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="signature" className="flex-1 mt-4">
                <div className="rounded-xl border bg-card h-full flex flex-col">
                  <div className="flex-1 p-4 overflow-auto">
                    <pre className="font-mono text-sm whitespace-pre-wrap break-all">{signature}</pre>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        ) : null}
      </div>
    </div>
  );
}

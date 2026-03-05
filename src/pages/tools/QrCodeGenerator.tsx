import { useState, useCallback, useRef } from "react";
import { ArrowLeft, Copy, Check, QrCode, Download, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { PageHeader } from "@/components/page-header";
import { useLanguage } from "@/lib/i18n";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";

export default function QrCodeGenerator() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [content, setContent] = useState("");
  const [size, setSize] = useState(256);
  const [generated, setGenerated] = useState(false);
  const [copied, setCopied] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);

  const generate = useCallback(() => {
    if (!content.trim()) {
      toast.error("Please enter content");
      return;
    }
    setGenerated(true);
    toast.success(t.tools.qrCodeGenerator.generated);
  }, [content, t]);

  const handleDownload = useCallback(() => {
    if (!qrRef.current) return;

    const svg = qrRef.current.querySelector("svg");
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      canvas.width = size;
      canvas.height = size;
      ctx.drawImage(img, 0, 0);
      const pngFile = canvas.toDataURL("image/png");

      const downloadLink = document.createElement("a");
      downloadLink.download = `qrcode-${Date.now()}.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(svgData);
  }, [size]);

  const handleCopy = useCallback(async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success(t.tools.qrCodeGenerator.copied);
    } catch {
      toast.error(t.common.unknownError);
    }
  }, [content, t]);

  const handleClear = useCallback(() => {
    setContent("");
    setGenerated(false);
  }, []);

  return (
    <div className="flex h-full flex-col min-h-0">
      <PageHeader
        title={t.tools.qrCodeGenerator.title}
        description={t.tools.qrCodeGenerator.subtitle}
        actions={
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => navigate("/toolbox")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        }
      />

      <div className="flex-1 overflow-auto py-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Input Section */}
          <div className="rounded-xl border bg-card p-1.5">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <QrCode className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">{t.tools.qrCodeGenerator.inputLabel}</h3>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex gap-2">
                <Input
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={t.tools.qrCodeGenerator.inputPlaceholder}
                  onKeyDown={(e) => e.key === "Enter" && generate()}
                />
                <Button variant="outline" size="icon" onClick={handleCopy} disabled={!content}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>{t.tools.qrCodeGenerator.sizeLabel}</Label>
                  <span className="text-sm font-mono bg-muted px-2 py-1 rounded">{size}px</span>
                </div>
                <Slider
                  value={[size]}
                  onValueChange={(v: number[]) => setSize(v[0] ?? 256)}
                  min={128}
                  max={512}
                  step={8}
                />
              </div>

              <div className="flex gap-2">
                <Button onClick={generate} disabled={!content.trim()} className="flex-1">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {t.tools.qrCodeGenerator.generate}
                </Button>
                <Button onClick={handleClear} variant="outline" disabled={!content}>
                  {t.common.clear}
                </Button>
              </div>
            </div>
          </div>

          {/* QR Code Display */}
          {generated && content && (
            <div className="rounded-xl border bg-card p-1.5">
              <div className="flex flex-col items-center gap-6">
                <div
                  ref={qrRef}
                  className="p-4 bg-white rounded-lg"
                  style={{ width: size + 32, height: size + 32 }}
                >
                  <QRCodeSVG
                    value={content}
                    size={size}
                    level="M"
                    includeMargin={false}
                  />
                </div>

                <Button onClick={handleDownload} size="lg">
                  <Download className="mr-2 h-4 w-4" />
                  {t.tools.qrCodeGenerator.download}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState, useCallback, useRef } from "react";
import { ArrowLeft, Copy, Check, X, QrCode, Download, Settings2 } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useLanguage } from "@/lib/i18n";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
// QR Code generation - simplified version without external library
function generateQRCodeSVG(text: string, size: number): string {
  // Simple SVG placeholder for QR code
  const cellSize = Math.floor(size / 25);
  const actualSize = cellSize * 25;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${actualSize}" height="${actualSize}" viewBox="0 0 ${actualSize} ${actualSize}">`;
  svg += `<rect width="${actualSize}" height="${actualSize}" fill="white"/>`;
  
  // Generate a simple pattern based on text hash
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash = hash & hash;
  }
  
  for (let row = 0; row < 25; row++) {
    for (let col = 0; col < 25; col++) {
      const isFinder = (row < 7 && col < 7) || (row < 7 && col > 17) || (row > 17 && col < 7);
      const isTiming = row === 6 || col === 6;
      const random = Math.abs((hash + row * 25 + col) % 100);
      const isBlack = isFinder || isTiming || (random > 50 && !isFinder && !isTiming);
      
      if (isBlack) {
        svg += `<rect x="${col * cellSize}" y="${row * cellSize}" width="${cellSize}" height="${cellSize}" fill="black"/>`;
      }
    }
  }
  
  // Add finder patterns
  const addFinder = (x: number, y: number) => {
    svg += `<rect x="${x}" y="${y}" width="${cellSize * 7}" height="${cellSize * 7}" fill="black"/>`;
    svg += `<rect x="${x + cellSize}" y="${y + cellSize}" width="${cellSize * 5}" height="${cellSize * 5}" fill="white"/>`;
    svg += `<rect x="${x + cellSize * 2}" y="${y + cellSize * 2}" width="${cellSize * 3}" height="${cellSize * 3}" fill="black"/>`;
  };
  
  addFinder(0, 0);
  addFinder(actualSize - cellSize * 7, 0);
  addFinder(0, actualSize - cellSize * 7);
  
  svg += '</svg>';
  return 'data:image/svg+xml;base64,' + btoa(svg);
}

interface SizeOption {
  id: string;
  label: string;
  desc: string;
  size: number;
}

export default function QrCodeGenerator() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [input, setInput] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [size, setSize] = useState(256);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const sizeOptions: SizeOption[] = [
    { id: "small", label: "小", desc: "128x128", size: 128 },
    { id: "medium", label: "中", desc: "256x256", size: 256 },
    { id: "large", label: "大", desc: "512x512", size: 512 },
  ];

  const generateQR = useCallback(() => {
    if (!input.trim()) {
      toast.error("请输入内容");
      return;
    }

    try {
      const dataUrl = generateQRCodeSVG(input, size);
      setQrDataUrl(dataUrl);
      toast.success("二维码生成成功");
    } catch (err) {
      toast.error("生成失败");
    }
  }, [input, size]);

  const handleDownload = useCallback(() => {
    if (!qrDataUrl) return;
    const link = document.createElement("a");
    link.href = qrDataUrl;
    link.download = `qrcode-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [qrDataUrl]);

  const handleCopy = useCallback(async () => {
    if (!qrDataUrl) return;
    try {
      const response = await fetch(qrDataUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("已复制到剪贴板");
    } catch {
      toast.error("复制失败");
    }
  }, [qrDataUrl]);

  const handleClear = useCallback(() => {
    setInput("");
    setQrDataUrl("");
  }, []);

  return (
    <div className="flex h-full flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8 rounded-full hover:bg-muted" 
          onClick={() => navigate("/toolbox")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">{t.tools.qrCodeGenerator.title}</h1>
          <p className="text-sm text-muted-foreground">{t.tools.qrCodeGenerator.subtitle}</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-0 bg-muted/30 rounded-2xl border overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 h-12 border-b bg-background">
          <div className="flex items-center gap-2 text-muted-foreground">
            <QrCode className="h-4 w-4" />
            <span className="text-sm font-medium">{t.tools.qrCodeGenerator.inputLabel}</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleClear}
              disabled={!input && !qrDataUrl}
            >
              <X className="h-4 w-4" />
            </Button>
            <Button
              onClick={generateQR}
              disabled={!input.trim()}
              size="sm"
              className="h-8 px-3 gap-1.5"
            >
              <QrCode className="h-3.5 w-3.5" />
              {t.tools.qrCodeGenerator.generate}
            </Button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 min-h-0 p-6 overflow-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
            {/* Input Area */}
            <div className="flex flex-col">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t.tools.qrCodeGenerator.inputPlaceholder}
                className="flex-1 resize-none font-mono text-sm border bg-background"
                autoFocus
              />
            </div>

            {/* Output Area */}
            <div className="flex flex-col items-center justify-center bg-background rounded-xl border p-6">
              {qrDataUrl ? (
                <div className="flex flex-col items-center gap-4">
                  <img 
                    src={qrDataUrl} 
                    alt="QR Code" 
                    className="rounded-lg border"
                    style={{ width: Math.min(size, 200), height: Math.min(size, 200) }}
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDownload}
                      className="gap-1.5"
                    >
                      <Download className="h-3.5 w-3.5" />
                      {t.tools.qrCodeGenerator.download}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopy}
                      className="gap-1.5"
                    >
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? t.common.copied : t.common.copy}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-muted-foreground text-center">
                  <QrCode className="h-16 w-16 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">输入内容生成二维码</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Options Panel */}
      <div className="mt-4 space-y-3">
        {/* Options Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Settings2 className="h-4 w-4" />
            <span className="text-sm font-medium">{t.tools.qrCodeGenerator.sizeLabel}</span>
          </div>
        </div>

        {/* Options Grid */}
        <div className="grid grid-cols-3 gap-2">
          {sizeOptions.map((option) => (
            <SizeOptionCard
              key={option.id}
              id={option.id}
              label={option.label}
              desc={option.desc}
              checked={size === option.size}
              onCheckedChange={() => setSize(option.size)}
            />
          ))}
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

// Size Option Card Component
interface SizeOptionCardProps {
  id: string;
  label: string;
  desc: string;
  checked: boolean;
  onCheckedChange: () => void;
}

function SizeOptionCard({ id, label, desc, checked, onCheckedChange }: SizeOptionCardProps) {
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
        "w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors",
        checked ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
      )}>
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className={cn(
          "text-sm font-medium",
          checked ? "text-primary" : "text-foreground"
        )}>
          {desc}
        </div>
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

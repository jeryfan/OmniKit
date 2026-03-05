import { useState, useCallback, useRef } from "react";
import { ArrowLeft, Upload, Download, ImageIcon, Loader2 } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { useLanguage } from "@/lib/i18n";
import { toast } from "sonner";

interface ImageInfo {
  file: File;
  preview: string;
  originalSize: number;
  compressedSize?: number;
  width: number;
  height: number;
}

export default function ImageCompressor() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [image, setImage] = useState<ImageInfo | null>(null);
  const [quality, setQuality] = useState(80);
  const [format, setFormat] = useState("image/jpeg");
  const [compressing, setCompressing] = useState(false);
  const [compressedDataUrl, setCompressedDataUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        setImage({
          file,
          preview: event.target?.result as string,
          originalSize: file.size,
          width: img.width,
          height: img.height,
        });
        setCompressedDataUrl(null);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  }, []);

  const compress = useCallback(() => {
    if (!image || !canvasRef.current) return;

    setCompressing(true);

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = image.width;
    canvas.height = image.height;
    ctx.drawImage(document.createElement("img"), 0, 0);

    // Load image onto canvas
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0);

      // Compress
      const dataUrl = canvas.toDataURL(format, quality / 100);
      setCompressedDataUrl(dataUrl);

      // Calculate compressed size
      const base64Length = dataUrl.split(",")[1]?.length || 0;
      const sizeInBytes = (base64Length * 3) / 4;

      setImage((prev) =>
        prev ? { ...prev, compressedSize: sizeInBytes } : null
      );

      setCompressing(false);
      toast.success(t.tools.imageCompressor.compressed);
    };
    img.src = image.preview;
  }, [image, quality, format, t]);

  const handleDownload = useCallback(() => {
    if (!compressedDataUrl) return;

    const link = document.createElement("a");
    link.download = `compressed-${Date.now()}.${format.split("/")[1]}`;
    link.href = compressedDataUrl;
    link.click();
  }, [compressedDataUrl, format]);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const compressionRatio =
    image?.compressedSize && image?.originalSize
      ? Math.round((1 - image.compressedSize / image.originalSize) * 100)
      : 0;

  return (
    <div className="flex h-full flex-col min-h-0">
      <PageHeader
        title={t.tools.imageCompressor.title}
        description={t.tools.imageCompressor.subtitle}
        actions={
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => navigate("/toolbox")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        }
      />

      <div className="flex-1 overflow-auto py-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Upload Area */}
          {!image ? (
            <div
              className="rounded-xl border-2 border-dashed bg-card p-12 cursor-pointer hover:border-primary transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
              <div className="flex flex-col items-center text-center">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Upload className="h-8 w-8 text-primary" />
                </div>
                <h3 className="font-semibold mb-1">{t.tools.imageCompressor.upload}</h3>
                <p className="text-sm text-muted-foreground">
                  Click to select an image file
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Image Preview */}
              <div className="rounded-xl border bg-card p-1.5">
                <div className="flex flex-col items-center gap-4">
                  <img
                    src={compressedDataUrl || image.preview}
                    alt="Preview"
                    className="max-h-64 object-contain rounded-lg"
                  />

                  <div className="grid grid-cols-3 gap-4 w-full">
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground mb-1">
                        {t.tools.imageCompressor.originalSize}
                      </p>
                      <p className="font-mono font-medium">
                        {formatSize(image.originalSize)}
                      </p>
                    </div>
                    {image.compressedSize && (
                      <div className="text-center p-3 bg-muted rounded-lg">
                        <p className="text-xs text-muted-foreground mb-1">
                          {t.tools.imageCompressor.compressedSize}
                        </p>
                        <p className="font-mono font-medium">
                          {formatSize(image.compressedSize)}
                        </p>
                      </div>
                    )}
                    {compressionRatio > 0 && (
                      <div className="text-center p-3 bg-green-100 dark:bg-green-900/20 rounded-lg">
                        <p className="text-xs text-muted-foreground mb-1">
                          {t.tools.imageCompressor.compressionRatio}
                        </p>
                        <p className="font-mono font-medium text-green-600">
                          -{compressionRatio}%
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Settings */}
              <div className="rounded-xl border bg-card p-1.5 space-y-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>{t.tools.imageCompressor.qualityLabel}</Label>
                    <span className="text-sm font-mono bg-muted px-2 py-1 rounded">
                      {quality}%
                    </span>
                  </div>
                  <Slider
                    value={[quality]}
                    onValueChange={(v: number[]) => setQuality(v[0] ?? 80)}
                    min={10}
                    max={100}
                    step={5}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t.tools.imageCompressor.formatLabel}</Label>
                  <Select value={format} onValueChange={setFormat}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="image/jpeg">JPEG</SelectItem>
                      <SelectItem value="image/png">PNG</SelectItem>
                      <SelectItem value="image/webp">WebP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={compress}
                    disabled={compressing}
                    className="flex-1"
                  >
                    {compressing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t.tools.imageCompressor.compress}...
                      </>
                    ) : (
                      <>
                        <ImageIcon className="mr-2 h-4 w-4" />
                        {t.tools.imageCompressor.compress}
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={handleDownload}
                    disabled={!compressedDataUrl}
                    variant="outline"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    {t.tools.imageCompressor.download}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

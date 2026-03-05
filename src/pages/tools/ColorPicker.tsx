import { useState, useCallback, useEffect } from "react";
import { ArrowLeft, Copy, Check, Pipette } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";
import { useLanguage } from "@/lib/i18n";
import { toast } from "sonner";

export default function ColorPicker() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [hex, setHex] = useState("#3b82f6");
  const [rgb, setRgb] = useState({ r: 59, g: 130, b: 246 });
  const [hsl, setHsl] = useState({ h: 217, s: 91, l: 60 });
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Convert hex to rgb
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : null;
  };

  // Convert rgb to hex
  const rgbToHex = (r: number, g: number, b: number) => {
    return (
      "#" +
      [r, g, b]
        .map((x) => {
          const hex = Math.max(0, Math.min(255, Math.round(x))).toString(16);
          return hex.length === 1 ? "0" + hex : hex;
        })
        .join("")
    );
  };

  // Convert rgb to hsl
  const rgbToHsl = (r: number, g: number, b: number) => {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        case b:
          h = (r - g) / d + 4;
          break;
      }
      h /= 6;
    }

    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100),
    };
  };

  // Convert hsl to rgb
  const hslToRgb = (h: number, s: number, l: number) => {
    h /= 360;
    s /= 100;
    l /= 100;
    let r, g, b;

    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }

    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255),
    };
  };

  const handleHexChange = (value: string) => {
    const newHex = value.startsWith("#") ? value : "#" + value;
    setHex(newHex);
    const newRgb = hexToRgb(newHex);
    if (newRgb) {
      setRgb(newRgb);
      setHsl(rgbToHsl(newRgb.r, newRgb.g, newRgb.b));
    }
  };

  const handleRgbChange = (component: keyof typeof rgb, value: number) => {
    const newRgb = { ...rgb, [component]: Math.max(0, Math.min(255, value)) };
    setRgb(newRgb);
    setHex(rgbToHex(newRgb.r, newRgb.g, newRgb.b));
    setHsl(rgbToHsl(newRgb.r, newRgb.g, newRgb.b));
  };

  const handleHslChange = (component: keyof typeof hsl, value: number) => {
    const limits = { h: 360, s: 100, l: 100 };
    const newHsl = {
      ...hsl,
      [component]: Math.max(0, Math.min(limits[component], value)),
    };
    setHsl(newHsl);
    const newRgb = hslToRgb(newHsl.h, newHsl.s, newHsl.l);
    setRgb(newRgb);
    setHex(rgbToHex(newRgb.r, newRgb.g, newRgb.b));
  };

  const handleCopy = useCallback(async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
      toast.success(t.tools.colorPicker.copied);
    } catch {
      toast.error(t.common.unknownError);
    }
  }, [t]);

  // Random color on mount
  useEffect(() => {
    const randomColor = () => Math.floor(Math.random() * 256);
    const r = randomColor();
    const g = randomColor();
    const b = randomColor();
    setRgb({ r, g, b });
    setHex(rgbToHex(r, g, b));
    setHsl(rgbToHsl(r, g, b));
  }, []);

  return (
    <div className="flex h-full flex-col min-h-0">
      <PageHeader
        title={t.tools.colorPicker.title}
        description={t.tools.colorPicker.subtitle}
        actions={
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => navigate("/toolbox")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        }
      />

      <div className="flex-1 overflow-auto py-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Color Preview */}
          <div
            className="h-32 rounded-xl border-2 border-border"
            style={{ backgroundColor: hex }}
          />

          {/* HEX Input */}
          <div className="rounded-xl border bg-card p-1.5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Pipette className="h-4 w-4 text-muted-foreground" />
                <Label className="font-semibold">{t.tools.colorPicker.hexLabel}</Label>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCopy(hex, "hex")}
              >
                {copiedField === "hex" ? (
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                ) : (
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                )}
                {copiedField === "hex" ? t.common.copied : t.tools.colorPicker.copy}
              </Button>
            </div>
            <Input
              value={hex}
              onChange={(e) => handleHexChange(e.target.value)}
              className="font-mono uppercase"
            />
          </div>

          {/* RGB Inputs */}
          <div className="rounded-xl border bg-card p-1.5">
            <Label className="font-semibold mb-4 block">{t.tools.colorPicker.rgbLabel}</Label>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">R</Label>
                <Input
                  type="number"
                  value={rgb.r}
                  onChange={(e) => handleRgbChange("r", parseInt(e.target.value) || 0)}
                  className="font-mono"
                  min={0}
                  max={255}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">G</Label>
                <Input
                  type="number"
                  value={rgb.g}
                  onChange={(e) => handleRgbChange("g", parseInt(e.target.value) || 0)}
                  className="font-mono"
                  min={0}
                  max={255}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">B</Label>
                <Input
                  type="number"
                  value={rgb.b}
                  onChange={(e) => handleRgbChange("b", parseInt(e.target.value) || 0)}
                  className="font-mono"
                  min={0}
                  max={255}
                />
              </div>
            </div>
            <div className="mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopy(`rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`, "rgb")}
                className="w-full"
              >
                {copiedField === "rgb" ? (
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                ) : (
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                )}
                Copy RGB
              </Button>
            </div>
          </div>

          {/* HSL Inputs */}
          <div className="rounded-xl border bg-card p-1.5">
            <Label className="font-semibold mb-4 block">{t.tools.colorPicker.hslLabel}</Label>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">H</Label>
                <Input
                  type="number"
                  value={hsl.h}
                  onChange={(e) => handleHslChange("h", parseInt(e.target.value) || 0)}
                  className="font-mono"
                  min={0}
                  max={360}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">S</Label>
                <Input
                  type="number"
                  value={hsl.s}
                  onChange={(e) => handleHslChange("s", parseInt(e.target.value) || 0)}
                  className="font-mono"
                  min={0}
                  max={100}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">L</Label>
                <Input
                  type="number"
                  value={hsl.l}
                  onChange={(e) => handleHslChange("l", parseInt(e.target.value) || 0)}
                  className="font-mono"
                  min={0}
                  max={100}
                />
              </div>
            </div>
            <div className="mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopy(`hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`, "hsl")}
                className="w-full"
              >
                {copiedField === "hsl" ? (
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                ) : (
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                )}
                Copy HSL
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

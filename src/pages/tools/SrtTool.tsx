import { useState, useCallback } from "react";
import { ArrowLeft, Copy, Check, Clock, Download } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { PageHeader } from "@/components/page-header";
import { useLanguage } from "@/lib/i18n";
import { toast } from "sonner";

// Parse SRT time format: 00:00:00,000
const parseTime = (timeStr: string): number => {
  const match = timeStr.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
  if (!match) return 0;
  const [, hours, minutes, seconds, milliseconds] = match;
  return (
    parseInt(hours) * 3600000 +
    parseInt(minutes) * 60000 +
    parseInt(seconds) * 1000 +
    parseInt(milliseconds)
  );
};

// Format time to SRT format
const formatTime = (ms: number): string => {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(milliseconds).padStart(3, "0")}`;
};

export default function SrtTool() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [shiftMs, setShiftMs] = useState(0);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [copied, setCopied] = useState(false);

  const applyShift = useCallback(() => {
    if (!input.trim()) {
      toast.error(t.tools.srtTool.invalidSrt);
      return;
    }

    try {
      // Parse SRT content
      const blocks = input.trim().split(/\n\s*\n/);
      const adjustedBlocks: string[] = [];

      for (const block of blocks) {
        const lines = block.trim().split("\n");
        if (lines.length < 2) continue;

        // Check if second line contains the time range
        const timeLine = lines[1];
        const timeMatch = timeLine.match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/);

        if (!timeMatch) {
          adjustedBlocks.push(block);
          continue;
        }

        const [, startTime, endTime] = timeMatch;
        const startMs = parseTime(startTime);
        const endMs = parseTime(endTime);

        const actualShift = direction === "forward" ? shiftMs : -shiftMs;
        const newStartMs = Math.max(0, startMs + actualShift);
        const newEndMs = Math.max(0, endMs + actualShift);

        const newTimeLine = `${formatTime(newStartMs)} --> ${formatTime(newEndMs)}`;
        const newBlock = [lines[0], newTimeLine, ...lines.slice(2)].join("\n");
        adjustedBlocks.push(newBlock);
      }

      setOutput(adjustedBlocks.join("\n\n"));
      toast.success("SRT adjusted successfully");
    } catch {
      toast.error(t.tools.srtTool.invalidSrt);
    }
  }, [input, shiftMs, direction, t]);

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

  const handleDownload = useCallback(() => {
    if (!output) return;
    const blob = new Blob([output], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `subtitles-${Date.now()}.srt`;
    link.click();
    URL.revokeObjectURL(url);
  }, [output]);

  const handleClear = useCallback(() => {
    setInput("");
    setOutput("");
    setShiftMs(0);
  }, []);

  return (
    <div className="flex h-full flex-col min-h-0">
      <PageHeader
        title={t.tools.srtTool.title}
        description={t.tools.srtTool.subtitle}
        actions={
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => navigate("/toolbox")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        }
      />

      <div className="flex-1 flex flex-col min-h-0 py-6 gap-4">
        {/* Shift Controls */}
        <div className="rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <Label className="font-medium">{t.tools.srtTool.shiftLabel}</Label>
            </div>

            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={shiftMs}
                onChange={(e) => setShiftMs(parseInt(e.target.value) || 0)}
                className="w-32"
                min={0}
              />
              <span className="text-sm text-muted-foreground">ms</span>
            </div>

            <RadioGroup
              value={direction}
              onValueChange={(v: string) => setDirection(v as "forward" | "backward")}
              className="flex items-center gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="forward" id="forward" />
                <Label htmlFor="forward">{t.tools.srtTool.shiftForward}</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="backward" id="backward" />
                <Label htmlFor="backward">{t.tools.srtTool.shiftBackward}</Label>
              </div>
            </RadioGroup>

            <Button onClick={applyShift} disabled={!input.trim()}>
              {t.tools.srtTool.apply}
            </Button>
          </div>
        </div>

        {/* Input/Output */}
        <div className="flex-1 flex gap-4 min-h-0">
          {/* Input */}
          <div className="flex-1 rounded-xl border bg-card flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <span className="font-medium">{t.tools.srtTool.inputLabel}</span>
              <Button variant="ghost" size="sm" onClick={handleClear} disabled={!input}>
                {t.common.clear}
              </Button>
            </div>
            <div className="flex-1 p-4 overflow-auto">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={`1
00:00:01,000 --> 00:00:04,000
Hello, this is a subtitle.

2
00:00:05,000 --> 00:00:08,000
This is another subtitle.`}
                className="h-full w-full resize-none font-mono text-sm"
              />
            </div>
          </div>

          {/* Output */}
          {output && (
            <div className="flex-1 rounded-xl border bg-card flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <span className="font-medium">Output</span>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={handleCopy}>
                    {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                    {copied ? t.common.copied : t.tools.srtTool.copy}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleDownload}>
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    {t.tools.srtTool.download}
                  </Button>
                </div>
              </div>
              <div className="flex-1 p-4 overflow-auto">
                <pre className="font-mono text-sm whitespace-pre-wrap">{output}</pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

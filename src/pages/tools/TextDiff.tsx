import { useState, useCallback, useMemo } from "react";
import { ArrowLeft, Copy, Check, FileText, GitCompare, RefreshCw, Download, Settings2 } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useLanguage } from "@/lib/i18n";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type DiffType = "added" | "removed" | "unchanged";

interface DiffLine {
  type: DiffType;
  oldLineNum: number | null;
  newLineNum: number | null;
  content: string;
}

interface DiffResult {
  additions: number;
  deletions: number;
  unchanged: number;
  lines: DiffLine[];
}

export default function TextDiff() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [oldText, setOldText] = useState("");
  const [newText, setNewText] = useState("");
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [showUnchanged, setShowUnchanged] = useState(true);
  const [copied, setCopied] = useState(false);

  const computeDiff = useCallback((oldStr: string, newStr: string): DiffResult => {
    let oldLines = oldStr.split("\n");
    let newLines = newStr.split("\n");

    if (ignoreWhitespace) {
      oldLines = oldLines.map(l => l.trim());
      newLines = newLines.map(l => l.trim());
    }

    if (ignoreCase) {
      oldLines = oldLines.map(l => l.toLowerCase());
      newLines = newLines.map(l => l.toLowerCase());
    }

    // Simple LCS-based diff
    const m = oldLines.length;
    const n = newLines.length;
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (oldLines[i - 1] === newLines[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    const result: DiffLine[] = [];
    let i = m, j = n;
    let oldLineNum = m;
    let newLineNum = n;

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
        result.unshift({
          type: "unchanged",
          oldLineNum,
          newLineNum,
          content: oldLines[i - 1],
        });
        i--;
        j--;
        oldLineNum--;
        newLineNum--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        result.unshift({
          type: "added",
          oldLineNum: null,
          newLineNum,
          content: newLines[j - 1],
        });
        j--;
        newLineNum--;
      } else {
        result.unshift({
          type: "removed",
          oldLineNum,
          newLineNum: null,
          content: oldLines[i - 1],
        });
        i--;
        oldLineNum--;
      }
    }

    const additions = result.filter(l => l.type === "added").length;
    const deletions = result.filter(l => l.type === "removed").length;
    const unchanged = result.filter(l => l.type === "unchanged").length;

    return { additions, deletions, unchanged, lines: result };
  }, [ignoreWhitespace, ignoreCase]);

  const diffResult = useMemo(() => {
    if (!oldText && !newText) return null;
    return computeDiff(oldText, newText);
  }, [oldText, newText, computeDiff]);

  const filteredLines = useMemo(() => {
    if (!diffResult) return [];
    if (showUnchanged) return diffResult.lines;
    return diffResult.lines.filter(l => l.type !== "unchanged");
  }, [diffResult, showUnchanged]);

  const handleSwap = useCallback(() => {
    setOldText(newText);
    setNewText(oldText);
  }, [oldText, newText]);

  const handleClear = useCallback(() => {
    setOldText("");
    setNewText("");
  }, []);

  const handleCopyDiff = useCallback(async () => {
    if (!diffResult) return;
    const text = diffResult.lines.map(l => {
      const prefix = l.type === "added" ? "+" : l.type === "removed" ? "-" : " ";
      return `${prefix} ${l.content}`;
    }).join("\n");
    
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success(t.common.copied);
    } catch {
      toast.error(t.common.unknownError);
    }
  }, [diffResult, t]);

  const handleExport = useCallback(() => {
    if (!diffResult) {
      toast.error(t.tools.textDiff.noDiff);
      return;
    }
    
    const data = {
      oldText,
      newText,
      stats: {
        additions: diffResult.additions,
        deletions: diffResult.deletions,
        unchanged: diffResult.unchanged,
      },
      diff: diffResult.lines,
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `diff-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast.success(t.tools.textDiff.exportSuccess);
  }, [diffResult, oldText, newText, t]);

  return (
    <div className="flex h-full flex-col min-h-0 p-2">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full hover:bg-muted"
          onClick={() => navigate("/toolbox")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{t.tools.textDiff.title}</h1>
          <p className="text-sm text-muted-foreground">{t.tools.textDiff.subtitle}</p>
        </div>
        {diffResult && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCopyDiff} className="gap-1.5">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {t.common.copy}
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5">
              <Download className="h-4 w-4" />
              {t.common.export}
            </Button>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col min-h-0 gap-4">
        {/* Input Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Old Text */}
          <div className="bg-muted/30 rounded-xl border overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 h-10 border-b bg-background">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{t.tools.textDiff.oldText}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {oldText.split("\n").length} lines
              </span>
            </div>
            <Textarea
              value={oldText}
              onChange={(e) => setOldText(e.target.value)}
              placeholder={t.tools.textDiff.oldPlaceholder}
              className="min-h-[150px] resize-none font-mono text-sm border-0 bg-transparent focus-visible:ring-0 p-4 shadow-none flex-1"
            />
          </div>

          {/* New Text */}
          㰽iv className="bg-muted/30 rounded-xl border overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 h-10 border-b bg-background">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{t.tools.textDiff.newText}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {newText.split("\n").length} lines
                </span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleSwap}>
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <Textarea
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              placeholder={t.tools.textDiff.newPlaceholder}
              className="min-h-[150px] resize-none font-mono text-sm border-0 bg-transparent focus-visible:ring-0 p-4 shadow-none flex-1"
            />
          </div>
        </div>

        {/* Options */}
        <div className="flex flex-wrap items-center gap-4 p-3 bg-muted/30 rounded-xl border">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{t.tools.textDiff.options}</span>
          </div>
          
          <div className="flex items-center gap-2">
            <Switch
              checked={ignoreWhitespace}
              onCheckedChange={setIgnoreWhitespace}
              id="ignore-whitespace"
            />
            <label htmlFor="ignore-whitespace" className="text-sm cursor-pointer">
              {t.tools.textDiff.ignoreWhitespace}
            </label>
          </div>
          
          <div className="flex items-center gap-2">
            <Switch
              checked={ignoreCase}
              onCheckedChange={setIgnoreCase}
              id="ignore-case"
            />
            <label htmlFor="ignore-case" className="text-sm cursor-pointer">
              {t.tools.textDiff.ignoreCase}
            </label>
          </div>
          
          <div className="flex items-center gap-2">
            <Switch
              checked={showLineNumbers}
              onCheckedChange={setShowLineNumbers}
              id="show-line-numbers"
            />
            <label htmlFor="show-line-numbers" className="text-sm cursor-pointer">
              {t.tools.textDiff.showLineNumbers}
            </label>
          </div>
          
          <div className="flex items-center gap-2">
            <Switch
              checked={showUnchanged}
              onCheckedChange={setShowUnchanged}
              id="show-unchanged"
            />
            <label htmlFor="show-unchanged" className="text-sm cursor-pointer">
              {t.tools.textDiff.showUnchanged}
            </label>
          </div>
          
          <div className="flex-1" />
          
          <Button variant="outline" size="sm" onClick={handleClear}>
            {t.common.clear}
          </Button>
        </div>

        {/* Diff Result */}
        {diffResult && (
          <div className="flex-1 bg-muted/30 rounded-xl border overflow-hidden flex flex-col min-h-0">
            {/* Stats */}
            <div className="flex items-center justify-between px-4 h-12 border-b bg-background">
              <div className="flex items-center gap-4">
                <GitCompare className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{t.tools.textDiff.diffResult}</span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-green-600">
                  +{diffResult.additions} {t.tools.textDiff.additions}
                </span>
                <span className="text-red-500">
                  -{diffResult.deletions} {t.tools.textDiff.deletions}
                </span>
                <span className="text-muted-foreground">
                  ~{diffResult.unchanged} {t.tools.textDiff.unchanged}
                </span>
              </div>
            </div>

            {/* Diff Lines */}
            <div className="flex-1 overflow-auto">
              <div className="font-mono text-sm">
                {filteredLines.map((line, index) => (
                  <div
                    key={index}
                    className={cn(
                      "flex hover:bg-muted/50 transition-colors",
                      line.type === "added" && "bg-green-500/10",
                      line.type === "removed" && "bg-red-500/10"
                    )}
                  >
                    {showLineNumbers && (
                      <div className="flex shrink-0 w-20 text-xs text-muted-foreground border-r bg-muted/30">
                        <span className={cn(
                          "w-10 text-right pr-2 py-1",
                          line.oldLineNum ? "" : "text-transparent"
                        )}>
                          {line.oldLineNum ?? " "}
                        </span>
                        <span className={cn(
                          "w-10 text-right pr-2 py-1",
                          line.newLineNum ? "" : "text-transparent"
                        )}>
                          {line.newLineNum ?? " "}
                        </span>
                      </div>
                    )}
                    <div className={cn(
                      "flex-1 py-1 px-3 whitespace-pre-wrap break-all",
                      line.type === "added" && "text-green-700",
                      line.type === "removed" && "text-red-700",
                      line.type === "unchanged" && "text-foreground"
                    )}
003e
                      <span className={cn(
                        "inline-block w-4 font-bold select-none",
                        line.type === "added" && "text-green-600",
                        line.type === "removed" && "text-red-600",
                        line.type === "unchanged" && "text-muted-foreground"
                      )}>
                        {line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}
                      </span>
                      {line.content || " "}
                    </div>
                  </div>
                ))}
              </div>
              
              {filteredLines.length === 0 && (
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                  <GitCompare className="h-8 w-8 mb-2 opacity-50" />
                  <span className="text-sm">{t.tools.textDiff.noChanges}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

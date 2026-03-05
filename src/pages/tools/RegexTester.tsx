import { useState, useCallback, useMemo } from "react";
import { ArrowLeft, Copy, Check, X, Regex, Settings2 } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface FlagOption {
  id: string;
  label: string;
  desc: string;
  checked: boolean;
}

export default function RegexTester() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [pattern, setPattern] = useState("");
  const [testText, setTestText] = useState("");
  const [flags, setFlags] = useState({ g: true, i: false, m: false, s: false });
  const [copied, setCopied] = useState(false);

  const flagOptions: FlagOption[] = [
    { id: "g", label: "g", desc: "Global - 查找所有匹配", checked: flags.g },
    { id: "i", label: "i", desc: "Ignore case - 忽略大小写", checked: flags.i },
    { id: "m", label: "m", desc: "Multiline - 多行模式", checked: flags.m },
    { id: "s", label: "s", desc: "Dot all - . 匹配换行", checked: flags.s },
  ];

  const flagString = useMemo(() => {
    return Object.entries(flags)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join("");
  }, [flags]);

  const { matches, error } = useMemo(() => {
    if (!pattern || !testText) return { matches: [], error: null };

    try {
      const regex = new RegExp(pattern, flagString);
      const results: { text: string; index: number; length: number }[] = [];

      if (flags.g) {
        let match;
        while ((match = regex.exec(testText)) !== null) {
          results.push({ text: match[0], index: match.index, length: match[0].length });
          if (match.index === regex.lastIndex) regex.lastIndex++;
        }
      } else {
        const match = regex.exec(testText);
        if (match) {
          results.push({ text: match[0], index: match.index, length: match[0].length });
        }
      }

      return { matches: results, error: null };
    } catch (e) {
      return { matches: [], error: t.tools.regexTester.invalidRegex };
    }
  }, [pattern, testText, flagString, flags.g, t.tools.regexTester.invalidRegex]);

  const highlightedText = useMemo(() => {
    if (!testText || matches.length === 0) return null;

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;

    matches.forEach((match, i) => {
      if (match.index > lastIndex) {
        parts.push(<span key={`text-${i}`}>{testText.slice(lastIndex, match.index)}</span>);
      }
      parts.push(
        <mark key={`match-${i}`} className="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5">
          {match.text}
        </mark>
      );
      lastIndex = match.index + match.length;
    });

    if (lastIndex < testText.length) {
      parts.push(<span key="text-end">{testText.slice(lastIndex)}</span>);
    }

    return parts;
  }, [testText, matches]);

  const handleCopy = useCallback(async () => {
    const fullPattern = `/${pattern}/${flagString}`;
    try {
      await navigator.clipboard.writeText(fullPattern);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [pattern, flagString]);

  const handleClear = useCallback(() => {
    setPattern("");
    setTestText("");
  }, []);

  const toggleFlag = (key: string) => {
    setFlags((prev) => ({ ...prev, [key]: !prev[key as keyof typeof prev] }));
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
          <h1 className="text-xl font-semibold">{t.tools.regexTester.title}</h1>
          <p className="text-sm text-muted-foreground">{t.tools.regexTester.subtitle}</p>
        </div>
      </div>

      {/* Pattern Input */}
      <div className="bg-muted/30 rounded-2xl border overflow-hidden">
        <div className="flex items-center justify-between px-4 h-12 border-b bg-background">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Regex className="h-4 w-4" />
            <span className="text-sm font-medium">{t.tools.regexTester.patternLabel}</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleClear}
              disabled={!pattern && !testText}
            >
              <X className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-3 gap-1.5"
              onClick={handleCopy}
              disabled={!pattern}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
        <div className="p-4 flex items-center gap-3">
          <span className="text-muted-foreground font-mono">/</span>
          <Input
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder={t.tools.regexTester.patternPlaceholder}
            className={cn("font-mono flex-1", error && "border-red-500")}
          />
          <span className="text-muted-foreground font-mono">/</span>
          <Input 
            value={flagString} 
            readOnly 
            className="w-20 font-mono text-center bg-muted" 
          />
        </div>
      </div>

      {/* Main Content - Test Text & Results */}
      <div className="flex-1 flex flex-col min-h-0 bg-muted/30 rounded-2xl border overflow-hidden p-4">
        <div className="flex items-center justify-between px-4 h-12 border-b bg-background -mx-4 -mt-4 mb-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="text-sm font-medium">{t.tools.regexTester.testTextLabel}</span>
            {matches.length > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                {matches.length} 个匹配
              </span>
            )}
          </div>
        </div>
        <div className="flex-1 min-h-0">
          <Textarea
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            placeholder="输入要测试的文本..."
            className="h-full w-full resize-none text-sm border-0 bg-transparent focus-visible:ring-0 p-0 shadow-none"
          />
        </div>
        {error && (
          <div className="px-4 py-2 text-sm text-red-500 border-t bg-red-50 dark:bg-red-950/20 -mx-4">
            {error}
          </div>
        )}
        {matches.length > 0 && (
          <div className="flex-1 min-h-0 border-t p-4 bg-background overflow-auto -mx-4">
            <div className="text-sm font-medium mb-2 text-muted-foreground">{t.tools.regexTester.matches}</div>
            <div className="p-3 bg-muted rounded-lg font-mono text-sm whitespace-pre-wrap">
              {highlightedText || <span className="text-muted-foreground">{testText}</span>}
            </div>
            <div className="mt-3 space-y-1">
              {matches.map((match, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <span className="text-xs text-muted-foreground w-8">#{i + 1}</span>
                  <code className="flex-1 font-mono bg-yellow-100 dark:bg-yellow-900/30 px-2 py-0.5 rounded">
                    {match.text}
                  </code>
                  <span className="text-xs text-muted-foreground">位置: {match.index}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Options Panel */}
      <div className="mt-4 space-y-3">
        {/* Options Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Settings2 className="h-4 w-4" />
            <span className="text-sm font-medium">{t.tools.regexTester.flagsLabel}</span>
          </div>
        </div>

        {/* Options Grid */}
        <div className="grid grid-cols-4 gap-2">
          {flagOptions.map((option) => (
            <FlagOptionCard
              key={option.id}
              id={option.id}
              label={option.label}
              desc={option.desc}
              checked={option.checked}
              onCheckedChange={() => toggleFlag(option.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// Flag Option Card Component
interface FlagOptionCardProps {
  id: string;
  label: string;
  desc: string;
  checked: boolean;
  onCheckedChange: () => void;
}

function FlagOptionCard({ id, label, desc, checked, onCheckedChange }: FlagOptionCardProps) {
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
        "w-9 h-9 rounded-lg flex items-center justify-center shrink-0 font-mono text-sm transition-colors",
        checked ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
      )}>
        {label}
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

import { useState, useCallback, useMemo } from "react";
import { ArrowLeft, Copy, Check } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/page-header";
import { useLanguage } from "@/lib/i18n";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function RegexTester() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [pattern, setPattern] = useState("");
  const [testText, setTestText] = useState("");
  const [flags, setFlags] = useState({ g: true, i: false, m: false, s: false });
  const [copied, setCopied] = useState(false);

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
        parts.push(
          <span key={`text-${i}`}>{testText.slice(lastIndex, match.index)}</span>
        );
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
      toast.success(t.common.copied);
    } catch {
      toast.error(t.common.unknownError);
    }
  }, [pattern, flagString, t]);

  return (
    <div className="flex h-full flex-col min-h-0">
      <PageHeader
        title={t.tools.regexTester.title}
        description={t.tools.regexTester.subtitle}
        actions={
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => navigate("/toolbox")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        }
      />

      <div className="flex-1 overflow-auto py-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Pattern Input */}
          <div className="rounded-xl border bg-card p-1.5">
            <div className="flex items-center justify-between mb-4">
              <Label className="font-semibold">{t.tools.regexTester.patternLabel}</Label>
              <Button variant="ghost" size="sm" onClick={handleCopy} disabled={!pattern}>
                {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                {copied ? t.common.copied : t.common.copy}
              </Button>
            </div>
            <div className="flex gap-2">
              <span className="flex items-center text-muted-foreground">/</span>
              <Input
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                placeholder={t.tools.regexTester.patternPlaceholder}
                className={cn("font-mono", error && "border-red-500")}
              />
              <span className="flex items-center text-muted-foreground">/</span>
              <Input value={flagString} readOnly className="w-20 font-mono text-center" />
            </div>
            {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
          </div>

          {/* Flags */}
          <div className="rounded-xl border bg-card p-1.5">
            <Label className="font-semibold mb-4 block">{t.tools.regexTester.flagsLabel}</Label>
            <div className="grid grid-cols-4 gap-4">
              {[
                { key: "g", label: "Global (g)", desc: "Find all matches" },
                { key: "i", label: "Ignore Case (i)", desc: "Case insensitive" },
                { key: "m", label: "Multiline (m)", desc: "^ and $ match lines" },
                { key: "s", label: "Dot All (s)", desc: ". matches newlines" },
              ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-start gap-3 rounded-lg border p-3">
                  <Switch
                    checked={flags[key as keyof typeof flags]}
                    onCheckedChange={(checked) =>
                      setFlags((f) => ({ ...f, [key]: checked }))
                    }
                  />
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Test Text */}
          <div className="rounded-xl border bg-card p-1.5">
            <Label className="font-semibold mb-4 block">{t.tools.regexTester.testTextLabel}</Label>
            <Textarea
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              placeholder="Enter text to test against the regex..."
              className="min-h-[120px] resize-none"
            />
          </div>

          {/* Matches */}
          {testText && (
            <div className="rounded-xl border bg-card p-1.5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">{t.tools.regexTester.matches}</h3>
                <span className="text-sm text-muted-foreground bg-muted px-2 py-1 rounded">
                  {t.tools.regexTester.matchCount(matches.length)}
                </span>
              </div>

              {/* Highlighted Text */}
              <div className="p-4 bg-muted rounded-lg font-mono text-sm whitespace-pre-wrap mb-4">
                {highlightedText || <span className="text-muted-foreground">{testText}</span>}
              </div>

              {/* Match List */}
              {matches.length > 0 ? (
                <div className="space-y-2">
                  {matches.map((match, i) => (
                    <div key={i} className="flex items-center gap-4 p-3 bg-muted rounded-lg">
                      <span className="text-xs text-muted-foreground w-8">#{i + 1}</span>
                      <code className="flex-1 font-mono text-sm bg-yellow-200 dark:bg-yellow-800 px-2 py-1 rounded">
                        {match.text}
                      </code>
                      <span className="text-xs text-muted-foreground">
                        Index: {match.index}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-4">
                  {t.tools.regexTester.noMatches}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

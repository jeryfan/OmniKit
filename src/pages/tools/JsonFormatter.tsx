import { useState, useCallback } from "react";
import { ArrowLeft, Copy, Check, FileJson, Trash2, AlignLeft, Minimize2, GitCompare } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/page-header";
import { useLanguage } from "@/lib/i18n";
import { toast } from "sonner";
import { diff_match_patch } from "diff-match-patch";

const dmp = new diff_match_patch();

export default function JsonFormatter() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [compareInput, setCompareInput] = useState("");
  const [diffOutput, setDiffOutput] = useState("");
  const [copied, setCopied] = useState(false);
  const [diffOnly, setDiffOnly] = useState(false);
  const [activeTab, setActiveTab] = useState("output");

  const formatJson = useCallback(() => {
    if (!input.trim()) {
      toast.error(t.tools.jsonFormatter.invalidJson);
      return;
    }

    try {
      const parsed = JSON.parse(input);
      const formatted = JSON.stringify(parsed, null, 2);
      setOutput(formatted);
      setActiveTab("output");
      toast.success(t.tools.jsonFormatter.formatted);
    } catch {
      toast.error(t.tools.jsonFormatter.invalidJson);
    }
  }, [input, t]);

  const minifyJson = useCallback(() => {
    if (!input.trim()) {
      toast.error(t.tools.jsonFormatter.invalidJson);
      return;
    }

    try {
      const parsed = JSON.parse(input);
      const minified = JSON.stringify(parsed);
      setOutput(minified);
      setActiveTab("output");
      toast.success(t.tools.jsonFormatter.formatted);
    } catch {
      toast.error(t.tools.jsonFormatter.invalidJson);
    }
  }, [input, t]);

  const compareJson = useCallback(() => {
    if (!input.trim() || !compareInput.trim()) {
      toast.error(t.tools.jsonFormatter.invalidJson);
      return;
    }

    try {
      const parsed1 = JSON.parse(input);
      const parsed2 = JSON.parse(compareInput);

      const str1 = JSON.stringify(parsed1, null, 2);
      const str2 = JSON.stringify(parsed2, null, 2);

      const diffs = dmp.diff_main(str1, str2);
      dmp.diff_cleanupSemantic(diffs);

      // Create a simple diff display
      const diffLines = diffs
        .map(([op, text]) => {
          if (op === -1) return `- ${text}`;
          if (op === 1) return `+ ${text}`;
          return diffOnly ? null : `  ${text}`;
        })
        .filter(Boolean)
        .join("\n");

      setDiffOutput(diffLines);
      setActiveTab("diff");
    } catch {
      toast.error(t.tools.jsonFormatter.invalidJson);
    }
  }, [input, compareInput, diffOnly, t]);

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
    setCompareInput("");
    setDiffOutput("");
  }, []);

  return (
    <div className="flex h-full flex-col min-h-0">
      <PageHeader
        title={t.tools.jsonFormatter.title}
        description={t.tools.jsonFormatter.subtitle}
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
              <span className="font-medium">{t.tools.jsonFormatter.inputLabel}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleClear} disabled={!input}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              {t.common.clear}
            </Button>
          </div>
          <div className="p-4">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t.tools.jsonFormatter.inputPlaceholder}
              className="h-full resize-none font-mono text-sm"
            />
          </div>
          <div className="px-4 pb-4 flex gap-2">
            <Button onClick={formatJson} disabled={!input.trim()} className="flex-1">
              <AlignLeft className="mr-2 h-4 w-4" />
              {t.tools.jsonFormatter.format}
            </Button>
            <Button onClick={minifyJson} disabled={!input.trim()} variant="outline" className="flex-1">
              <Minimize2 className="mr-2 h-4 w-4" />
              {t.tools.jsonFormatter.minify}
            </Button>
          </div>
        </div>

        {/* Compare Section */}
        {activeTab === "diff" && (
          <div className="rounded-xl border bg-card flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <span className="font-medium">{t.tools.jsonFormatter.compare}</span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{t.tools.jsonFormatter.diffOnly}</span>
                <Switch checked={diffOnly} onCheckedChange={setDiffOnly} />
              </div>
            </div>
            <div className="p-4">
              <Textarea
                value={compareInput}
                onChange={(e) => setCompareInput(e.target.value)}
                placeholder={t.tools.jsonFormatter.comparePlaceholder}
                className="h-full resize-none font-mono text-sm"
              />
            </div>
            <div className="px-4 pb-4">
              <Button onClick={compareJson} disabled={!input.trim() || !compareInput.trim()} className="w-full">
                <GitCompare className="mr-2 h-4 w-4" />
                {t.tools.jsonFormatter.compare}
              </Button>
            </div>
          </div>
        )}

        {/* Output Section */}
        {(output || diffOutput) && (
          <div className="flex-1 flex flex-col min-h-0">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
              <TabsList className="w-full grid grid-cols-2">
                <TabsTrigger value="output">{t.tools.jsonFormatter.outputLabel}</TabsTrigger>
                <TabsTrigger value="diff">{t.tools.jsonFormatter.compare}</TabsTrigger>
              </TabsList>

              <TabsContent value="output" className="flex-1 mt-4">
                <div className="rounded-xl border bg-card h-full flex flex-col">
                  <div className="flex items-center justify-end px-4 py-3 border-b">
                    <Button variant="ghost" size="sm" onClick={handleCopy} disabled={!output}>
                      {copied ? (
                        <Check className="mr-1.5 h-3.5 w-3.5" />
                      ) : (
                        <Copy className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {copied ? t.common.copied : t.tools.jsonFormatter.copy}
                    </Button>
                  </div>
                  <div className="flex-1 p-4 overflow-auto">
                      <pre className="font-mono text-sm whitespace-pre-wrap">{output}</pre>
                    </div>
                </div>
              </TabsContent>

              <TabsContent value="diff" className="flex-1 mt-4">
                <div className="rounded-xl border bg-card h-full flex flex-col">
                  <div className="flex items-center justify-end px-4 py-3 border-b gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">{t.tools.jsonFormatter.diffOnly}</span>
                      <Switch checked={diffOnly} onCheckedChange={setDiffOnly} />
                    </div>
                    <Button variant="ghost" size="sm" onClick={compareJson} disabled={!input.trim() || !compareInput.trim()}>
                      <GitCompare className="mr-1.5 h-3.5 w-3.5" />
                      {t.tools.jsonFormatter.compare}
                    </Button>
                  </div>
                  <div className="flex-1 p-4 overflow-auto">
                      <pre className="font-mono text-sm whitespace-pre-wrap">
                        {diffOutput || "Click Compare to see differences"}
                      </pre>
                    </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useCallback } from "react";
import { ArrowLeft, Eraser, Copy, Check, Trash2, Sparkles } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/page-header";
import { useLanguage } from "@/lib/i18n";
import { toast } from "sonner";

export default function TextCleaner() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [copied, setCopied] = useState(false);

  // Options
  const [removeSpaces, setRemoveSpaces] = useState(true);
  const [removeNewlines, setRemoveNewlines] = useState(true);
  const [removeTabs, setRemoveTabs] = useState(true);
  const [trimLines, setTrimLines] = useState(false);
  const [removeExtraSpaces, setRemoveExtraSpaces] = useState(false);

  // Master switch state - computed from all options
  const allSelected = removeSpaces && removeNewlines && removeTabs && trimLines && removeExtraSpaces;
  const noneSelected = !removeSpaces && !removeNewlines && !removeTabs && !trimLines && !removeExtraSpaces;
  const removeAll = allSelected;

  const handleRemoveAll = useCallback((checked: boolean) => {
    setRemoveSpaces(checked);
    setRemoveNewlines(checked);
    setRemoveTabs(checked);
    setTrimLines(checked);
    setRemoveExtraSpaces(checked);
  }, []);

  const processText = useCallback(() => {
    if (!input.trim()) {
      toast.error(t.tools.textCleaner.emptyInput);
      return;
    }

    let result = input;

    // Trim each line first if enabled
    if (trimLines) {
      result = result
        .split("\n")
        .map((line) => line.trim())
        .join("\n");
    }

    // Remove tabs
    if (removeTabs) {
      result = result.replace(/\t/g, "");
    }

    // Remove newlines
    if (removeNewlines) {
      result = result.replace(/\r?\n/g, "");
    }

    // Remove extra spaces (multiple spaces become one)
    if (removeExtraSpaces) {
      result = result.replace(/ +/g, " ");
    }

    // Remove all spaces
    if (removeSpaces) {
      result = result.replace(/ /g, "");
    }

    setOutput(result);
    toast.success(t.tools.textCleaner.processed);
  }, [input, removeSpaces, removeNewlines, removeTabs, trimLines, removeExtraSpaces, t]);

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
  }, []);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={t.tools.textCleaner.title}
        description={t.tools.textCleaner.subtitle}
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate("/toolbox")}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            {t.tools.textCleaner.back}
          </Button>
        }
      />

      <div className="flex-1 overflow-auto p-6">
        {/* Options - Moved to top */}
        <div className="mb-6 rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">{t.tools.textCleaner.options}</span>
          </div>

          {/* Master Switch - Remove All */}
          <div className="mb-4 flex items-center justify-between rounded-lg bg-primary/5 border border-primary/20 p-4">
            <div className="space-y-0.5">
              <Label htmlFor="remove-all" className="text-sm font-semibold text-primary">
                {t.tools.textCleaner.removeAll}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t.tools.textCleaner.removeAllDesc}
              </p>
            </div>
            <Switch
              id="remove-all"
              checked={removeAll}
              onCheckedChange={handleRemoveAll}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex items-center justify-between space-x-2 rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="remove-spaces" className="text-sm">
                  {t.tools.textCleaner.removeSpaces}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t.tools.textCleaner.removeSpacesDesc}
                </p>
              </div>
              <Switch
                id="remove-spaces"
                checked={removeSpaces}
                onCheckedChange={setRemoveSpaces}
              />
            </div>

            <div className="flex items-center justify-between space-x-2 rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="remove-newlines" className="text-sm">
                  {t.tools.textCleaner.removeNewlines}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t.tools.textCleaner.removeNewlinesDesc}
                </p>
              </div>
              <Switch
                id="remove-newlines"
                checked={removeNewlines}
                onCheckedChange={setRemoveNewlines}
              />
            </div>

            <div className="flex items-center justify-between space-x-2 rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="remove-tabs" className="text-sm">
                  {t.tools.textCleaner.removeTabs}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t.tools.textCleaner.removeTabsDesc}
                </p>
              </div>
              <Switch
                id="remove-tabs"
                checked={removeTabs}
                onCheckedChange={setRemoveTabs}
              />
            </div>

            <div className="flex items-center justify-between space-x-2 rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="trim-lines" className="text-sm">
                  {t.tools.textCleaner.trimLines}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t.tools.textCleaner.trimLinesDesc}
                </p>
              </div>
              <Switch
                id="trim-lines"
                checked={trimLines}
                onCheckedChange={setTrimLines}
              />
            </div>

            <div className="flex items-center justify-between space-x-2 rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="remove-extra-spaces" className="text-sm">
                  {t.tools.textCleaner.removeExtraSpaces}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t.tools.textCleaner.removeExtraSpacesDesc}
                </p>
              </div>
              <Switch
                id="remove-extra-spaces"
                checked={removeExtraSpaces}
                onCheckedChange={setRemoveExtraSpaces}
              />
            </div>
          </div>

          <Button
            className="mt-4 w-full"
            onClick={processText}
            disabled={!input.trim()}
          >
            <Eraser className="mr-1.5 h-4 w-4" />
            {t.tools.textCleaner.process}
          </Button>
        </div>

        {/* Input Section - Full width */}
        <div className="mb-4 space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">
              {t.tools.textCleaner.inputLabel}
            </Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              disabled={!input && !output}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              {t.tools.textCleaner.clear}
            </Button>
          </div>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t.tools.textCleaner.inputPlaceholder}
            className="min-h-[120px] resize-none font-mono text-sm border-input transition-colors focus-visible:ring-0 focus-visible:border-ring"
          />
        </div>

        {/* Output Section - Full width */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">
              {t.tools.textCleaner.outputLabel}
            </Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              disabled={!output}
            >
              {copied ? (
                <Check className="mr-1.5 h-3.5 w-3.5" />
              ) : (
                <Copy className="mr-1.5 h-3.5 w-3.5" />
              )}
              {copied ? t.common.copied : t.common.copy}
            </Button>
          </div>
          <Textarea
            value={output}
            readOnly
            placeholder={t.tools.textCleaner.outputPlaceholder}
            className="min-h-[120px] resize-none font-mono text-sm bg-muted/30 focus-visible:ring-0"
          />
        </div>
      </div>
    </div>
  );
}

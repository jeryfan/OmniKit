import { useState, useCallback } from "react";
import { ArrowLeft, Copy, Check, FileText, SplitSquareHorizontal } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";
import { useLanguage } from "@/lib/i18n";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function MarkdownPreview() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [input, setInput] = useState(`# Hello Markdown

This is a **live** preview of your Markdown content.

## Features

- GitHub Flavored Markdown
- Tables support
- Code blocks with syntax highlighting
- And more!

## Code Example

\`\`\`javascript
console.log("Hello, world!");
\`\`\`

## Table

| Feature | Status |
|---------|--------|
| Tables | ✅ |
| Lists | ✅ |
| Links | ✅ |
`);
  const [splitView, setSplitView] = useState(true);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!input) return;
    try {
      await navigator.clipboard.writeText(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success(t.common.copied);
    } catch {
      toast.error(t.common.unknownError);
    }
  }, [input, t]);

  const handleClear = useCallback(() => {
    setInput("");
  }, []);

  return (
    <div className="flex h-full flex-col min-h-0">
      <PageHeader
        title={t.tools.markdownPreview.title}
        description={t.tools.markdownPreview.subtitle}
        actions={
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => navigate("/toolbox")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        }
      />

      <div className="flex-1 flex flex-col min-h-0 py-6 gap-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm font-medium">{t.tools.markdownPreview.inputLabel}</Label>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <SplitSquareHorizontal className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm">{t.tools.markdownPreview.splitView}</Label>
              <Switch checked={splitView} onCheckedChange={setSplitView} />
            </div>
            <Button variant="ghost" size="sm" onClick={handleCopy} disabled={!input}>
              {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
              {copied ? t.common.copied : t.tools.markdownPreview.copy}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleClear} disabled={!input}>
              {t.common.clear}
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className={`flex-1 flex gap-4 overflow-hidden ${splitView ? '' : 'flex-col'}`}>
          {/* Editor */}
          <div className={`rounded-xl border bg-card flex flex-col ${splitView ? 'w-1/2' : 'h-1/2'}`}>
            <div className="flex-1 p-4 overflow-auto">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t.tools.markdownPreview.inputPlaceholder}
                className="h-full w-full resize-none font-mono text-sm border-0 focus-visible:ring-0 p-0"
              />
            </div>
          </div>

          {/* Preview */}
          <div className={`rounded-xl border bg-card flex flex-col ${splitView ? 'w-1/2' : 'flex-1'}`}>
            <div className="px-4 py-3 border-b">
              <span className="font-medium">{t.tools.markdownPreview.previewLabel}</span>
            </div>
            <div className="flex-1 p-6 overflow-auto prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {input || "*Start typing to see preview...*"}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

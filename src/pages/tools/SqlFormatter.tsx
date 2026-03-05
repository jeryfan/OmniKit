import { useState, useCallback } from "react";
import { ArrowLeft, Copy, Check, Database, Sparkles } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { useLanguage } from "@/lib/i18n";
import { toast } from "sonner";
import { format } from "sql-formatter";

export default function SqlFormatter() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [dialect, setDialect] = useState("sql");
  const [uppercase, setUppercase] = useState(true);
  const [copied, setCopied] = useState(false);

  const formatSql = useCallback(() => {
    if (!input.trim()) {
      toast.error("Please enter SQL");
      return;
    }

    try {
      const formatted = format(input, {
        language: dialect as "sql" | "mysql" | "postgresql" | "sqlite" | "bigquery",
        keywordCase: uppercase ? "upper" : "lower",
        indentStyle: "standard",
      });
      setOutput(formatted);
      toast.success(t.tools.sqlFormatter.formatted);
    } catch (e) {
      toast.error("Invalid SQL");
    }
  }, [input, dialect, uppercase, t]);

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
    <div className="flex h-full flex-col min-h-0">
      <PageHeader
        title={t.tools.sqlFormatter.title}
        description={t.tools.sqlFormatter.subtitle}
        actions={
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => navigate("/toolbox")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        }
      />

      <div className="flex-1 flex flex-col min-h-0 py-6 gap-4">
        {/* Options Bar */}
        <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm">{t.tools.sqlFormatter.dialectLabel}</Label>
            <Select value={dialect} onValueChange={setDialect}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sql">Standard</SelectItem>
                <SelectItem value="mysql">MySQL</SelectItem>
                <SelectItem value="postgresql">PostgreSQL</SelectItem>
                <SelectItem value="sqlite">SQLite</SelectItem>
                <SelectItem value="bigquery">BigQuery</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={uppercase} onCheckedChange={setUppercase} />
            <Label className="text-sm">{t.tools.sqlFormatter.uppercase}</Label>
          </div>
        </div>

        {/* Input */}
        <div className="rounded-xl border bg-card flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <span className="font-medium">{t.tools.sqlFormatter.inputLabel}</span>
            <Button variant="ghost" size="sm" onClick={handleClear} disabled={!input}>
              {t.common.clear}
            </Button>
          </div>
          <div className="p-4">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t.tools.sqlFormatter.inputPlaceholder}
              className="h-full resize-none font-mono text-sm"
            />
          </div>
          <div className="px-4 pb-4">
            <Button onClick={formatSql} disabled={!input.trim()} className="w-full">
              <Sparkles className="mr-2 h-4 w-4" />
              {t.tools.sqlFormatter.format}
            </Button>
          </div>
        </div>

        {/* Output */}
        {output ? (
          <div className="rounded-xl border bg-card flex flex-col flex-1">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <span className="font-medium">{t.tools.sqlFormatter.outputLabel}</span>
              <Button variant="ghost" size="sm" onClick={handleCopy}>
                {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                {copied ? t.common.copied : t.tools.sqlFormatter.copy}
              </Button>
            </div>
            <div className="flex-1 p-4 overflow-auto">
              <pre className="font-mono text-sm whitespace-pre-wrap">{output}</pre>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

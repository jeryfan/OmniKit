import { useState, useCallback } from "react";
import { ArrowLeft, Copy, Check, X, FileJson, AlignLeft, Minimize2, Settings2 } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useLanguage } from "@/lib/i18n";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface FormatOption {
  id: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
}

export default function JsonFormatter() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"input" | "output">("input");
  const [formatMode, setFormatMode] = useState<"format" | "minify">("format");

  const formatOptions: FormatOption[] = [
    {
      id: "format",
      label: t.tools.jsonFormatter.format,
      desc: "格式化输出，带缩进",
      icon: <AlignLeft className="h-4 w-4" />,
    },
    {
      id: "minify",
      label: t.tools.jsonFormatter.minify,
      desc: "压缩为单行",
      icon: <Minimize2 className="h-4 w-4" />,
    },
  ];

  const processJson = useCallback(() => {
    if (!input.trim()) {
      toast.error(t.tools.jsonFormatter.invalidJson);
      return;
    }

    try {
      const parsed = JSON.parse(input);
      const formatted = formatMode === "format" 
        ? JSON.stringify(parsed, null, 2) 
        : JSON.stringify(parsed);
      setOutput(formatted);
      setActiveTab("output");
      toast.success(t.tools.jsonFormatter.formatted);
    } catch {
      toast.error(t.tools.jsonFormatter.invalidJson);
    }
  }, [input, formatMode, t]);

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
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8 rounded-full hover:bg-muted" 
          onClick={() => navigate("/toolbox")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">{t.tools.jsonFormatter.title}</h1>
          <p className="text-sm text-muted-foreground">{t.tools.jsonFormatter.subtitle}</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-0 bg-muted/30 rounded-2xl border overflow-hidden">
        {/* Toolbar with Tabs */}
        <div className="flex items-center justify-between px-4 h-12 border-b bg-background">
          <div className="flex items-center gap-1">
            <TabButton 
              active={activeTab === "input"} 
              onClick={() => setActiveTab("input")}
              label={t.tools.jsonFormatter.inputLabel}
              count={input.length}
            />
            <TabButton 
              active={activeTab === "output"} 
              onClick={() => setActiveTab("output")}
              label={t.tools.jsonFormatter.outputLabel}
              count={output.length}
              showCount={output.length > 0}
            />
          </div>
          <div className="flex items-center gap-1">
            {activeTab === "input" ? (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleClear}
                  disabled={!input && !output}
                >
                  <X className="h-4 w-4" />
                </Button>
                <Button
                  onClick={processJson}
                  disabled={!input.trim()}
                  size="sm"
                  className="h-8 px-3 gap-1.5"
                >
                  <FileJson className="h-3.5 w-3.5" />
                  {formatMode === "format" ? t.tools.jsonFormatter.format : t.tools.jsonFormatter.minify}
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 gap-1.5"
                onClick={handleCopy}
                disabled={!output}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? t.common.copied : t.common.copy}
              </Button>
            )}
          </div>
        </div>

        {/* Editor Area */}
        <div className="flex-1 min-h-0 p-4">
          {activeTab === "input" ? (
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t.tools.jsonFormatter.inputPlaceholder}
              className="h-full w-full resize-none font-mono text-sm border-0 bg-transparent focus-visible:ring-0 p-0 shadow-none"
              autoFocus
            />
          ) : (
            <Textarea
              value={output}
              readOnly
              placeholder="格式化后的 JSON 将显示在这里..."
              className="h-full w-full resize-none font-mono text-sm border-0 bg-transparent focus-visible:ring-0 p-0 shadow-none"
            />
          )}
        </div>
      </div>

      {/* Options Panel */}
      <div className="mt-4 space-y-3">
        {/* Options Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Settings2 className="h-4 w-4" />
            <span className="text-sm font-medium">格式化选项</span>
          </div>
        </div>

        {/* Options Grid */}
        <div className="grid grid-cols-2 gap-2">
          {formatOptions.map((option) => (
            <FormatOptionCard
              key={option.id}
              id={option.id}
              label={option.label}
              desc={option.desc}
              icon={option.icon}
              checked={formatMode === option.id}
              onCheckedChange={() => setFormatMode(option.id as "format" | "minify")}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// Tab Button Component
interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  showCount?: boolean;
}

function TabButton({ active, onClick, label, count, showCount = true }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
        active 
          ? "bg-primary text-primary-foreground" 
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <span>{label}</span>
      {showCount && (
        <span className={cn(
          "text-xs px-1.5 py-0.5 rounded-full",
          active ? "bg-primary-foreground/20" : "bg-muted"
        )}>
          {count}
        </span>
      )}
    </button>
  );
}

// Format Option Card Component
interface FormatOptionCardProps {
  id: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
  checked: boolean;
  onCheckedChange: () => void;
}

function FormatOptionCard({ id, label, desc, icon, checked, onCheckedChange }: FormatOptionCardProps) {
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
        "w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors",
        checked ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
      )}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className={cn(
          "text-sm font-medium truncate",
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

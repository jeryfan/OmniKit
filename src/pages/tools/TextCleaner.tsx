import { useState, useCallback } from "react";
import { ArrowLeft, Eraser, Copy, Check, X, Space, AlignLeft, ArrowRightFromLine, Indent, Minimize2, Settings2 } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useLanguage } from "@/lib/i18n";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Option item type definition
interface OptionItem {
  id: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export default function TextCleaner() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"input" | "output">("input");

  // Options
  const [removeSpaces, setRemoveSpaces] = useState(true);
  const [removeNewlines, setRemoveNewlines] = useState(true);
  const [removeTabs, setRemoveTabs] = useState(true);
  const [trimLines, setTrimLines] = useState(false);
  const [removeExtraSpaces, setRemoveExtraSpaces] = useState(false);

  // Master switch state - computed from all options
  const allSelected = removeSpaces && removeNewlines && removeTabs && trimLines && removeExtraSpaces;

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

    if (trimLines) {
      result = result
        .split("\n")
        .map((line) => line.trim())
        .join("\n");
    }
    if (removeTabs) {
      result = result.replace(/\t/g, "");
    }
    if (removeNewlines) {
      result = result.replace(/\r?\n/g, "");
    }
    if (removeExtraSpaces) {
      result = result.replace(/ +/g, " ");
    }
    if (removeSpaces) {
      result = result.replace(/ /g, "");
    }

    setOutput(result);
    setActiveTab("output");
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

  const options: OptionItem[] = [
    {
      id: "remove-spaces",
      label: t.tools.textCleaner.removeSpaces,
      desc: "移除所有空格字符",
      icon: <Space className="h-4 w-4" />,
      checked: removeSpaces,
      onChange: setRemoveSpaces,
    },
    {
      id: "remove-newlines",
      label: t.tools.textCleaner.removeNewlines,
      desc: "移除所有换行符",
      icon: <ArrowRightFromLine className="h-4 w-4" />,
      checked: removeNewlines,
      onChange: setRemoveNewlines,
    },
    {
      id: "remove-tabs",
      label: t.tools.textCleaner.removeTabs,
      desc: "移除所有 Tab 字符",
      icon: <Indent className="h-4 w-4" />,
      checked: removeTabs,
      onChange: setRemoveTabs,
    },
    {
      id: "trim-lines",
      label: t.tools.textCleaner.trimLines,
      desc: "去除每行首尾空白",
      icon: <AlignLeft className="h-4 w-4" />,
      checked: trimLines,
      onChange: setTrimLines,
    },
    {
      id: "remove-extra-spaces",
      label: t.tools.textCleaner.removeExtraSpaces,
      desc: "合并多个连续空格",
      icon: <Minimize2 className="h-4 w-4" />,
      checked: removeExtraSpaces,
      onChange: setRemoveExtraSpaces,
    },
  ];

  return (
    <div className="flex h-full flex-col min-h-0 p-1.5">
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
          <h1 className="text-xl font-semibold">{t.tools.textCleaner.title}</h1>
          <p className="text-sm text-muted-foreground">{t.tools.textCleaner.subtitle}</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-0 bg-muted/30 rounded-2xl border overflow-hidden p-4">
        {/* Toolbar with Tabs */}
        <div className="flex items-center justify-between px-4 h-12 border-b bg-background">
          <div className="flex items-center gap-1">
            <TabButton 
              active={activeTab === "input"} 
              onClick={() => setActiveTab("input")}
              label={t.tools.textCleaner.inputLabel}
              count={input.length}
            />
            <TabButton 
              active={activeTab === "output"} 
              onClick={() => setActiveTab("output")}
              label={t.tools.textCleaner.outputLabel}
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
                  onClick={processText}
                  disabled={!input.trim()}
                  size="sm"
                  className="h-8 px-3 gap-1.5"
                >
                  <Eraser className="h-3.5 w-3.5" />
                  {t.tools.textCleaner.process}
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
        <div className="flex-1 min-h-0">
          {activeTab === "input" ? (
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t.tools.textCleaner.inputPlaceholder}
              className="h-full w-full resize-none font-mono text-sm border-0 bg-transparent focus-visible:ring-0 p-0 shadow-none"
              autoFocus
            />
          ) : (
            <Textarea
              value={output}
              readOnly
              placeholder={t.tools.textCleaner.outputPlaceholder}
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
            <span className="text-sm font-medium">{t.tools.textCleaner.options}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{t.tools.textCleaner.removeAll}</span>
            <Switch
              checked={allSelected}
              onCheckedChange={handleRemoveAll}
            />
          </div>
        </div>

        {/* Options Grid */}
        <div className="grid grid-cols-5 gap-2">
          {options.map((option) => (
            <OptionItem
              key={option.id}
              id={option.id}
              label={option.label}
              desc={option.desc}
              icon={option.icon}
              checked={option.checked}
              onCheckedChange={option.onChange}
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

// Option Item Component
interface OptionItemProps {
  id: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

function OptionItem({ id, label, desc, icon, checked, onCheckedChange }: OptionItemProps) {
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

import { useState, useCallback } from "react";
import { ArrowLeft, Copy, Check, X, Code2, Link2, Hash, Settings2 } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useLanguage } from "@/lib/i18n";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type CodecMode = "base64" | "url" | "hex";

interface ModeOption {
  id: CodecMode;
  label: string;
  desc: string;
  icon: React.ReactNode;
}

export default function Base64Codec() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [mode, setMode] = useState<CodecMode>("base64");
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"input" | "output">("input");

  const modeOptions: ModeOption[] = [
    {
      id: "base64",
      label: t.tools.base64Codec.modeBase64,
      desc: "标准 Base64 编码",
      icon: <Code2 className="h-4 w-4" />,
    },
    {
      id: "url",
      label: t.tools.base64Codec.modeUrl,
      desc: "URL 编码/解码",
      icon: <Link2 className="h-4 w-4" />,
    },
    {
      id: "hex",
      label: t.tools.base64Codec.modeHex,
      desc: "十六进制编解码",
      icon: <Hash className="h-4 w-4" />,
    },
  ];

  const encode = useCallback(() => {
    if (!input) {
      toast.error(t.tools.base64Codec.invalidInput);
      return;
    }

    try {
      let result = "";
      switch (mode) {
        case "base64":
          result = btoa(unescape(encodeURIComponent(input)));
          break;
        case "url":
          result = encodeURIComponent(input);
          break;
        case "hex":
          result = input
            .split("")
            .map((c) => c.charCodeAt(0).toString(16).padStart(2, "0"))
            .join("");
          break;
      }
      setOutput(result);
      setActiveTab("output");
    } catch {
      toast.error(t.tools.base64Codec.invalidInput);
    }
  }, [input, mode, t]);

  const decode = useCallback(() => {
    if (!input) {
      toast.error(t.tools.base64Codec.invalidInput);
      return;
    }

    try {
      let result = "";
      switch (mode) {
        case "base64":
          result = decodeURIComponent(escape(atob(input)));
          break;
        case "url":
          result = decodeURIComponent(input);
          break;
        case "hex":
          result = input
            .match(/.{1,2}/g)
            ?.map((byte) => String.fromCharCode(parseInt(byte, 16)))
            .join("") || "";
          break;
      }
      setOutput(result);
      setActiveTab("output");
    } catch {
      toast.error(t.tools.base64Codec.invalidInput);
    }
  }, [input, mode, t]);

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
      <div className="flex items-center gap-3 mb-3">
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8 rounded-full hover:bg-muted" 
          onClick={() => navigate("/toolbox")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">{t.tools.base64Codec.title}</h1>
          <p className="text-sm text-muted-foreground">{t.tools.base64Codec.subtitle}</p>
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
              label={t.tools.base64Codec.inputLabel}
              count={input.length}
            />
            <TabButton 
              active={activeTab === "output"} 
              onClick={() => setActiveTab("output")}
              label={t.tools.base64Codec.outputLabel}
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
                  onClick={decode}
                  disabled={!input}
                  size="sm"
                  variant="outline"
                  className="h-8 px-3"
                >
                  {t.tools.base64Codec.decode}
                </Button>
                <Button
                  onClick={encode}
                  disabled={!input}
                  size="sm"
                  className="h-8 px-3"
                >
                  {t.tools.base64Codec.encode}
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
              placeholder={t.tools.base64Codec.inputLabel}
              className="h-full w-full resize-none font-mono text-sm border-0 bg-transparent focus-visible:ring-0 p-0 shadow-none"
              autoFocus
            />
          ) : (
            <Textarea
              value={output}
              readOnly
              placeholder={t.tools.base64Codec.outputLabel}
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
            <span className="text-sm font-medium">编码模式</span>
          </div>
        </div>

        {/* Options Grid */}
        <div className="grid grid-cols-3 gap-2">
          {modeOptions.map((option) => (
            <ModeOptionCard
              key={option.id}
              id={option.id}
              label={option.label}
              desc={option.desc}
              icon={option.icon}
              checked={mode === option.id}
              onCheckedChange={() => setMode(option.id)}
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

// Mode Option Card Component
interface ModeOptionCardProps {
  id: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
  checked: boolean;
  onCheckedChange: () => void;
}

function ModeOptionCard({ id, label, desc, icon, checked, onCheckedChange }: ModeOptionCardProps) {
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

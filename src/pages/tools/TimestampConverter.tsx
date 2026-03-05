import { useState, useCallback } from "react";
import { ArrowLeft, Copy, Check, X, Clock, Calendar, Settings2 } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useLanguage } from "@/lib/i18n";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface TimezoneOption {
  id: string;
  label: string;
  desc: string;
  checked: boolean;
}

export default function TimestampConverter() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [timestamp, setTimestamp] = useState("");
  const [dateStr, setDateStr] = useState("");
  const [isUTC, setIsUTC] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"timestamp" | "date">("timestamp");

  const timezoneOptions: TimezoneOption[] = [
    { id: "local", label: t.tools.timestampConverter.local, desc: "本地时区", checked: !isUTC },
    { id: "utc", label: t.tools.timestampConverter.utc, desc: "协调世界时", checked: isUTC },
  ];

  const convertTimestamp = useCallback(() => {
    if (!timestamp) return;
    const ts = parseInt(timestamp);
    if (isNaN(ts)) {
      toast.error(t.tools.timestampConverter.invalidTimestamp);
      return;
    }

    try {
      const date = new Date(ts.toString().length === 10 ? ts * 1000 : ts);
      if (isUTC) {
        setDateStr(date.toISOString());
      } else {
        setDateStr(date.toLocaleString());
      }
      setActiveTab("date");
    } catch {
      toast.error(t.tools.timestampConverter.invalidTimestamp);
    }
  }, [timestamp, isUTC, t]);

  const convertDate = useCallback(() => {
    if (!dateStr) return;
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        toast.error(t.tools.timestampConverter.invalidTimestamp);
        return;
      }
      setTimestamp(date.getTime().toString());
      setActiveTab("timestamp");
    } catch {
      toast.error(t.tools.timestampConverter.invalidTimestamp);
    }
  }, [dateStr, t]);

  const handleNow = useCallback(() => {
    const now = Date.now();
    setTimestamp(now.toString());
    if (isUTC) {
      setDateStr(new Date(now).toISOString());
    } else {
      setDateStr(new Date(now).toLocaleString());
    }
  }, [isUTC]);

  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success(t.common.copied);
    } catch {
      toast.error(t.common.unknownError);
    }
  }, [t]);

  const handleClear = useCallback(() => {
    setTimestamp("");
    setDateStr("");
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
          <h1 className="text-xl font-semibold">{t.tools.timestampConverter.title}</h1>
          <p className="text-sm text-muted-foreground">{t.tools.timestampConverter.subtitle}</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-0 bg-muted/30 rounded-2xl border overflow-hidden">
        {/* Toolbar with Tabs */}
        <div className="flex items-center justify-between px-4 h-12 border-b bg-background">
          <div className="flex items-center gap-1">
            <TabButton 
              active={activeTab === "timestamp"} 
              onClick={() => setActiveTab("timestamp")}
              label={t.tools.timestampConverter.timestampLabel}
              showCount={false}
            />
            <TabButton 
              active={activeTab === "date"} 
              onClick={() => setActiveTab("date")}
              label={t.tools.timestampConverter.dateLabel}
              showCount={false}
            />
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleClear}
              disabled={!timestamp && !dateStr}
            >
              <X className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3"
              onClick={handleNow}
            >
              <Clock className="h-3.5 w-3.5 mr-1.5" />
              {t.tools.timestampConverter.now}
            </Button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 min-h-0 p-6 space-y-6 overflow-auto">
          {/* Timestamp Input */}
          <div className={cn("space-y-2", activeTab !== "timestamp" && "opacity-50")}>
            <label className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              {t.tools.timestampConverter.timestampLabel}
            </label>
            <div className="flex gap-2">
              <Input
                value={timestamp}
                onChange={(e) => setTimestamp(e.target.value)}
                placeholder="1704067200000"
                className="font-mono flex-1"
                type="number"
              />
              <Button
                onClick={() => handleCopy(timestamp)}
                disabled={!timestamp}
                variant="ghost"
                size="icon"
                className="h-10 w-10"
              >
                {copied && timestamp ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Convert Button */}
          <div className="flex justify-center">
            <Button
              onClick={activeTab === "timestamp" ? convertTimestamp : convertDate}
              disabled={activeTab === "timestamp" ? !timestamp : !dateStr}
              className="h-10 px-6"
            >
              {t.tools.timestampConverter.convert}
            </Button>
          </div>

          {/* Date Input */}
          <div className={cn("space-y-2", activeTab !== "date" && "opacity-50")}>
            <label className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              {t.tools.timestampConverter.dateLabel}
            </label>
            <div className="flex gap-2">
              <Input
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                placeholder="2024-01-01 00:00:00"
                className="font-mono flex-1"
              />
              <Button
                onClick={() => handleCopy(dateStr)}
                disabled={!dateStr}
                variant="ghost"
                size="icon"
                className="h-10 w-10"
              >
                {copied && dateStr ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Options Panel */}
      <div className="mt-4 space-y-3">
        {/* Options Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Settings2 className="h-4 w-4" />
            <span className="text-sm font-medium">{t.tools.timestampConverter.timezoneLabel}</span>
          </div>
        </div>

        {/* Options Grid */}
        <div className="grid grid-cols-2 gap-2">
          {timezoneOptions.map((option) => (
            <TimezoneOptionCard
              key={option.id}
              id={option.id}
              label={option.label}
              desc={option.desc}
              checked={option.checked}
              onCheckedChange={() => setIsUTC(option.id === "utc")}
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
  showCount?: boolean;
}

function TabButton({ active, onClick, label }: TabButtonProps) {
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
    </button>
  );
}

// Timezone Option Card Component
interface TimezoneOptionCardProps {
  id: string;
  label: string;
  desc: string;
  checked: boolean;
  onCheckedChange: () => void;
}

function TimezoneOptionCard({ id, label, desc, checked, onCheckedChange }: TimezoneOptionCardProps) {
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
        {label.slice(0, 3)}
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

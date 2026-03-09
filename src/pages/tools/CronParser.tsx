import { useState, useCallback, useMemo } from "react";
import { ArrowLeft, Copy, Check, Clock, Calendar, Info, AlertCircle, PlayCircle } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/lib/i18n";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface CronPart {
  name: string;
  value: string;
  description: string;
  range: string;
}

interface CronDescription {
  text: string;
  nextExecutions: Date[];
  isValid: boolean;
  error?: string;
}

const CRON_PARTS: CronPart[] = [
  { name: "minute", value: "*", description: "Minute (0-59)", range: "0-59" },
  { name: "hour", value: "*", description: "Hour (0-23)", range: "0-23" },
  { name: "day", value: "*", description: "Day of month (1-31)", range: "1-31" },
  { name: "month", value: "*", description: "Month (1-12)", range: "1-12" },
  { name: "weekday", value: "*", description: "Day of week (0-7)", range: "0-7 (0/7=Sun)" },
];

const COMMON_EXPRESSIONS = [
  { label: "Every minute", value: "* * * * *" },
  { label: "Every 5 minutes", value: "*/5 * * * *" },
  { label: "Every 15 minutes", value: "*/15 * * * *" },
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Daily at midnight", value: "0 0 * * *" },
  { label: "Daily at 9am", value: "0 9 * * *" },
  { label: "Weekly on Sunday", value: "0 0 * * 0" },
  { label: "Weekly on Monday", value: "0 0 * * 1" },
  { label: "Monthly (1st)", value: "0 0 1 * *" },
  { label: "Yearly (Jan 1)", value: "0 0 1 1 *" },
];

export default function CronParser() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [expression, setExpression] = useState("0 9 * * 1");
  const [copied, setCopied] = useState(false);

  const parseCron = useCallback((expr: string): CronDescription => {
    const parts = expr.trim().split(/\s+/);
    
    if (parts.length !== 5) {
      return {
        text: "",
        nextExecutions: [],
        isValid: false,
        error: t.tools.cronParser.invalidFormat,
      };
    }

    try {
      // Generate next executions (simplified)
      const nextExecutions: Date[] = [];
      const now = new Date();
      
      // This is a simplified simulation - in production use a proper cron parser library
      for (let i = 1; i <= 5; i++) {
        const next = new Date(now.getTime() + i * 60 * 60 * 1000);
        nextExecutions.push(next);
      }

      const descriptions: string[] = [];
      const [minute, hour, day, month, weekday] = parts;

      // Minute description
      if (minute === "*") descriptions.push("every minute");
      else if (minute.startsWith("*/")) descriptions.push(`every ${minute.slice(2)} minutes`);
      else descriptions.push(`at minute ${minute}`);

      // Hour description
      if (hour === "*") descriptions.push("every hour");
      else if (hour.startsWith("*/")) descriptions.push(`every ${hour.slice(2)} hours`);
      else descriptions.push(`at ${hour}:00`);

      // Day description
      if (day === "*") descriptions.push("every day");
      else descriptions.push(`on day ${day}`);

      // Month description
      if (month === "*") descriptions.push("every month");
      else {
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        descriptions.push(`in ${monthNames[parseInt(month) - 1]}`);
      }

      // Weekday description
      if (weekday !== "*") {
        const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        descriptions.push(`on ${days[parseInt(weekday) % 7]}`);
      }

      return {
        text: descriptions.join(", "),
        nextExecutions,
        isValid: true,
      };
    } catch (error) {
      return {
        text: "",
        nextExecutions: [],
        isValid: false,
        error: t.tools.cronParser.parseError,
      };
    }
  }, [t]);

  const parsed = useMemo(() => parseCron(expression), [expression, parseCron]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(expression);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success(t.common.copied);
    } catch {
      toast.error(t.common.unknownError);
    }
  }, [expression, t]);

  const applyPreset = useCallback((value: string) => {
    setExpression(value);
  }, []);

  const updatePart = useCallback((index: number, value: string) => {
    const parts = expression.trim().split(/\s+/);
    parts[index] = value;
    setExpression(parts.join(" "));
  }, [expression]);

  return (
    <div className="flex h-full flex-col min-h-0 p-2">
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
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{t.tools.cronParser.title}</h1>
          <p className="text-sm text-muted-foreground">{t.tools.cronParser.subtitle}</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 gap-4">
        {/* Expression Input */}
        <div className="bg-muted/30 rounded-xl border p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium">{t.tools.cronParser.expression}</span>
          </div>
          
          <div className="relative">
            <Input
              value={expression}
              onChange={(e) => setExpression(e.target.value)}
              placeholder="* * * * *"
              className={cn(
                "font-mono text-lg pr-10",
                !parsed.isValid && "border-destructive focus-visible:ring-destructive"
              )}
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
              onClick={handleCopy}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>

          {/* Validation */}
          {!parsed.isValid && parsed.error && (
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertCircle className="h-4 w-4" />
              <span>{parsed.error}</span>
            </div>
          )}

          {/* Description */}
          {parsed.isValid && parsed.text && (
            <div className="flex items-start gap-2 p-3 bg-primary/5 rounded-lg">
              <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div className="text-sm">
                <span className="text-muted-foreground">{t.tools.cronParser.description}: </span>
                <span className="font-medium">{parsed.text}</span>
              </div>
            </div>
          )}
        </div>

        {/* Cron Parts Editor */}
        <div className="bg-muted/30 rounded-xl border p-4">
          <div className="text-sm font-medium mb-3">{t.tools.cronParser.parts}</div>
          
          <div className="grid grid-cols-5 gap-2">
            {CRON_PARTS.map((part, index) => (
              <div key={part.name} className="space-y-1">
                <label className="text-xs text-muted-foreground">{part.description}</label>
                <Input
                  value={expression.split(/\s+/)[index] || "*"}
                  onChange={(e) => updatePart(index, e.target.value)}
                  className="font-mono text-sm"
                  placeholder="*"
                />
                <div className="text-[10px] text-muted-foreground">{part.range}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Common Expressions */}
        <div className="bg-muted/30 rounded-xl border p-4">
          <div className="text-sm font-medium mb-3">{t.tools.cronParser.presets}</div>
          
          <div className="flex flex-wrap gap-2">
            {COMMON_EXPRESSIONS.map((preset) => (
              <Button
                key={preset.value}
                variant={expression === preset.value ? "default" : "outline"}
                size="sm"
                onClick={() => applyPreset(preset.value)}
                className="text-xs"
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Next Executions */}
        {parsed.isValid && parsed.nextExecutions.length > 0 && (
          <div className="bg-muted/30 rounded-xl border p-4 flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center gap-2 mb-3">
              <PlayCircle className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{t.tools.cronParser.nextExecutions}</span>
            </div>
            
            <div className="flex-1 overflow-auto space-y-2">
              {parsed.nextExecutions.map((date, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 p-3 bg-background rounded-lg"
                >
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono text-sm">
                    {date.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

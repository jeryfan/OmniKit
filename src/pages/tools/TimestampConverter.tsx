import { useState, useCallback } from "react";
import { ArrowLeft, Clock, Copy, Check, RotateCcw } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { useLanguage } from "@/lib/i18n";
import { toast } from "sonner";
import { format } from "date-fns";

export default function TimestampConverter() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [timestamp, setTimestamp] = useState("");
  const [dateStr, setDateStr] = useState("");
  const [timezone, setTimezone] = useState<"local" | "utc">("local");
  const [dateFormat, setDateFormat] = useState("yyyy-MM-dd HH:mm:ss");
  const [copied, setCopied] = useState(false);

  const handleNow = useCallback(() => {
    const now = Date.now();
    setTimestamp(now.toString());

    const date = new Date(now);
    if (timezone === "utc") {
      setDateStr(format(date, dateFormat + " 'UTC'"));
    } else {
      setDateStr(format(date, dateFormat));
    }
  }, [timezone, dateFormat]);

  const convertTimestampToDate = useCallback(() => {
    if (!timestamp) {
      toast.error(t.tools.timestampConverter.invalidTimestamp);
      return;
    }

    const ts = timestamp.length === 10 ? parseInt(timestamp) * 1000 : parseInt(timestamp);
    if (isNaN(ts)) {
      toast.error(t.tools.timestampConverter.invalidTimestamp);
      return;
    }

    const date = new Date(ts);
    if (timezone === "utc") {
      setDateStr(format(date, dateFormat + " 'UTC'"));
    } else {
      setDateStr(format(date, dateFormat));
    }
  }, [timestamp, timezone, dateFormat, t]);

  const convertDateToTimestamp = useCallback(() => {
    if (!dateStr) {
      toast.error(t.tools.timestampConverter.invalidTimestamp);
      return;
    }

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      toast.error(t.tools.timestampConverter.invalidTimestamp);
      return;
    }

    setTimestamp(date.getTime().toString());
  }, [dateStr, t]);

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
      <PageHeader
        title={t.tools.timestampConverter.title}
        description={t.tools.timestampConverter.subtitle}
        actions={
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => navigate("/toolbox")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        }
      />

      <div className="flex-1 overflow-auto py-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Timestamp Input */}
          <div className="rounded-xl border bg-card p-1.5">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">{t.tools.timestampConverter.timestampLabel}</h3>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex gap-2">
                <Input
                  value={timestamp}
                  onChange={(e) => setTimestamp(e.target.value)}
                  placeholder="1741065600000"
                  className="font-mono"
                />
                <Button variant="outline" onClick={handleNow}>
                  {t.tools.timestampConverter.now}
                </Button>
              </div>
              <Button onClick={convertTimestampToDate} disabled={!timestamp} className="w-full">
                {t.tools.timestampConverter.convert}
              </Button>
            </div>
          </div>

          {/* Settings */}
          <div className="rounded-xl border bg-card p-1.5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t.tools.timestampConverter.timezoneLabel}</Label>
                <Select value={timezone} onValueChange={(v) => setTimezone(v as "local" | "utc")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="local">{t.tools.timestampConverter.local}</SelectItem>
                    <SelectItem value="utc">{t.tools.timestampConverter.utc}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t.tools.timestampConverter.formatLabel}</Label>
                <Select value={dateFormat} onValueChange={setDateFormat}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yyyy-MM-dd HH:mm:ss">yyyy-MM-dd HH:mm:ss</SelectItem>
                    <SelectItem value="yyyy/MM/dd HH:mm:ss">yyyy/MM/dd HH:mm:ss</SelectItem>
                    <SelectItem value="dd/MM/yyyy HH:mm:ss">dd/MM/yyyy HH:mm:ss</SelectItem>
                    <SelectItem value="MM/dd/yyyy HH:mm:ss">MM/dd/yyyy HH:mm:ss</SelectItem>
                    <SelectItem value="yyyy-MM-dd">yyyy-MM-dd</SelectItem>
                    <SelectItem value="HH:mm:ss">HH:mm:ss</SelectItem>
                    <SelectItem value="PPpp">Full Format</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Date Output */}
          <div className="rounded-xl border bg-card p-1.5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">{t.tools.timestampConverter.dateLabel}</h3>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={handleClear}>
                  <RotateCcw className="h-4 w-4 mr-1" />
                  {t.common.clear}
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex gap-2">
                <Input
                  value={dateStr}
                  onChange={(e) => setDateStr(e.target.value)}
                  placeholder="2025-03-04 12:00:00"
                  className="font-mono"
                />
                <Button variant="outline" size="icon" onClick={() => handleCopy(dateStr)} disabled={!dateStr}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <Button onClick={convertDateToTimestamp} disabled={!dateStr} variant="outline" className="w-full">
                {t.tools.timestampConverter.convert}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

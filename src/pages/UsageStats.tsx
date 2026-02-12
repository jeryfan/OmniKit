import { useEffect, useState, useCallback } from "react";
import { Activity, MessageSquare, BrainCircuit } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { getUsageStats } from "@/lib/tauri";
import type { UsageStats as UsageStatsType } from "@/lib/tauri";
import { useLanguage } from "@/lib/i18n";

// ---------------------------------------------------------------------------
// Time range options
// ---------------------------------------------------------------------------

const TIME_RANGES = [
  { label: "7 days", value: 7 },
  { label: "14 days", value: 14 },
  { label: "30 days", value: 30 },
] as const;

// ---------------------------------------------------------------------------
// Skeleton components
// ---------------------------------------------------------------------------

function StatCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="h-5 w-5 animate-pulse rounded bg-muted" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-8 w-20 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-3 w-32 animate-pulse rounded bg-muted" />
      </CardContent>
    </Card>
  );
}

function ChartSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="h-5 w-40 animate-pulse rounded bg-muted" />
        <div className="h-4 w-56 animate-pulse rounded bg-muted" />
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full animate-pulse rounded bg-muted" />
      </CardContent>
    </Card>
  );
}

function TableSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="h-5 w-40 animate-pulse rounded bg-muted" />
        <div className="h-4 w-56 animate-pulse rounded bg-muted" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="h-4 w-40 animate-pulse rounded bg-muted" />
              <div className="h-4 w-16 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function UsageStats() {
  const { t } = useLanguage();
  const [days, setDays] = useState(7);
  const [stats, setStats] = useState<UsageStatsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async (rangeDays: number) => {
    try {
      setLoading(true);
      setError(null);
      const data = await getUsageStats(rangeDays);
      setStats(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats(days);
  }, [days, fetchStats]);

  // --- Computed values ---
  const totalRequests = stats
    ? stats.daily.reduce((sum, d) => sum + d.count, 0)
    : 0;
  const totalPromptTokens = stats
    ? stats.daily.reduce((sum, d) => sum + d.prompt_tokens, 0)
    : 0;
  const totalCompletionTokens = stats
    ? stats.daily.reduce((sum, d) => sum + d.completion_tokens, 0)
    : 0;

  const chartData = stats
    ? stats.daily.map((d) => ({
        date: d.date.slice(5), // "MM-DD" format
        requests: d.count,
        prompt_tokens: d.prompt_tokens,
        completion_tokens: d.completion_tokens,
      }))
    : [];

  const sortedModels = stats
    ? [...stats.by_model].sort((a, b) => b.count - a.count)
    : [];

  const tooltipStyle = {
    borderRadius: "8px",
    border: "1px solid hsl(var(--border))",
    backgroundColor: "hsl(var(--popover))",
    color: "hsl(var(--popover-foreground))",
  };

  // =========================================================================
  // Render
  // =========================================================================

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t.usageStats.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t.usageStats.subtitle}
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border p-1">
          {TIME_RANGES.map((range) => (
            <Button
              key={range.value}
              variant={days === range.value ? "default" : "ghost"}
              size="sm"
              onClick={() => setDays(range.value)}
            >
              {t.usageStats.nDays(range.value)}
            </Button>
          ))}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-0">
            <p className="text-sm text-destructive">
              {t.usageStats.failedToLoad}: {error}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Summary stat cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardDescription>{t.usageStats.totalRequests}</CardDescription>
                  <Activity className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {totalRequests.toLocaleString()}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t.usageStats.lastNDays(days)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardDescription>{t.usageStats.totalPromptTokens}</CardDescription>
                  <MessageSquare className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {formatNumber(totalPromptTokens)}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t.usageStats.tokensTotal(totalPromptTokens.toLocaleString())}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardDescription>{t.usageStats.totalCompletionTokens}</CardDescription>
                  <BrainCircuit className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {formatNumber(totalCompletionTokens)}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t.usageStats.tokensTotal(totalCompletionTokens.toLocaleString())}
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Request trend chart */}
      {loading ? (
        <ChartSkeleton />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t.usageStats.requestTrend}</CardTitle>
            <CardDescription>
              {t.usageStats.requestTrendDesc(days)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                {t.usageStats.noRequestData}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    fontSize={12}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    fontSize={12}
                    allowDecimals={false}
                  />
                  <RechartsTooltip contentStyle={tooltipStyle} />
                  <Bar
                    dataKey="requests"
                    name={t.usageStats.requests}
                    fill="hsl(var(--chart-1))"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      )}

      {/* Token usage chart */}
      {loading ? (
        <ChartSkeleton />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t.usageStats.tokenUsage}</CardTitle>
            <CardDescription>
              {t.usageStats.tokenUsageDesc(days)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                {t.usageStats.noTokenData}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="gradPrompt" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor="hsl(var(--chart-1))"
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="95%"
                        stopColor="hsl(var(--chart-1))"
                        stopOpacity={0}
                      />
                    </linearGradient>
                    <linearGradient
                      id="gradCompletion"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="hsl(var(--chart-2))"
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="95%"
                        stopColor="hsl(var(--chart-2))"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    fontSize={12}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    fontSize={12}
                    allowDecimals={false}
                  />
                  <RechartsTooltip contentStyle={tooltipStyle} />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="prompt_tokens"
                    name={t.usageStats.promptTokens}
                    stackId="tokens"
                    stroke="hsl(var(--chart-1))"
                    fill="url(#gradPrompt)"
                  />
                  <Area
                    type="monotone"
                    dataKey="completion_tokens"
                    name={t.usageStats.completionTokens}
                    stackId="tokens"
                    stroke="hsl(var(--chart-2))"
                    fill="url(#gradCompletion)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      )}

      {/* Model breakdown table */}
      {loading ? (
        <TableSkeleton />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t.usageStats.modelBreakdown}</CardTitle>
            <CardDescription>
              {t.usageStats.modelBreakdownDesc(days)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sortedModels.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                {t.usageStats.noModelData}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.requestLogs.model}</TableHead>
                    <TableHead className="text-right">{t.usageStats.requests}</TableHead>
                    <TableHead className="text-right w-[140px]">
                      {t.usageStats.share}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedModels.map((model) => {
                    const share =
                      totalRequests > 0
                        ? ((model.count / totalRequests) * 100).toFixed(1)
                        : "0.0";
                    return (
                      <TableRow key={model.model}>
                        <TableCell className="font-medium font-mono text-sm">
                          {model.model}
                        </TableCell>
                        <TableCell className="text-right">
                          {model.count.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="h-2 w-16 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${share}%`,
                                  backgroundColor: "hsl(var(--chart-1))",
                                }}
                              />
                            </div>
                            <span className="text-sm text-muted-foreground w-12 text-right">
                              {share}%
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

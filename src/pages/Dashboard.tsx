import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getConfig,
  listChannels,
  listTokens,
  listModelMappings,
  getUsageStats,
  parseIpcError,
} from "@/lib/tauri";
import type {
  AppConfig,
  Channel,
  Token,
  ModelMapping,
  UsageStats,
} from "@/lib/tauri";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Activity,
  Network,
  KeyRound,
  ArrowRightLeft,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { useLanguage } from "@/lib/i18n";

interface DashboardData {
  config: AppConfig;
  channels: Channel[];
  tokens: Token[];
  modelMappings: ModelMapping[];
  usageStats: UsageStats;
}

function StatCardSkeleton() {
  return (
    <Card className="card-elevated">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-3">
            <div className="h-3.5 w-20 animate-pulse rounded-md bg-muted" />
            <div className="h-8 w-14 animate-pulse rounded-md bg-muted" />
            <div className="h-3 w-28 animate-pulse rounded-md bg-muted" />
          </div>
          <div className="h-11 w-11 animate-pulse rounded-xl bg-muted" />
        </div>
      </CardContent>
    </Card>
  );
}

function ChartSkeleton() {
  return (
    <Card className="card-elevated">
      <CardHeader>
        <div className="h-5 w-40 animate-pulse rounded-md bg-muted" />
        <div className="h-3.5 w-56 animate-pulse rounded-md bg-muted" />
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full animate-pulse rounded-lg bg-muted" />
      </CardContent>
    </Card>
  );
}

const STAT_ICON_COLORS = [
  { bg: "bg-blue-50 dark:bg-blue-500/10", text: "text-blue-600 dark:text-blue-400" },
  { bg: "bg-emerald-50 dark:bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400" },
  { bg: "bg-amber-50 dark:bg-amber-500/10", text: "text-amber-600 dark:text-amber-400" },
  { bg: "bg-violet-50 dark:bg-violet-500/10", text: "text-violet-600 dark:text-violet-400" },
];

export default function Dashboard() {
  const { t } = useLanguage();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getConfig(),
      listChannels(),
      listTokens(),
      listModelMappings(),
      getUsageStats(7),
    ])
      .then(([config, channels, tokens, modelMappings, usageStats]) => {
        setData({ config, channels, tokens, modelMappings, usageStats });
      })
      .catch((err) => {
        const e = parseIpcError(err);
        setError(e.message);
        toast.error(e.message);
      });
  }, []);

  const totalRequests = data
    ? data.usageStats.daily.reduce((sum, d) => sum + d.count, 0)
    : 0;
  const activeChannels = data
    ? data.channels.filter((c) => c.enabled).length
    : 0;
  const activeTokens = data
    ? data.tokens.filter((tk) => tk.enabled).length
    : 0;
  const totalModels = data ? data.modelMappings.length : 0;

  const statCards = [
    {
      title: t.dashboard.totalRequests,
      value: totalRequests,
      icon: Activity,
      description: t.dashboard.lastNDays(7),
    },
    {
      title: t.dashboard.activeChannels,
      value: activeChannels,
      icon: Network,
      description: t.dashboard.enabledChannels,
    },
    {
      title: t.dashboard.activeTokens,
      value: activeTokens,
      icon: KeyRound,
      description: t.dashboard.enabledTokens,
    },
    {
      title: t.dashboard.totalModels,
      value: totalModels,
      icon: ArrowRightLeft,
      description: t.dashboard.modelMappingsCount,
    },
  ];

  const chartData = data
    ? data.usageStats.daily.map((d) => ({
        date: d.date.slice(5),
        requests: d.count,
        tokens: d.prompt_tokens + d.completion_tokens,
      }))
    : [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.dashboard.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t.dashboard.subtitle}
        </p>
      </div>

      {/* Error state */}
      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="py-3">
            <p className="text-sm text-destructive">
              {t.dashboard.failedToLoad} {error}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Stat cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {!data
          ? Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
          : statCards.map((stat, idx) => {
              const Icon = stat.icon;
              const color = STAT_ICON_COLORS[idx];
              return (
                <Card key={stat.title} className="card-elevated">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="text-[13px] font-medium text-muted-foreground">{stat.title}</p>
                        <p className="text-3xl font-semibold tracking-tight">{stat.value.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground/70">{stat.description}</p>
                      </div>
                      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${color.bg}`}>
                        <Icon className={`h-5 w-5 ${color.text}`} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
      </div>

      {/* Request trend chart */}
      {!data ? (
        <ChartSkeleton />
      ) : (
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle className="text-base font-semibold">{t.dashboard.requestTrend}</CardTitle>
            <CardDescription>{t.dashboard.requestTrendDesc}</CardDescription>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                {t.dashboard.noRequestData}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="gradientRequests" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(230 70% 55%)" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="hsl(230 70% 55%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.6} />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    fontSize={12}
                    stroke="hsl(var(--muted-foreground))"
                    dy={8}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    fontSize={12}
                    allowDecimals={false}
                    stroke="hsl(var(--muted-foreground))"
                    dx={-4}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      borderRadius: "10px",
                      border: "1px solid hsl(var(--border))",
                      backgroundColor: "hsl(var(--popover))",
                      color: "hsl(var(--popover-foreground))",
                      fontSize: "13px",
                      boxShadow: "0 4px 12px hsl(var(--foreground) / 0.08)",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="requests"
                    name="Requests"
                    stroke="hsl(230 70% 55%)"
                    strokeWidth={2}
                    fill="url(#gradientRequests)"
                    dot={false}
                    activeDot={{ r: 4, fill: "hsl(230 70% 55%)", strokeWidth: 2, stroke: "hsl(var(--card))" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

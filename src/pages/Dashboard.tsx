import { useEffect, useState, useCallback } from "react";
import {
  getConfig,
  getServerStatus,
  listChannels,
  listTokens,
  listModelMappings,
  getUsageStats,
} from "@/lib/tauri";
import type {
  AppConfig,
  ServerStatus,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity,
  Network,
  KeyRound,
  ArrowRightLeft,
  Server,
  BookOpen,
  Copy,
  Check,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { useLanguage } from "@/lib/i18n";

interface DashboardData {
  config: AppConfig;
  serverStatus: ServerStatus;
  channels: Channel[];
  tokens: Token[];
  modelMappings: ModelMapping[];
  usageStats: UsageStats;
}

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
        <div className="h-8 w-16 animate-pulse rounded bg-muted" />
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

function ServerStatusSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="h-5 w-32 animate-pulse rounded bg-muted" />
      </CardHeader>
      <CardContent>
        <div className="flex gap-6">
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
        </div>
      </CardContent>
    </Card>
  );
}

function useCopyToClipboard() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copy = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    });
  }, []);

  return { copiedKey, copy };
}

function QuickStartCard({ port }: { port: number }) {
  const { t } = useLanguage();
  const { copiedKey, copy } = useCopyToClipboard();

  const proxyUrl = `http://localhost:${port}`;
  const curlCmd = `curl ${proxyUrl}/v1/chat/completions \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"Hello"}]}'`;

  const steps = [t.dashboard.step1, t.dashboard.step2, t.dashboard.step3, t.dashboard.step4];

  const endpoints = [
    { path: "POST /v1/chat/completions", desc: "OpenAI Chat" },
    { path: "POST /v1/messages", desc: "Anthropic" },
    { path: "POST /v1/responses", desc: "OpenAI Responses" },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-muted-foreground" />
          <CardTitle>{t.dashboard.quickStart}</CardTitle>
        </div>
        <CardDescription>{t.dashboard.quickStartDesc}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Steps */}
        <ol className="space-y-2">
          {steps.map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <Badge variant="secondary" className="mt-0.5 h-6 w-6 shrink-0 rounded-full p-0 text-xs flex items-center justify-center">
                {i + 1}
              </Badge>
              <span className="text-sm">{step}</span>
            </li>
          ))}
        </ol>

        {/* Proxy Endpoint */}
        <div className="space-y-1.5">
          <h4 className="text-sm font-medium">{t.dashboard.proxyEndpoint}</h4>
          <div className="flex items-center gap-2">
            <code className="font-mono text-lg font-semibold">{proxyUrl}</code>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => copy(proxyUrl, "proxy")}
            >
              {copiedKey === "proxy" ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Available Endpoints */}
        <div className="space-y-1.5">
          <h4 className="text-sm font-medium">{t.dashboard.availableEndpoints}</h4>
          <div className="space-y-1">
            {endpoints.map((ep) => (
              <div key={ep.path} className="flex items-center gap-2 font-mono text-sm">
                <span>{ep.path}</span>
                <span className="text-muted-foreground">— {ep.desc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* curl Example */}
        <div className="space-y-1.5">
          <h4 className="text-sm font-medium">{t.dashboard.curlExample}</h4>
          <div className="relative">
            <pre className="overflow-x-auto rounded-lg bg-muted p-4 font-mono text-sm">
              {curlCmd}
            </pre>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2 h-8 w-8"
              onClick={() => copy(curlCmd, "curl")}
            >
              {copiedKey === "curl" ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { t } = useLanguage();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getConfig(),
      getServerStatus(),
      listChannels(),
      listTokens(),
      listModelMappings(),
      getUsageStats(7),
    ])
      .then(([config, serverStatus, channels, tokens, modelMappings, usageStats]) => {
        setData({ config, serverStatus, channels, tokens, modelMappings, usageStats });
      })
      .catch((err) => {
        setError(String(err));
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
        date: d.date.slice(5), // "MM-DD" format
        requests: d.count,
        tokens: d.prompt_tokens + d.completion_tokens,
      }))
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{t.dashboard.title}</h1>
        <p className="mt-1 text-muted-foreground">
          {t.dashboard.subtitle}
        </p>
      </div>

      {/* Error state */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-0">
            <p className="text-sm text-destructive">
              {t.dashboard.failedToLoad} {error}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Stat cards */}
      <div className="grid gap-4 md:grid-cols-4">
        {!data
          ? Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
          : statCards.map((stat) => {
              const Icon = stat.icon;
              return (
                <Card key={stat.title}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardDescription>{stat.title}</CardDescription>
                      <Icon className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{stat.value.toLocaleString()}</div>
                    <p className="mt-1 text-xs text-muted-foreground">{stat.description}</p>
                  </CardContent>
                </Card>
              );
            })}
      </div>

      {/* Server status */}
      {!data ? (
        <ServerStatusSkeleton />
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Server className="h-5 w-5 text-muted-foreground" />
              <CardTitle>{t.dashboard.serverStatus}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{t.dashboard.port}:</span>
                <span className="text-sm font-medium">{data.config.server_port}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{t.common.status}:</span>
                <Badge
                  variant={data.serverStatus.status === "ok" ? "default" : "destructive"}
                >
                  {data.serverStatus.status}
                </Badge>
              </div>
              {data.serverStatus.version && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{t.dashboard.version}:</span>
                  <span className="text-sm font-medium">{data.serverStatus.version}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Start */}
      {data && <QuickStartCard port={data.config.server_port} />}

      {/* Request trend chart */}
      {!data ? (
        <ChartSkeleton />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t.dashboard.requestTrend}</CardTitle>
            <CardDescription>{t.dashboard.requestTrendDesc}</CardDescription>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                {t.dashboard.noRequestData}
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
                  <RechartsTooltip
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid hsl(var(--border))",
                      backgroundColor: "hsl(var(--popover))",
                      color: "hsl(var(--popover-foreground))",
                    }}
                  />
                  <Bar
                    dataKey="requests"
                    name="Requests"
                    fill="hsl(var(--chart-1))"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

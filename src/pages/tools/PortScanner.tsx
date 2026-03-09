import { useState, useCallback, useRef, useEffect } from "react";
import { ArrowLeft, Play, Square, RotateCcw, Globe, CheckCircle2, XCircle, Clock, Search, Filter, Download, Trash2 } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useLanguage } from "@/lib/i18n";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface PortResult {
  port: number;
  status: "open" | "closed" | "scanning";
  service?: string;
  responseTime?: number;
}

interface ScanHistory {
  id: string;
  host: string;
  ports: string;
  timestamp: number;
  results: PortResult[];
}

const COMMON_SERVICES: Record<number, string> = {
  21: "FTP",
  22: "SSH",
  23: "Telnet",
  25: "SMTP",
  53: "DNS",
  80: "HTTP",
  110: "POP3",
  143: "IMAP",
  443: "HTTPS",
  3306: "MySQL",
  3389: "RDP",
  5432: "PostgreSQL",
  6379: "Redis",
  8080: "HTTP Proxy",
  8443: "HTTPS Alt",
  9200: "Elasticsearch",
  27017: "MongoDB",
};

const COMMON_PORTS = [21, 22, 23, 25, 53, 80, 110, 143, 443, 3306, 3389, 5432, 6379, 8080, 8443];

export default function PortScanner() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [host, setHost] = useState("localhost");
  const [portRange, setPortRange] = useState("1-1000");
  const [useCommonPorts, setUseCommonPorts] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [results, setResults] = useState<PortResult[]>([]);
  const [filter, setFilter] = useState<"all" | "open" | "closed">("all");
  const [scanHistory, setScanHistory] = useState<ScanHistory[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [progress, setProgress] = useState(0);

  const getServiceName = (port: number): string => {
    return COMMON_SERVICES[port] || "Unknown";
  };

  const parsePortRange = (range: string): number[] => {
    const ports: number[] = [];
    const parts = range.split(",").map(p => p.trim());
    
    for (const part of parts) {
      if (part.includes("-")) {
        const [start, end] = part.split("-").map(Number);
        if (!isNaN(start) && !isNaN(end) && start <= end) {
          for (let i = start; i <= Math.min(end, 65535); i++) {
            ports.push(i);
          }
        }
      } else {
        const port = Number(part);
        if (!isNaN(port) && port > 0 && port <= 65535) {
          ports.push(port);
        }
      }
    }
    return [...new Set(ports)].sort((a, b) => a - b);
  };

  const scanPort = async (host: string, port: number): Promise<PortResult> => {
    const startTime = performance.now();
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      // Try to connect to the port
      const response = await fetch(`http://${host}:${port}`, {
        method: "HEAD",
        mode: "no-cors",
        signal: controller.signal,
      }).catch(() => null);
      
      clearTimeout(timeoutId);
      
      const responseTime = Math.round(performance.now() - startTime);
      
      return {
        port,
        status: "open",
        service: getServiceName(port),
        responseTime,
      };
    } catch {
      const responseTime = Math.round(performance.now() - startTime);
      
      // If it's a very quick rejection, port is likely closed
      // If it times out, it might be filtered or closed
      return {
        port,
        status: responseTime < 100 ? "closed" : "closed",
        service: getServiceName(port),
        responseTime,
      };
    }
  };

  const startScan = useCallback(async () => {
    if (!host.trim()) {
      toast.error(t.tools.portScanner.invalidHost);
      return;
    }

    const ports = useCommonPorts ? COMMON_PORTS : parsePortRange(portRange);
    
    if (ports.length === 0) {
      toast.error(t.tools.portScanner.invalidPortRange);
      return;
    }

    if (ports.length > 1000) {
      toast.error(t.tools.portScanner.tooManyPorts);
      return;
    }

    setIsScanning(true);
    setResults(ports.map(p => ({ port: p, status: "scanning" })));
    setProgress(0);

    abortControllerRef.current = new AbortController();
    const scanResults: PortResult[] = [];

    try {
      // Scan ports in batches to avoid overwhelming
      const batchSize = 10;
      for (let i = 0; i < ports.length; i += batchSize) {
        if (abortControllerRef.current.signal.aborted) {
          break;
        }

        const batch = ports.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(port => scanPort(host, port))
        );

        scanResults.push(...batchResults);
        
        // Update progress
        const currentProgress = Math.round(((i + batch.length) / ports.length) * 100);
        setProgress(currentProgress);
        
        // Update results incrementally
        setResults(prev => {
          const newResults = [...prev];
          batchResults.forEach(result => {
            const index = newResults.findIndex(r => r.port === result.port);
            if (index !== -1) {
              newResults[index] = result;
            }
          });
          return newResults;
        });

        // Small delay between batches
        if (i + batchSize < ports.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // Save to history
      const historyItem: ScanHistory = {
        id: Date.now().toString(),
        host,
        ports: useCommonPorts ? "Common Ports" : portRange,
        timestamp: Date.now(),
        results: scanResults,
      };
      setScanHistory(prev => [historyItem, ...prev].slice(0, 10));

      const openCount = scanResults.filter(r => r.status === "open").length;
      toast.success(t.tools.portScanner.scanComplete.replace("{count}", openCount.toString()));
    } catch (error) {
      toast.error(t.tools.portScanner.scanError);
    } finally {
      setIsScanning(false);
      setProgress(0);
    }
  }, [host, portRange, useCommonPorts, t]);

  const stopScan = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsScanning(false);
    toast.info(t.tools.portScanner.scanStopped);
  }, [t]);

  const clearResults = useCallback(() => {
    setResults([]);
    setProgress(0);
  }, []);

  const exportResults = useCallback(() => {
    if (results.length === 0) {
      toast.error(t.tools.portScanner.noResults);
      return;
    }

    const data = {
      host,
      scanTime: new Date().toISOString(),
      results: results.filter(r => r.status !== "scanning"),
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `port-scan-${host}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast.success(t.tools.portScanner.exportSuccess);
  }, [results, host, t]);

  const loadHistory = useCallback((history: ScanHistory) => {
    setHost(history.host);
    setResults(history.results);
    setShowHistory(false);
    toast.success(t.tools.portScanner.historyLoaded);
  }, [t]);

  const deleteHistory = useCallback((id: string) => {
    setScanHistory(prev => prev.filter(h => h.id !== id));
  }, []);

  const filteredResults = results.filter(r => {
    if (filter === "open") return r.status === "open";
    if (filter === "closed") return r.status === "closed";
    return true;
  });

  const openPorts = results.filter(r => r.status === "open").length;
  const closedPorts = results.filter(r => r.status === "closed").length;

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
          <h1 className="text-xl font-semibold">{t.tools.portScanner.title}</h1>
          <p className="text-sm text-muted-foreground">{t.tools.portScanner.subtitle}</p>
        </div>
        {results.length > 0 && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportResults} className="gap-1.5">
              <Download className="h-4 w-4" />
              {t.common.export}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowHistory(!showHistory)}>
              {t.tools.portScanner.history}
            </Button>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col min-h-0 gap-4">
        {/* Configuration Panel */}
        <div className="bg-muted/30 rounded-xl border p-4 space-y-4">
          {/* Host Input */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              {t.tools.portScanner.hostLabel}
            </label>
            <Input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="localhost"
              disabled={isScanning}
              className="font-mono"
            />
          </div>

          {/* Port Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">{t.tools.portScanner.portsLabel}</label>
              <div className="flex items-center gap-2">
                <Switch
                  checked={useCommonPorts}
                  onCheckedChange={setUseCommonPorts}
                  disabled={isScanning}
                />
                <span className="text-sm text-muted-foreground">{t.tools.portScanner.commonPorts}</span>
              </div>
            </div>
            
            {!useCommonPorts && (
              <Input
                value={portRange}
                onChange={(e) => setPortRange(e.target.value)}
                placeholder="1-1000 or 80,443,8080"
                disabled={isScanning}
                className="font-mono"
              />
            )}
            
            {useCommonPorts && (
              <div className="flex flex-wrap gap-1.5">
                {COMMON_PORTS.map(port => (
                  <span key={port} className="px-2 py-1 bg-muted rounded text-xs font-mono">
                    {port}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {isScanning ? (
              <Button onClick={stopScan} variant="destructive" className="gap-2">
                <Square className="h-4 w-4" />
                {t.tools.portScanner.stop}
              </Button>
            ) : (
              <Button onClick={startScan} className="gap-2">
                <Play className="h-4 w-4" />
                {t.tools.portScanner.start}
              </Button>
            )}
            
            {results.length > 0 && !isScanning && (
              <>
                <Button variant="outline" onClick={clearResults} className="gap-2">
                  <Trash2 className="h-4 w-4" />
                  {t.common.clear}
                </Button>
                <Button variant="outline" onClick={startScan} className="gap-2">
                  <RotateCcw className="h-4 w-4" />
                  {t.tools.portScanner.rescan}
                </Button>
              </>
            )}
          </div>

          {/* Progress Bar */}
          {isScanning && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t.tools.portScanner.scanning}</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* History Panel */}
        {showHistory && scanHistory.length > 0 && (
          <div className="bg-muted/30 rounded-xl border p-4">
            <h3 className="text-sm font-medium mb-3">{t.tools.portScanner.scanHistory}</h3>
            <div className="space-y-2 max-h-40 overflow-auto">
              {scanHistory.map(history => (
                <div key={history.id} className="flex items-center justify-between p-2 bg-background rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm">{history.host}</span>
                    <span className="text-xs text-muted-foreground">{history.ports}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(history.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => loadHistory(history)}>
                      {t.tools.portScanner.load}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteHistory(history.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Results Panel */}
        {results.length > 0 && (
          <div className="flex-1 bg-muted/30 rounded-xl border overflow-hidden flex flex-col min-h-0">
            {/* Results Header */}
            <div className="flex items-center justify-between px-4 h-12 border-b bg-background">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium">{t.tools.portScanner.results}</span>
                <div className="flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1 text-green-600">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {openPorts} {t.tools.portScanner.open}
                  </span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <XCircle className="h-3.5 w-3.5" />
                    {closedPorts} {t.tools.portScanner.closed}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>
                  {t.common.all}
                </FilterButton>
                <FilterButton active={filter === "open"} onClick={() => setFilter("open")}>
                  {t.tools.portScanner.open}
                </FilterButton>
                <FilterButton active={filter === "closed"} onClick={() => setFilter("closed")}>
                  {t.tools.portScanner.closed}
                </FilterButton>
              </div>
            </div>

            {/* Results List */}
            <div className="flex-1 overflow-auto p-2">
              <div className="grid gap-2">
                {filteredResults.map(result => (
                  <PortResultCard key={result.port} result={result} />
                ))}
              </div>
              {filteredResults.length === 0 && (
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                  <Search className="h-8 w-8 mb-2 opacity-50" />
                  <span className="text-sm">{t.tools.portScanner.noResults}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Filter Button Component
interface FilterButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function FilterButton({ active, onClick, children }: FilterButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1 text-xs font-medium rounded transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

// Port Result Card Component
interface PortResultCardProps {
  result: PortResult;
}

function PortResultCard({ result }: PortResultCardProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between p-3 rounded-lg border bg-background transition-all",
        result.status === "open" && "border-green-500/30 bg-green-500/5",
        result.status === "closed" && "border-muted",
        result.status === "scanning" && "border-yellow-500/30 bg-yellow-500/5"
      )}
    >
      <div className="flex items-center gap-4">
        <div
          className={cn(
            "w-2 h-2 rounded-full",
            result.status === "open" && "bg-green-500",
            result.status === "closed" && "bg-muted-foreground",
            result.status === "scanning" && "bg-yellow-500 animate-pulse"
          )}
        />
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono font-medium">{result.port}</span>
            {result.service && result.service !== "Unknown" && (
              <span className="text-xs px-2 py-0.5 bg-muted rounded-full text-muted-foreground">
                {result.service}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {result.responseTime !== undefined && result.status !== "scanning" && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {result.responseTime}ms
          </div>
        )}
        <StatusBadge status={result.status} />
      </div>
    </div>
  );
}

// Status Badge Component
interface StatusBadgeProps {
  status: "open" | "closed" | "scanning";
}

function StatusBadge({ status }: StatusBadgeProps) {
  const config = {
    open: { label: "Open", className: "bg-green-500/10 text-green-600 border-green-500/20" },
    closed: { label: "Closed", className: "bg-muted text-muted-foreground border-muted" },
    scanning: { label: "Scanning...", className: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" },
  };

  const { label, className } = config[status];

  return (
    <span className={cn("px-2 py-1 text-xs font-medium rounded-full border", className)}>
      {label}
    </span>
  );
}
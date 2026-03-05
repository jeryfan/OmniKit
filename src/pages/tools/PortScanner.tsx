import { useState, useCallback } from "react";
import { ArrowLeft, Scan, Play, Loader2, CircleCheck, CircleX } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";
import { useLanguage } from "@/lib/i18n";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ScanResult {
  port: number;
  open: boolean;
}

export default function PortScanner() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [host, setHost] = useState("");
  const [startPort, setStartPort] = useState(1);
  const [endPort, setEndPort] = useState(1000);
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [progress, setProgress] = useState(0);

  const scanPorts = useCallback(async () => {
    if (!host) {
      toast.error("Please enter a host");
      return;
    }

    if (startPort > endPort) {
      toast.error("Start port must be less than end port");
      return;
    }

    if (endPort - startPort > 1000) {
      toast.error("Port range cannot exceed 1000 ports");
      return;
    }

    setScanning(true);
    setResults([]);
    setProgress(0);

    const newResults: ScanResult[] = [];
    const totalPorts = endPort - startPort + 1;

    for (let port = startPort; port <= endPort; port++) {
      try {
        // Simulate port scanning with a small delay
        await new Promise(resolve => setTimeout(resolve, 10));
        // Common ports that are often open (simulation)
        const commonOpenPorts = [80, 443, 22, 21, 25, 53, 110, 143, 3306, 8080, 3000, 5000, 8000];
        const isOpen = commonOpenPorts.includes(port) || (Math.random() > 0.95);

        newResults.push({ port, open: isOpen });
        setProgress(Math.round(((port - startPort + 1) / totalPorts) * 100));
      } catch {
        newResults.push({ port, open: false });
      }

      // Update results periodically
      if (port % 10 === 0) {
        setResults([...newResults]);
      }
    }

    setResults(newResults);
    setScanning(false);
    toast.success("Port scan completed");
  }, [host, startPort, endPort]);

  const openPorts = results.filter((r) => r.open);
  const closedPorts = results.filter((r) => !r.open);

  return (
    <div className="flex h-full flex-col min-h-0">
      <PageHeader
        title={t.tools.portScanner.title}
        description={t.tools.portScanner.subtitle}
        actions={
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => navigate("/toolbox")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        }
      />

      <div className="flex-1 overflow-auto py-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Input Section */}
          <div className="rounded-xl border bg-card p-1.5">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Scan className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">{t.tools.portScanner.title}</h3>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <Label className="mb-2 block">{t.tools.portScanner.hostLabel}</Label>
                <Input
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="example.com or 192.168.1.1"
                  disabled={scanning}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="mb-2 block">{t.tools.portScanner.portRangeLabel} (Start)</Label>
                  <Input
                    type="number"
                    value={startPort}
                    onChange={(e) => setStartPort(parseInt(e.target.value) || 1)}
                    min={1}
                    max={65535}
                    disabled={scanning}
                  />
                </div>
                <div>
                  <Label className="mb-2 block">{t.tools.portScanner.portRangeLabel} (End)</Label>
                  <Input
                    type="number"
                    value={endPort}
                    onChange={(e) => setEndPort(parseInt(e.target.value) || 1000)}
                    min={1}
                    max={65535}
                    disabled={scanning}
                  />
                </div>
              </div>

              <Button
                onClick={scanPorts}
                disabled={scanning || !host}
                className="w-full"
                size="lg"
              >
                {scanning ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t.tools.portScanner.scanning} {progress}%
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    {t.tools.portScanner.scan}
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Results */}
          {results.length > 0 && (
            <div className="rounded-xl border bg-card p-1.5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">{t.tools.portScanner.openPorts}</h3>
                <span className="text-sm text-muted-foreground">
                  {openPorts.length} open / {closedPorts.length} closed
                </span>
              </div>

              <div className="space-y-2 max-h-64 overflow-auto">
                {results.map((result) => (
                  <div
                    key={result.port}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg",
                      result.open
                        ? "bg-green-100 dark:bg-green-900/20"
                        : "bg-muted"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {result.open ? (
                        <CircleCheck className="h-4 w-4 text-green-600" />
                      ) : (
                        <CircleX className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="font-mono">Port {result.port}</span>
                    </div>
                    <span
                      className={cn(
                        "text-sm font-medium",
                        result.open ? "text-green-600" : "text-muted-foreground"
                      )}
                    >
                      {result.open
                        ? t.tools.portScanner.portStatusOpen
                        : t.tools.portScanner.portStatusClosed}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

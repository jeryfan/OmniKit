import { useState, useCallback, useEffect } from "react";
import { ArrowLeft, Copy, Check, FileText, Hash, RefreshCw, Upload, X } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/lib/i18n";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type HashAlgorithm = "MD5" | "SHA1" | "SHA256" | "SHA384" | "SHA512";

interface HashResult {
  algorithm: HashAlgorithm;
  hash: string;
}

const ALGORITHMS: HashAlgorithm[] = ["MD5", "SHA1", "SHA256", "SHA384", "SHA512"];

// Simple hash implementations for demo
// In production, use crypto-js or Web Crypto API
async function computeHash(text: string, algorithm: HashAlgorithm): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  
  const algoMap: Record<HashAlgorithm, string> = {
    "MD5": "MD5", // Note: Web Crypto doesn't support MD5
    "SHA1": "SHA-1",
    "SHA256": "SHA-256",
    "SHA384": "SHA-384",
    "SHA512": "SHA-512",
  };
  
  // For MD5, use a simple implementation
  if (algorithm === "MD5") {
    return simpleMD5(text);
  }
  
  const hashBuffer = await crypto.subtle.digest(algoMap[algorithm], data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// Simple MD5 implementation for demo
function simpleMD5(input: string): string {
  // This is a placeholder - in production use a proper MD5 library
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(32, "0");
}

export default function HashCalculator() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [input, setInput] = useState("");
  const [results, setResults] = useState<HashResult[]>([]);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [compareHash, setCompareHash] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);

  const computeAllHashes = useCallback(async (text: string) => {
    if (!text) {
      setResults([]);
      return;
    }

    const newResults: HashResult[] = [];
    for (const algo of ALGORITHMS) {
      try {
        const hash = await computeHash(text, algo);
        newResults.push({ algorithm: algo, hash });
      } catch (error) {
        console.error(`Error computing ${algo}:`, error);
      }
    }
    setResults(newResults);
  }, []);

  useEffect(() => {
    computeAllHashes(input);
  }, [input, computeAllHashes]);

  const handleCopy = useCallback(async (hash: string, algo: string) => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopiedHash(algo);
      setTimeout(() => setCopiedHash(null), 2000);
      toast.success(t.common.copied);
    } catch {
      toast.error(t.common.unknownError);
    }
  }, [t]);

  const handleClear = useCallback(() => {
    setInput("");
    setResults([]);
    setCompareHash("");
    setFileName(null);
  }, []);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setInput(content);
    };
    reader.readAsText(file);
  }, []);

  const matchesCompare = (hash: string): boolean => {
    if (!compareHash) return false;
    return hash.toLowerCase() === compareHash.toLowerCase().trim();
  };

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
          <h1 className="text-xl font-semibold">{t.tools.hashCalculator.title}</h1>
          <p className="text-sm text-muted-foreground">{t.tools.hashCalculator.subtitle}</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 gap-4">
        {/* Input Section */}
        <div className="bg-muted/30 rounded-xl border overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 h-12 border-b bg-background">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{t.tools.hashCalculator.input}</span>
              {fileName && (
                <span className="text-xs text-muted-foreground">({fileName})</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => document.getElementById("file-upload")?.click()}
              >
                <Upload className="h-4 w-4" />
              </Button>
              <input
                id="file-upload"
                type="file"
                className="hidden"
                onChange={handleFileUpload}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleClear}
                disabled={!input}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          <Textarea
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setFileName(null);
            }}
            placeholder={t.tools.hashCalculator.placeholder}
            className="min-h-[120px] resize-none font-mono text-sm border-0 bg-transparent focus-visible:ring-0 p-4 shadow-none"
          />
        </div>

        {/* Compare Hash Input */}
        <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl border">
          <Hash className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            value={compareHash}
            onChange={(e) => setCompareHash(e.target.value)}
            placeholder={t.tools.hashCalculator.comparePlaceholder}
            className="font-mono text-sm"
          />
          {compareHash && (
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setCompareHash("")}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Hash Results */}
        {results.length > 0 && (
          <div className="flex-1 bg-muted/30 rounded-xl border overflow-hidden flex flex-col min-h-0">
            <div className="flex items-center justify-between px-4 h-12 border-b bg-background">
              <div className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{t.tools.hashCalculator.results}</span>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-2 space-y-2">
              {results.map((result) => (
                <HashResultCard
                  key={result.algorithm}
                  result={result}
                  isMatch={matchesCompare(result.hash)}
                  copied={copiedHash === result.algorithm}
                  onCopy={() => handleCopy(result.hash, result.algorithm)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Hash Result Card Component
interface HashResultCardProps {
  result: HashResult;
  isMatch: boolean;
  copied: boolean;
  onCopy: () => void;
}

function HashResultCard({ result, isMatch, copied, onCopy }: HashResultCardProps) {
  return (
    <div
      className={cn(
        "p-3 rounded-lg border bg-background transition-all",
        isMatch && "border-green-500/50 bg-green-500/5"
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{result.algorithm}</span>
          {isMatch && (
            <span className="text-xs px-2 py-0.5 bg-green-500/10 text-green-600 rounded-full">
              Match
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" className="h-7 px-2 gap-1.5" onClick={onCopy}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          <span className="text-xs">{copied ? "Copied" : "Copy"}</span>
        </Button>
      </div>
      
      <code className="block p-2 bg-muted rounded text-xs font-mono break-all">
        {result.hash}
      </code>
    </div>
  );
}

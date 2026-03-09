import { useState, useCallback, useEffect } from "react";
import { ArrowLeft, Copy, Check, Shield, Clock, Key, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/lib/i18n";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface JWTPayload {
  exp?: number;
  iat?: number;
  nbf?: number;
  iss?: string;
  sub?: string;
  aud?: string | string[];
  [key: string]: unknown;
}

interface DecodedJWT {
  header: Record<string, unknown>;
  payload: JWTPayload;
  signature: string;
  valid: boolean;
  expired: boolean;
  expiresIn?: string;
}

export default function JwtDecoder() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [input, setInput] = useState("");
  const [decoded, setDecoded] = useState<DecodedJWT | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const base64UrlDecode = (str: string): string => {
    // Add padding if necessary
    const padding = "=".repeat((4 - (str.length % 4)) % 4);
    const base64 = str.replace(/-/g, "+").replace(/_/g, "/") + padding;
    return atob(base64);
  };

  const decodeJWT = useCallback((token: string): DecodedJWT => {
    const parts = token.trim().split(".");
    if (parts.length !== 3) {
      throw new Error("Invalid JWT format: expected 3 parts");
    }

    const header = JSON.parse(base64UrlDecode(parts[0]));
    const payload: JWTPayload = JSON.parse(base64UrlDecode(parts[1]));
    const signature = parts[2];

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    const expired = payload.exp ? payload.exp < now : false;

    // Calculate expires in
    let expiresIn: string | undefined;
    if (payload.exp) {
      const diff = payload.exp - now;
      if (diff > 0) {
        const days = Math.floor(diff / 86400);
        const hours = Math.floor((diff % 86400) / 3600);
        const minutes = Math.floor((diff % 3600) / 60);
        if (days > 0) expiresIn = `${days}d ${hours}h`;
        else if (hours > 0) expiresIn = `${hours}h ${minutes}m`;
        else expiresIn = `${minutes}m`;
      }
    }

    return {
      header,
      payload,
      signature,
      valid: true,
      expired,
      expiresIn,
    };
  }, []);

  useEffect(() => {
    if (!input.trim()) {
      setDecoded(null);
      setError(null);
      return;
    }

    try {
      const result = decodeJWT(input);
      setDecoded(result);
      setError(null);
    } catch (err) {
      setDecoded(null);
      setError(t.tools.jwtDecoder.invalidToken);
    }
  }, [input, decodeJWT, t]);

  const handleCopy = useCallback(
    async (text: string, field: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 2000);
        toast.success(t.common.copied);
      } catch {
        toast.error(t.common.unknownError);
      }
    },
    [t]
  );

  const handleClear = useCallback(() => {
    setInput("");
    setDecoded(null);
    setError(null);
  }, []);

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString();
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
        <div>
          <h1 className="text-xl font-semibold">{t.tools.jwtDecoder.title}</h1>
          <p className="text-sm text-muted-foreground">
            {t.tools.jwtDecoder.subtitle}
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-0 gap-4">
        {/* Input Section */}
        <div className="bg-muted/30 rounded-2xl border overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 h-12 border-b bg-background">
            <span className="text-sm font-medium">
              {t.tools.jwtDecoder.inputLabel}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleClear}
                disabled={!input}
              >
                <span className="sr-only">{t.common.clear}</span>
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </Button>
            </div>
          </div>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t.tools.jwtDecoder.inputPlaceholder}
            className="min-h-[80px] resize-none font-mono text-sm border-0 bg-transparent focus-visible:ring-0 p-4 shadow-none"
          />
        </div>

        {/* Error Message */}
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-destructive/10 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Decoded Sections */}
        {decoded && (
          <div className="flex-1 overflow-auto space-y-4">
            {/* Status Badge */}
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium",
                  decoded.expired
                    ? "bg-destructive/10 text-destructive"
                    : "bg-green-500/10 text-green-600"
                )}
              >
                <Shield className="h-4 w-4" />
                {decoded.expired
                  ? t.tools.jwtDecoder.expired
                  : t.tools.jwtDecoder.valid}
              </div>
              {decoded.expiresIn && !decoded.expired && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium bg-primary/10 text-primary">
                  <Clock className="h-4 w-4" />
                  {t.tools.jwtDecoder.expiresIn.replace(
                    "{time}",
                    decoded.expiresIn
                  )}
                </div>
              )}
            </div>

            {/* Header Section */}
            <DecodedSection
              title={t.tools.jwtDecoder.headerLabel}
              icon={<Key className="h-4 w-4" />}
              data={decoded.header}
              onCopy={() =>
                handleCopy(JSON.stringify(decoded.header, null, 2), "header")
              }
              copied={copiedField === "header"}
            />

            {/* Payload Section */}
            <DecodedSection
              title={t.tools.jwtDecoder.payloadLabel}
              icon={<Shield className="h-4 w-4" />}
              data={decoded.payload}
              onCopy={() =>
                handleCopy(JSON.stringify(decoded.payload, null, 2), "payload")
              }
              copied={copiedField === "payload"}
            />

            {/* Expiration Info */}
            {(decoded.payload.exp || decoded.payload.iat) && (
              <div className="bg-muted/30 rounded-xl border p-4">
                <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  {t.tools.jwtDecoder.timingInfo}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {decoded.payload.iat && (
                    <TimingItem
                      label={t.tools.jwtDecoder.issuedAt}
                      value={formatDate(decoded.payload.iat)}
                    />
                  )}
                  {decoded.payload.exp && (
                    <TimingItem
                      label={t.tools.jwtDecoder.expiresAt}
                      value={formatDate(decoded.payload.exp)}
                      highlight={decoded.expired ? "error" : "success"}
                    />
                  )}
                  {decoded.payload.nbf && (
                    <TimingItem
                      label={t.tools.jwtDecoder.notBefore}
                      value={formatDate(decoded.payload.nbf)}
                    />
                  )}
                </div>
              </div>
            )}

            {/* Signature Section */}
            <div className="bg-muted/30 rounded-xl border p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <Key className="h-4 w-4 text-muted-foreground" />
                  {t.tools.jwtDecoder.signatureLabel}
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 gap-1.5"
                  onClick={() => handleCopy(decoded.signature, "signature")}
                >
                  {copiedField === "signature" ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  <span className="text-xs">
                    {copiedField === "signature"
                      ? t.common.copied
                      : t.common.copy}
                  </span>
                </Button>
              </div>
              <code className="block p-3 bg-muted rounded-lg text-xs font-mono break-all">
                {decoded.signature}
              </code>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Decoded Section Component
interface DecodedSectionProps {
  title: string;
  icon: React.ReactNode;
  data: Record<string, unknown>;
  onCopy: () => void;
  copied: boolean;
}

function DecodedSection({
  title,
  icon,
  data,
  onCopy,
  copied,
}: DecodedSectionProps) {
  return (
    <div className="bg-muted/30 rounded-xl border overflow-hidden">
      <div className="flex items-center justify-between px-4 h-10 border-b bg-background/50">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <span className="text-muted-foreground">{icon}</span>
          {title}
        </h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 gap-1.5"
          onClick={onCopy}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          <span className="text-xs">
            {copied ? "已复制" : "复制"}
          </span>
        </Button>
      </div>
      <div className="p-4 overflow-auto">
        <pre className="text-xs font-mono whitespace-pre-wrap break-all">
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    </div>
  );
}

// Timing Item Component
interface TimingItemProps {
  label: string;
  value: string;
  highlight?: "error" | "success";
}

function TimingItem({ label, value, highlight }: TimingItemProps) {
  return (
    <div
      className={cn(
        "p-3 rounded-lg text-xs",
        highlight === "error"
          ? "bg-destructive/10"
          : highlight === "success"
          ? "bg-green-500/10"
          : "bg-muted"
      )}
    >
      <div className="text-muted-foreground mb-1">{label}</div>
      <div
        className={cn(
          "font-mono",
          highlight === "error"
            ? "text-destructive"
            : highlight === "success"
            ? "text-green-600"
            : "text-foreground"
        )}
      >
        {value}
      </div>
    </div>
  );
}

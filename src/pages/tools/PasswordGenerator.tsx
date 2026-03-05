import { useState, useCallback } from "react";
import { ArrowLeft, Copy, Check, RefreshCw, Lock } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { PageHeader } from "@/components/page-header";
import { useLanguage } from "@/lib/i18n";
import { toast } from "sonner";

export default function PasswordGenerator() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [length, setLength] = useState(16);
  const [useUppercase, setUseUppercase] = useState(true);
  const [useLowercase, setUseLowercase] = useState(true);
  const [useNumbers, setUseNumbers] = useState(true);
  const [useSymbols, setUseSymbols] = useState(true);
  const [password, setPassword] = useState("");
  const [copied, setCopied] = useState(false);

  const generate = useCallback(() => {
    const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const lowercase = "abcdefghijklmnopqrstuvwxyz";
    const numbers = "0123456789";
    const symbols = "!@#$%^&*()_+-=[]{}|;:,.<>?";

    let chars = "";
    if (useUppercase) chars += uppercase;
    if (useLowercase) chars += lowercase;
    if (useNumbers) chars += numbers;
    if (useSymbols) chars += symbols;

    if (chars === "") {
      toast.error("Please select at least one character type");
      return;
    }

    const array = new Uint32Array(length);
    crypto.getRandomValues(array);

    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars[array[i] % chars.length];
    }

    setPassword(result);
    toast.success(t.tools.passwordGenerator.generated);
  }, [length, useUppercase, useLowercase, useNumbers, useSymbols, t]);

  const handleCopy = useCallback(async () => {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success(t.tools.passwordGenerator.copied);
    } catch {
      toast.error(t.common.unknownError);
    }
  }, [password, t]);

  return (
    <div className="flex h-full flex-col min-h-0">
      <PageHeader
        title={t.tools.passwordGenerator.title}
        description={t.tools.passwordGenerator.subtitle}
        actions={
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => navigate("/toolbox")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        }
      />

      <div className="flex-1 overflow-auto py-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Password Display */}
          <div className="rounded-xl border bg-card p-1.5">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Lock className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">{t.tools.passwordGenerator.title}</h3>
                <p className="text-sm text-muted-foreground">{t.tools.passwordGenerator.subtitle}</p>
              </div>
            </div>

            <div className="flex gap-2">
              <Input
                value={password}
                readOnly
                className="font-mono text-lg tracking-wider"
                placeholder="Click Generate to create password"
              />
              <Button onClick={handleCopy} disabled={!password} variant="outline" size="icon">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Options */}
          <div className="rounded-xl border bg-card p-1.5 space-y-6">
            {/* Length */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>{t.tools.passwordGenerator.lengthLabel}</Label>
                <span className="text-sm font-mono bg-muted px-2 py-1 rounded">{length}</span>
              </div>
              <Slider
                value={[length]}
                onValueChange={(v: number[]) => setLength(v[0] ?? 16)}
                min={4}
                max={64}
                step={1}
              />
            </div>

            {/* Character Types */}
            <div className="space-y-3">
              <Label>Character Types</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <span className="text-sm">{t.tools.passwordGenerator.uppercase}</span>
                  <Switch checked={useUppercase} onCheckedChange={setUseUppercase} />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <span className="text-sm">{t.tools.passwordGenerator.lowercase}</span>
                  <Switch checked={useLowercase} onCheckedChange={setUseLowercase} />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <span className="text-sm">{t.tools.passwordGenerator.numbers}</span>
                  <Switch checked={useNumbers} onCheckedChange={setUseNumbers} />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <span className="text-sm">{t.tools.passwordGenerator.symbols}</span>
                  <Switch checked={useSymbols} onCheckedChange={setUseSymbols} />
                </div>
              </div>
            </div>

            {/* Generate Button */}
            <Button onClick={generate} className="w-full" size="lg">
              <RefreshCw className="mr-2 h-4 w-4" />
              {t.tools.passwordGenerator.generate}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

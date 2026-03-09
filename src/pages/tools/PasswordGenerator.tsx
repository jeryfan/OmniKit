import { useState, useCallback, useEffect } from "react";
import { ArrowLeft, RefreshCw, Copy, Check, Shield, Lock, Eye, EyeOff, History, Trash2, Settings2 } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { useLanguage } from "@/lib/i18n";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface PasswordOptions {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
  excludeSimilar: boolean;
  excludeAmbiguous: boolean;
}

interface PasswordHistory {
  id: string;
  password: string;
  timestamp: number;
  strength: "weak" | "fair" | "good" | "strong";
}

const CHAR_SETS = {
  uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  lowercase: "abcdefghijklmnopqrstuvwxyz",
  numbers: "0123456789",
  symbols: "!@#$%^&*()_+-=[]{}|;:,.<>?",
  similar: "0O1lI",
  ambiguous: "{}[]()/\\'"`~,;:.<>",
};

export default function PasswordGenerator() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<PasswordHistory[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  
  const [options, setOptions] = useState<PasswordOptions>({
    length: 16,
    uppercase: true,
    lowercase: true,
    numbers: true,
    symbols: true,
    excludeSimilar: false,
    excludeAmbiguous: false,
  });

  const calculateStrength = (pwd: string): "weak" | "fair" | "good" | "strong" => {
    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (/[a-z]/.test(pwd)) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^a-zA-Z0-9]/.test(pwd)) score++;
    
    if (score <= 2) return "weak";
    if (score <= 4) return "fair";
    if (score <= 5) return "good";
    return "strong";
  };

  const generatePassword = useCallback(() => {
    let chars = "";
    if (options.uppercase) chars += CHAR_SETS.uppercase;
    if (options.lowercase) chars += CHAR_SETS.lowercase;
    if (options.numbers) chars += CHAR_SETS.numbers;
    if (options.symbols) chars += CHAR_SETS.symbols;

    if (!chars) {
      toast.error(t.tools.passwordGenerator.selectOneOption);
      return;
    }

    // Exclude similar characters
    if (options.excludeSimilar) {
      chars = chars.split("").filter(c => !CHAR_SETS.similar.includes(c)).join("");
    }

    // Exclude ambiguous characters
    if (options.excludeAmbiguous) {
      chars = chars.split("").filter(c => !CHAR_SETS.ambiguous.includes(c)).join("");
    }

    let pwd = "";
    const array = new Uint32Array(options.length);
    crypto.getRandomValues(array);
    
    for (let i = 0; i < options.length; i++) {
      pwd += chars[array[i] % chars.length];
    }

    // Ensure at least one of each selected type
    let finalPassword = pwd;
    let positions = Array.from({ length: options.length }, (_, i) => i);
    
    // Shuffle positions
    for (let i = positions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [positions[i], positions[j]] = [positions[j], positions[i]];
    }

    let posIndex = 0;
    
    if (options.uppercase) {
      const upperChars = options.excludeSimilar 
        ? CHAR_SETS.uppercase.split("").filter(c => !CHAR_SETS.similar.includes(c)).join("")
        : CHAR_SETS.uppercase;
      finalPassword = finalPassword.substring(0, positions[posIndex]) + 
        upperChars[Math.floor(Math.random() * upperChars.length)] + 
        finalPassword.substring(positions[posIndex] + 1);
      posIndex++;
    }
    
    if (options.lowercase) {
      const lowerChars = options.excludeSimilar
        ? CHAR_SETS.lowercase.split("").filter(c => !CHAR_SETS.similar.includes(c)).join("")
        : CHAR_SETS.lowercase;
      finalPassword = finalPassword.substring(0, positions[posIndex]) + 
        lowerChars[Math.floor(Math.random() * lowerChars.length)] + 
        finalPassword.substring(posIndex + 1);
      posIndex++;
    }
    
    if (options.numbers) {
      const numChars = options.excludeSimilar
        ? CHAR_SETS.numbers.split("").filter(c => !CHAR_SETS.similar.includes(c)).join("")
        : CHAR_SETS.numbers;
      finalPassword = finalPassword.substring(0, positions[posIndex]) + 
        numChars[Math.floor(Math.random() * numChars.length)] + 
        finalPassword.substring(posIndex + 1);
      posIndex++;
    }
    
    if (options.symbols) {
      let symChars = CHAR_SETS.symbols;
      if (options.excludeAmbiguous) {
        symChars = symChars.split("").filter(c => !CHAR_SETS.ambiguous.includes(c)).join("");
      }
      finalPassword = finalPassword.substring(0, positions[posIndex]) + 
        symChars[Math.floor(Math.random() * symChars.length)] + 
        finalPassword.substring(posIndex + 1);
    }

    setPassword(finalPassword);
    
    // Add to history
    const strength = calculateStrength(finalPassword);
    const historyItem: PasswordHistory = {
      id: Date.now().toString(),
      password: finalPassword,
      timestamp: Date.now(),
      strength,
    };
    setHistory(prev => [historyItem, ...prev].slice(0, 20));
  }, [options, t]);

  useEffect(() => {
    generatePassword();
  }, []);

  const handleCopy = useCallback(async () => {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success(t.common.copied);
    } catch {
      toast.error(t.common.unknownError);
    }
  }, [password, t]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    toast.success(t.tools.passwordGenerator.historyCleared);
  }, [t]);

  const strengthConfig = {
    weak: { label: t.tools.passwordGenerator.weak, color: "bg-red-500", textColor: "text-red-500" },
    fair: { label: t.tools.passwordGenerator.fair, color: "bg-yellow-500", textColor: "text-yellow-600" },
    good: { label: t.tools.passwordGenerator.good, color: "bg-blue-500", textColor: "text-blue-600" },
    strong: { label: t.tools.passwordGenerator.strong, color: "bg-green-500", textColor: "text-green-600" },
  };

  const currentStrength = calculateStrength(password);
  const strengthInfo = strengthConfig[currentStrength];

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
          <h1 className="text-xl font-semibold">{t.tools.passwordGenerator.title}</h1>
          <p className="text-sm text-muted-foreground">{t.tools.passwordGenerator.subtitle}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowHistory(!showHistory)}>
          <History className="h-4 w-4 mr-1" />
          {t.tools.passwordGenerator.history}
        </Button>
      </div>

      <div className="flex-1 flex flex-col min-h-0 gap-4">
        {/* Password Display */}
        <div className="bg-muted/30 rounded-xl border p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium">{t.tools.passwordGenerator.generatedPassword}</span>
          </div>
          
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              value={password}
              readOnly
              className="pr-24 font-mono text-lg tracking-wider"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleCopy}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          
          {/* Strength Indicator */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t.tools.passwordGenerator.strength}</span>
              <span className={cn("text-sm font-medium", strengthInfo.textColor)}>
                {strengthInfo.label}
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={cn("h-full transition-all duration-300", strengthInfo.color)}
                style={{
                  width: currentStrength === "weak" ? "25%" : 
                         currentStrength === "fair" ? "50%" : 
                         currentStrength === "good" ? "75%" : "100%"
                }}
              />
            </div>
          </div>
          
          {/* Generate Button */}
          <Button onClick={generatePassword} className="w-full gap-2">
            <RefreshCw className="h-4 w-4" />
            {t.tools.passwordGenerator.regenerate}
          </Button>
        </div>

        {/* Options */}
        <div className="bg-muted/30 rounded-xl border p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{t.tools.passwordGenerator.options}</span>
          </div>
          
          {/* Length Slider */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm">{t.tools.passwordGenerator.length}</label>
              <span className="text-sm font-mono font-medium">{options.length}</span>
            </div>
            <Slider
              value={[options.length]}
              onValueChange={([v]) => setOptions(prev => ({ ...prev, length: v }))}
              min={6}
              max={64}
              step={1}
            />
          </div>
          
          {/* Character Options */}
          <div className="grid grid-cols-2 gap-3">
            <OptionSwitch
              label={t.tools.passwordGenerator.uppercase}
              checked={options.uppercase}
              onCheckedChange={(v) => setOptions(prev => ({ ...prev, uppercase: v }))}
            />
            <OptionSwitch
              label={t.tools.passwordGenerator.lowercase}
              checked={options.lowercase}
              onCheckedChange={(v) => setOptions(prev => ({ ...prev, lowercase: v }))}
            />
            <OptionSwitch
              label={t.tools.passwordGenerator.numbers}
              checked={options.numbers}
              onCheckedChange={(v) => setOptions(prev => ({ ...prev, numbers: v }))}
            />
            <OptionSwitch
              label={t.tools.passwordGenerator.symbols}
              checked={options.symbols}
              onCheckedChange={(v) => setOptions(prev => ({ ...prev, symbols: v }))}
            />
            <OptionSwitch
              label={t.tools.passwordGenerator.excludeSimilar}
              desc="0O1lI"
              checked={options.excludeSimilar}
              onCheckedChange={(v) => setOptions(prev => ({ ...prev, excludeSimilar: v }))}
            />
            <OptionSwitch
              label={t.tools.passwordGenerator.excludeAmbiguous}
              desc="{}[]()/\\'"
              checked={options.excludeAmbiguous}
              onCheckedChange={(v) => setOptions(prev => ({ ...prev, excludeAmbiguous: v }))}
            />
          </div>
        </div>

        {/* History */}
        {showHistory && history.length > 0 && (
          <div className="bg-muted/30 rounded-xl border p-4 flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">{t.tools.passwordGenerator.recentPasswords}</span>
              <Button variant="ghost" size="sm" onClick={clearHistory}>
                <Trash2 className="h-4 w-4 mr-1" />
                {t.common.clear}
              </Button>
            </div>
            
            <div className="flex-1 overflow-auto space-y-2">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 bg-background rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Lock className={cn("h-4 w-4", strengthConfig[item.strength].textColor)} />
                    <span className="font-mono text-sm">{"*".repeat(item.password.length)}</span>
                    <span className={cn("text-xs px-2 py-0.5 rounded-full bg-muted", strengthConfig[item.strength].textColor)}>
                      {strengthConfig[item.strength].label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={async () => {
                        await navigator.clipboard.writeText(item.password);
                        toast.success(t.common.copied);
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Option Switch Component
interface OptionSwitchProps {
  label: string;
  desc?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

function OptionSwitch({ label, desc, checked, onCheckedChange }: OptionSwitchProps) {
  return (
    <label className={cn(
      "flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all",
      checked ? "border-primary/50 bg-primary/5" : "border-border bg-background hover:border-muted-foreground/30"
    )}>
      <div>
        <div className="text-sm font-medium">{label}</div>
        {desc && <div className="text-xs text-muted-foreground font-mono">{desc}</div>}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  );
}

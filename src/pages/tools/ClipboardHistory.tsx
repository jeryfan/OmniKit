import { useState, useCallback, useEffect } from "react";
import { ArrowLeft, Copy, Trash2, Clock, Type, Image as ImageIcon, FileText } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { useLanguage } from "@/lib/i18n";
import { toast } from "sonner";

interface ClipboardItem {
  id: string;
  content: string;
  type: "text" | "image" | "unknown";
  timestamp: number;
}

// Simulated clipboard history - in a real app, this would need backend support
const STORAGE_KEY = "omnikit-clipboard-history";

export default function ClipboardHistory() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [items, setItems] = useState<ClipboardItem[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setItems(JSON.parse(stored));
      } catch {
        // ignore
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const handleCopy = useCallback(async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      toast.success(t.tools.clipboardHistory.copied);
    } catch {
      toast.error(t.common.unknownError);
    }
  }, [t]);

  const handleDelete = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const handleClear = useCallback(() => {
    setItems([]);
  }, []);

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "text":
        return <Type className="h-4 w-4" />;
      case "image":
        return <ImageIcon className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "text":
        return t.tools.clipboardHistory.textType;
      case "image":
        return t.tools.clipboardHistory.imageType;
      default:
        return t.tools.clipboardHistory.unknownType;
    }
  };

  return (
    <div className="flex h-full flex-col min-h-0">
      <PageHeader
        title={t.tools.clipboardHistory.title}
        description={t.tools.clipboardHistory.subtitle}
        actions={
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => navigate("/toolbox")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        }
      />

      <div className="flex-1 overflow-auto py-6">
        {items.length > 0 ? (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button variant="destructive" size="sm" onClick={handleClear}>
                <Trash2 className="mr-2 h-4 w-4" />
                {t.tools.clipboardHistory.clear}
              </Button>
            </div>

            {items.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border bg-card p-4 group"
              >
                <div className="flex items-start gap-4">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    {getIcon(item.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-muted-foreground uppercase">
                        {getTypeLabel(item.type)}
                      </span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTime(item.timestamp)}
                      </span>
                    </div>
                    <p className="text-sm truncate font-mono bg-muted px-2 py-1 rounded">
                      {item.content.length > 100
                        ? item.content.slice(0, 100) + "..."
                        : item.content}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleCopy(item.content)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(item.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <ClipboardIcon className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-1">
              {t.tools.clipboardHistory.empty}
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Clipboard items will appear here. Note: This feature requires backend
              support for full functionality.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </svg>
  );
}

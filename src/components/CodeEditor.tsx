import { useState, useRef, useEffect } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { Copy, Check, WrapText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface CodeEditorProps {
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  language?: "json" | "text";
  minHeight?: string;
  maxHeight?: string;
  className?: string;
  resizable?: boolean;
  /** Fill parent flex container (flex-1 min-h-0). Parent must be flex-col. */
  fill?: boolean;
}

const jsonExtensions = [json()];
const textExtensions: never[] = [];

export default function CodeEditor({
  value,
  onChange,
  readOnly = false,
  language = "json",
  minHeight = "12rem",
  maxHeight,
  className,
  resizable = false,
  fill = false,
}: CodeEditorProps) {
  const [copied, setCopied] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [resizeH, setResizeH] = useState<number | null>(null);
  const TOOLBAR_H = 33;

  useEffect(() => {
    if (!resizable && !fill) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const ro = new ResizeObserver(([entry]) => {
      setResizeH(entry.contentRect.height);
    });
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, [resizable, fill]);

  const cmProps =
    resizeH != null
      ? { height: `${Math.max(resizeH - TOOLBAR_H, 40)}px` }
      : resizable
        ? { minHeight, maxHeight: minHeight }
        : fill
          ? { minHeight: "4rem" }
          : { minHeight, maxHeight };

  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success("已复制");
    setTimeout(() => setCopied(false), 1000);
  }

  function handleFormat() {
    if (language !== "json") return;
    try {
      const formatted = JSON.stringify(JSON.parse(value), null, 2);
      onChange?.(formatted);
    } catch {
      toast.error("JSON 格式错误，无法格式化");
    }
  }

  const extensions = language === "json" ? jsonExtensions : textExtensions;

  return (
    <div
      ref={wrapperRef}
      className={cn(
        "flex flex-col overflow-hidden rounded-md border",
        fill && "flex-1 min-h-0",
        className,
      )}
      style={resizable ? { resize: "vertical" } : undefined}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b bg-muted/60 px-2 py-1">
        <span className="font-mono text-[11px] text-muted-foreground select-none">
          {language.toUpperCase()}
        </span>
        <div className="flex items-center gap-0.5">
          {!readOnly && language === "json" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={handleFormat}
              title="格式化 JSON"
            >
              <WrapText className="mr-1 h-3 w-3" />
              格式化
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={handleCopy}
            title="复制内容"
          >
            {copied ? (
              <Check className="mr-1 h-3 w-3 text-green-600" />
            ) : (
              <Copy className="mr-1 h-3 w-3" />
            )}
            {copied ? "已复制" : "复制"}
          </Button>
        </div>
      </div>

      {/* Editor */}
      <CodeMirror
        value={value}
        onChange={readOnly ? undefined : onChange}
        readOnly={readOnly}
        extensions={extensions}
        {...cmProps}
        lineWrapping
        basicSetup={{
          lineNumbers: true,
          foldGutter: language === "json",
          bracketMatching: true,
          closeBrackets: !readOnly,
          autocompletion: false,
          highlightSelectionMatches: false,
          searchKeymap: false,
        }}
        style={{ fontSize: "12px" }}
      />
    </div>
  );
}

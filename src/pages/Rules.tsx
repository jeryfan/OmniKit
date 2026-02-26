import { useState, useEffect, useCallback } from "react";
import { FileCode2, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  type ConversionRule,
  listConversionRules,
  parseIpcError,
  updateConversionRule,
} from "@/lib/tauri";
import { toast } from "sonner";
import { useLanguage } from "@/lib/i18n";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default function Rules({ embedded = false }: { embedded?: boolean }) {
  const { t } = useLanguage();

  const [rules, setRules] = useState<ConversionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingRuleIds, setUpdatingRuleIds] = useState<Set<string>>(new Set());

  const fetchRules = useCallback(async () => {
    try {
      setLoading(true);
      const data = await listConversionRules();
      setRules(data.filter((rule) => rule.rule_type === "system"));
    } catch (err) {
      toast.error(parseIpcError(err).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  async function handleToggleEnabled(rule: ConversionRule, enabled: boolean) {
    try {
      setUpdatingRuleIds((prev) => {
        const next = new Set(prev);
        next.add(rule.id);
        return next;
      });

      await updateConversionRule({
        id: rule.id,
        slug: rule.slug,
        name: rule.name,
        description: rule.description ?? undefined,
        author: rule.author ?? undefined,
        version: rule.version,
        tags: rule.tags ?? undefined,
        modality: rule.modality,
        decode_request: rule.decode_request,
        encode_request: rule.encode_request,
        decode_response: rule.decode_response,
        encode_response: rule.encode_response,
        decode_stream_chunk: rule.decode_stream_chunk ?? undefined,
        encode_stream_chunk: rule.encode_stream_chunk ?? undefined,
        http_config: rule.http_config ?? undefined,
        enabled,
      });

      setRules((prev) =>
        prev.map((item) => (item.id === rule.id ? { ...item, enabled } : item)),
      );
    } catch (err) {
      toast.error(parseIpcError(err).message);
    } finally {
      setUpdatingRuleIds((prev) => {
        const next = new Set(prev);
        next.delete(rule.id);
        return next;
      });
    }
  }

  return (
    <div className="space-y-8">
      {!embedded && (
        <PageHeader
          title={t.rules.title}
          description={t.rules.subtitle}
        />
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">
            {t.common.loading}
          </span>
        </div>
      ) : rules.length === 0 ? (
        <EmptyState
          icon={FileCode2}
          title={t.common.noData}
        />
      ) : (
        <div className="table-wrapper">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.common.name}</TableHead>
                <TableHead>{t.rules.slug}</TableHead>
                <TableHead className="text-center">{t.rules.ruleType}</TableHead>
                <TableHead className="text-center">{t.rules.modality}</TableHead>
                <TableHead className="text-center">{t.rules.version}</TableHead>
                <TableHead className="text-center">{t.common.status}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="font-medium">{rule.name}</TableCell>
                  <TableCell>
                    <code className="text-sm font-mono text-muted-foreground">
                      {rule.slug}
                    </code>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary">{t.rules.system}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline">{rule.modality}</Badge>
                  </TableCell>
                  <TableCell className="text-center text-muted-foreground">
                    {rule.version}
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch
                      size="sm"
                      checked={rule.enabled}
                      disabled={updatingRuleIds.has(rule.id)}
                      onCheckedChange={(checked) =>
                        handleToggleEnabled(rule, !!checked)
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

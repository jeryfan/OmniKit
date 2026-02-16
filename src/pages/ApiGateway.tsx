import { useSearchParams } from "react-router";
import {
  Network,
  FileCode2,
  ArrowRightLeft,
  KeyRound,
  ScrollText,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useLanguage } from "@/lib/i18n";
import Channels from "@/pages/Channels";
import Rules from "@/pages/Rules";
import ModelMappings from "@/pages/ModelMappings";
import Tokens from "@/pages/Tokens";
import RequestLogs from "@/pages/RequestLogs";

const TABS = ["channels", "rules", "model-mappings", "tokens", "request-logs"] as const;
type TabValue = (typeof TABS)[number];

function isValidTab(value: string): value is TabValue {
  return (TABS as readonly string[]).includes(value);
}

export default function ApiGateway() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useLanguage();

  const tabParam = searchParams.get("tab") ?? "";
  const activeTab: TabValue = isValidTab(tabParam) ? tabParam : "channels";

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value }, { replace: true });
  };

  const tabItems: { value: TabValue; icon: typeof Network; label: string }[] = [
    { value: "channels", icon: Network, label: t.sidebar.channels },
    { value: "rules", icon: FileCode2, label: t.sidebar.rules },
    { value: "model-mappings", icon: ArrowRightLeft, label: t.sidebar.modelMappings },
    { value: "tokens", icon: KeyRound, label: t.sidebar.tokens },
    { value: "request-logs", icon: ScrollText, label: t.sidebar.requestLogs },
  ];

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="flex h-full flex-col">
      <TabsList className="mx-6 mt-4 w-fit">
        {tabItems.map((item) => (
          <TabsTrigger key={item.value} value={item.value}>
            <item.icon className="h-4 w-4" />
            {item.label}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="channels" className="flex-1 overflow-auto">
        <Channels embedded />
      </TabsContent>
      <TabsContent value="rules" className="flex-1 overflow-auto">
        <Rules embedded />
      </TabsContent>
      <TabsContent value="model-mappings" className="flex-1 overflow-auto">
        <ModelMappings embedded />
      </TabsContent>
      <TabsContent value="tokens" className="flex-1 overflow-auto">
        <Tokens embedded />
      </TabsContent>
      <TabsContent value="request-logs" className="flex-1 overflow-auto">
        <RequestLogs embedded />
      </TabsContent>
    </Tabs>
  );
}

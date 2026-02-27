import { useSearchParams } from "react-router";
import {
  Network,
  FileCode2,
  KeyRound,
  ScrollText,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useLanguage } from "@/lib/i18n";
import Routes from "@/pages/Routes";
import Rules from "@/pages/Rules";
import Tokens from "@/pages/Tokens";
import RequestLogs from "@/pages/RequestLogs";

const TABS = ["routes", "rules", "tokens", "request-logs"] as const;
type TabValue = (typeof TABS)[number];

function isValidTab(value: string): value is TabValue {
  return (TABS as readonly string[]).includes(value);
}

export default function ApiGateway() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useLanguage();

  const tabParam = searchParams.get("tab") ?? "";
  const activeTab: TabValue = isValidTab(tabParam) ? tabParam : "routes";

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value }, { replace: true });
  };

  const tabItems = [
    { value: "routes" as TabValue, icon: Network, label: "路由" },
    { value: "rules" as TabValue, icon: FileCode2, label: t.sidebar.rules },
    { value: "tokens" as TabValue, icon: KeyRound, label: t.sidebar.tokens },
    { value: "request-logs" as TabValue, icon: ScrollText, label: t.sidebar.requestLogs },
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
      <TabsContent value="routes" className="flex-1 overflow-auto">
        <Routes embedded />
      </TabsContent>
      <TabsContent value="rules" className="flex-1 overflow-auto">
        <Rules embedded />
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

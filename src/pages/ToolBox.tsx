import { useNavigate } from "react-router";
import {
  Eraser,
  Code2,
  Regex,
  FileText,
  Clock,
  QrCode,
  Globe,
  Shield,
  Network,
  GitCompare,
  Lock,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { useLanguage } from "@/lib/i18n";

interface Tool {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  path: string;
}

export default function ToolBox() {
  const navigate = useNavigate();
  const { t } = useLanguage();

  const tools: Tool[] = [
    {
      id: "text-cleaner",
      title: t.toolBox.tools.textCleaner.title,
      description: t.toolBox.tools.textCleaner.description,
      icon: Eraser,
      path: "/toolbox/text-cleaner",
    },
    {
      id: "base64-codec",
      title: t.toolBox.tools.base64Codec.title,
      description: t.toolBox.tools.base64Codec.description,
      icon: Code2,
      path: "/toolbox/base64-codec",
    },
    {
      id: "regex-tester",
      title: t.toolBox.tools.regexTester.title,
      description: t.toolBox.tools.regexTester.description,
      icon: Regex,
      path: "/toolbox/regex-tester",
    },
    {
      id: "json-formatter",
      title: t.toolBox.tools.jsonFormatter.title,
      description: t.toolBox.tools.jsonFormatter.description,
      icon: FileText,
      path: "/toolbox/json-formatter",
    },
    {
      id: "timestamp-converter",
      title: t.toolBox.tools.timestampConverter.title,
      description: t.toolBox.tools.timestampConverter.description,
      icon: Clock,
      path: "/toolbox/timestamp-converter",
    },
    {
      id: "qr-code-generator",
      title: t.toolBox.tools.qrCodeGenerator.title,
      description: t.toolBox.tools.qrCodeGenerator.description,
      icon: QrCode,
      path: "/toolbox/qr-code-generator",
    },
    {
      id: "http-debugger",
      title: t.toolBox.tools.httpDebugger.title,
      description: t.toolBox.tools.httpDebugger.description,
      icon: Globe,
      path: "/toolbox/http-debugger",
    },
    {
      id: "jwt-decoder",
      title: t.toolBox.tools.jwtDecoder.title,
      description: t.toolBox.tools.jwtDecoder.description,
      icon: Shield,
      path: "/toolbox/jwt-decoder",
    },
    {
      id: "port-scanner",
      title: t.toolBox.tools.portScanner.title,
      description: t.toolBox.tools.portScanner.description,
      icon: Network,
      path: "/toolbox/port-scanner",
    },
    {
      id: "text-diff",
      title: t.toolBox.tools.textDiff.title,
      description: t.toolBox.tools.textDiff.description,
      icon: GitCompare,
      path: "/toolbox/text-diff",
    },
    {
      id: "password-generator",
      title: t.toolBox.tools.passwordGenerator.title,
      description: t.toolBox.tools.passwordGenerator.description,
      icon: Lock,
      path: "/toolbox/password-generator",
    },
  ];

  return (
    <div className="flex h-full flex-col p-2">
      <PageHeader
        title={t.toolBox.title}
        description={t.toolBox.subtitle}
      />

      <div className="flex-1 overflow-auto">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tools.map((tool) => (
            <Card
              key={tool.id}
              className="cursor-pointer transition-all duration-200 hover:border-primary/50 hover:shadow-md"
              onClick={() => navigate(tool.path)}
            >
              <CardHeader className="pb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <tool.icon className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-base">{tool.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="line-clamp-2">
                  {tool.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

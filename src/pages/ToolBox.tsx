import { useNavigate } from "react-router";
import { Eraser, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  ];

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={t.toolBox.title}
        description={t.toolBox.subtitle}
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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

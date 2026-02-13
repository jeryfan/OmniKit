import { useState } from "react";
import { NavLink } from "react-router";
import {
  LayoutDashboard,
  Network,
  ArrowRightLeft,
  KeyRound,
  ScrollText,
  Waypoints,
  Settings,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Languages,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme } from "./ThemeProvider";
import { useLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "anyllm-sidebar-collapsed";

function getInitialCollapsed(): boolean {
  return localStorage.getItem(STORAGE_KEY) === "true";
}

export function Sidebar() {
  const { theme, setTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const [collapsed, setCollapsed] = useState(getInitialCollapsed);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  };

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  const toggleLanguage = () => {
    setLanguage(language === "zh" ? "en" : "zh");
  };

  const navItems = [
    { to: "/", icon: LayoutDashboard, label: t.sidebar.dashboard },
    { to: "/channels", icon: Network, label: t.sidebar.channels },
    { to: "/model-mappings", icon: ArrowRightLeft, label: t.sidebar.modelMappings },
    { to: "/tokens", icon: KeyRound, label: t.sidebar.tokens },
    { to: "/request-logs", icon: ScrollText, label: t.sidebar.requestLogs },
    { to: "/proxy", icon: Waypoints, label: t.sidebar.proxy },
  ];

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "group relative flex flex-row items-center whitespace-nowrap rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150",
      collapsed ? "justify-center" : "gap-3",
      isActive
        ? "bg-sidebar-accent text-sidebar-accent-foreground"
        : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
    );

  const settingsLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "group relative flex flex-row items-center whitespace-nowrap rounded-lg px-2 py-2 text-[13px] font-medium transition-all duration-150",
      collapsed ? "justify-center" : "gap-3",
      isActive
        ? "bg-sidebar-accent text-sidebar-accent-foreground"
        : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
    );

  return (
    <TooltipProvider delayDuration={0}>
      <div
        className={cn(
          "flex h-screen shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar-background text-sidebar-foreground transition-[width] duration-200",
          collapsed ? "w-14" : "w-56",
        )}
      >
        {/* Navigation */}
        <nav className="flex flex-1 flex-col gap-0.5 px-2 py-3">
          {navItems.map((item) =>
            collapsed ? (
              <Tooltip key={item.to}>
                <TooltipTrigger asChild>
                  <NavLink to={item.to} end={item.to === "/"} className={navLinkClass}>
                    <item.icon className="h-4 w-4 shrink-0" />
                  </NavLink>
                </TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            ) : (
              <NavLink key={item.to} to={item.to} end={item.to === "/"} className={navLinkClass}>
                <item.icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            ),
          )}
        </nav>
        <Separator className="mx-2" />

        {/* Bottom section */}
        <div className={cn(
          "flex shrink-0 items-center px-2 py-2",
          collapsed ? "flex-col gap-1" : "justify-between px-3",
        )}>
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <NavLink to="/settings" className={settingsLinkClass}>
                  <Settings className="h-4 w-4 shrink-0" />
                </NavLink>
              </TooltipTrigger>
              <TooltipContent side="right">{t.sidebar.settings}</TooltipContent>
            </Tooltip>
          ) : (
            <NavLink to="/settings" className={settingsLinkClass}>
              <Settings className="h-4 w-4 shrink-0" />
              <span>{t.sidebar.settings}</span>
            </NavLink>
          )}
          <div className={cn("flex items-center", collapsed ? "flex-col gap-1" : "gap-0.5")}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={toggleLanguage} className="h-8 w-8 text-sidebar-foreground hover:text-sidebar-accent-foreground">
                  <Languages className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {language === "zh" ? "English" : "中文"}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-8 w-8 text-sidebar-foreground hover:text-sidebar-accent-foreground">
                  {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">{t.sidebar.toggleTheme}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleCollapsed}
                  className="h-8 w-8 text-sidebar-foreground hover:text-sidebar-accent-foreground"
                >
                  {collapsed ? (
                    <PanelLeftOpen className="h-4 w-4" />
                  ) : (
                    <PanelLeftClose className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {collapsed ? t.sidebar.expand : t.sidebar.collapse}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

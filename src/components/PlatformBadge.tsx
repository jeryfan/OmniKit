import { cn } from "@/lib/utils";

// Platform logo SVG components
const DouyinLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.13.02.26.04.38.08-.01.82-.02 1.63-.02 2.44-.5-.12-1.01-.16-1.52-.11-1.11.09-2.17.59-2.91 1.38-.76.81-1.16 1.91-1.08 3 .02.32.08.63.17.93.38 1.24 1.41 2.21 2.67 2.45.86.17 1.76.07 2.57-.32.02-1.32 0-2.63.01-3.95.03-2.59-.02-5.18.04-7.77z"/>
  </svg>
);

const BilibiliLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 0 1-.373-.906c0-.356.124-.658.373-.907l.027-.027c.267-.249.573-.373.92-.373.347 0 .653.124.92.373L9.653 4.44c.071.071.134.142.187.213h4.267a.836.836 0 0 1 .187-.213l2.84-2.72c.267-.249.573-.373.92-.373.347 0 .662.151.929.4.267.249.391.551.391.907 0 .355-.124.657-.373.906L17.813 4.653zM5.333 7.24c-.746.018-1.373.276-1.88.773-.506.498-.769 1.13-.786 1.894v7.52c.017.764.28 1.396.786 1.893.507.498 1.134.756 1.88.773h13.334c.746-.017 1.373-.275 1.88-.773.506-.497.769-1.129.786-1.893v-7.52c-.017-.765-.28-1.397-.786-1.894-.507-.497-1.134-.755-1.88-.773H5.333zM8 11.282c.391.391.391 1.024 0 1.415L6.414 14.282l1.586 1.586c.391.391.391 1.024 0 1.415-.195.195-.451.293-.707.293s-.512-.098-.707-.293l-2.293-2.293c-.391-.391-.391-1.024 0-1.415l2.293-2.293c.391-.391 1.024-.391 1.415 0zm8 0c.391-.391 1.024-.391 1.415 0l2.293 2.293c.391.391.391 1.024 0 1.415l-2.293 2.293c-.195.195-.451.293-.707.293s-.512-.098-.707-.293c-.391-.391-.391-1.024 0-1.415l1.586-1.586-1.586-1.586c-.391-.391-.391-1.024 0-1.415z"/>
  </svg>
);

const YoutubeLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
);

const KuaishouLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.615 14.154h-2.77v-3.077h-1.538v3.077h-2.77v-6.154h2.77v2.77h1.538v-2.77h2.77v6.154z"/>
  </svg>
);

const DefaultPlatformLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
  </svg>
);

export interface PlatformBadgeProps {
  platform: string;
  className?: string;
  showLabel?: boolean;
}

const platformConfig: Record<string, { label: string; logo: React.ComponentType<{ className?: string }>; color: string }> = {
  douyin: { label: "抖音", logo: DouyinLogo, color: "text-black dark:text-white" },
  bilibili: { label: "B站", logo: BilibiliLogo, color: "text-pink-500" },
  youtube: { label: "YouTube", logo: YoutubeLogo, color: "text-red-500" },
  kuaishou: { label: "快手", logo: KuaishouLogo, color: "text-orange-500" },
};

export function PlatformBadge({ platform, className, showLabel = true }: PlatformBadgeProps) {
  const normalizedPlatform = platform.toLowerCase().trim();
  const config = platformConfig[normalizedPlatform] || {
    label: platform.charAt(0).toUpperCase() + platform.slice(1),
    logo: DefaultPlatformLogo,
    color: "text-muted-foreground",
  };

  const LogoComponent = config.logo;

  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <LogoComponent className={cn("h-3.5 w-3.5", config.color)} />
      {showLabel && (
        <span className={cn("text-xs", config.color)}>{config.label}</span>
      )}
    </span>
  );
}
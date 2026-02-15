# UI Polish & Design System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Systematically upgrade the frontend visual quality to a refined modern (Linear/Vercel) aesthetic, with reusable components and multi-theme-ready architecture.

**Architecture:** Enhance CSS design tokens for theme-ability, upgrade all shadcn base components for refined styling, extract reusable composite components (PageHeader, DataTable, StatusBadge, EmptyState, FormDialog), then apply consistently across all 8 pages.

**Tech Stack:** React 19, Tailwind CSS v4 (CSS variables), shadcn/ui, class-variance-authority, Radix UI

---

### Task 1: Upgrade Design Tokens & Global Styles

**Files:**
- Modify: `src/styles/globals.css`

**Goal:** Add semantic design tokens for shadows, spacing, animations, and transitions. Enhance existing card/table shadows. Add keyframe animations for micro-interactions.

**Step 1: Update globals.css with enhanced tokens and animations**

Replace the entire file with:

```css
@import "tailwindcss";

@custom-variant dark (&:is(.dark *));

@theme {
  /* Brand accent — refined indigo */
  --color-brand: hsl(230 70% 55%);
  --color-brand-foreground: hsl(0 0% 100%);
  --color-brand-muted: hsl(230 70% 96%);

  /* Warm neutrals — shifted from cold 240 to warmer 220 */
  --color-background: hsl(220 20% 98.5%);
  --color-foreground: hsl(220 14% 10%);
  --color-card: hsl(0 0% 100%);
  --color-card-foreground: hsl(220 14% 10%);
  --color-popover: hsl(0 0% 100%);
  --color-popover-foreground: hsl(220 14% 10%);
  --color-primary: hsl(230 70% 55%);
  --color-primary-foreground: hsl(0 0% 100%);
  --color-secondary: hsl(220 14% 96%);
  --color-secondary-foreground: hsl(220 14% 10%);
  --color-muted: hsl(220 14% 96%);
  --color-muted-foreground: hsl(220 10% 46%);
  --color-accent: hsl(220 14% 96%);
  --color-accent-foreground: hsl(220 14% 10%);
  --color-destructive: hsl(0 72% 51%);
  --color-destructive-foreground: hsl(0 0% 100%);
  --color-border: hsl(220 13% 91%);
  --color-input: hsl(220 13% 91%);
  --color-ring: hsl(230 70% 55%);

  /* Sidebar — subtle distinction */
  --color-sidebar-background: hsl(0 0% 100%);
  --color-sidebar-foreground: hsl(220 10% 36%);
  --color-sidebar-primary: hsl(230 70% 55%);
  --color-sidebar-primary-foreground: hsl(0 0% 100%);
  --color-sidebar-accent: hsl(230 70% 97%);
  --color-sidebar-accent-foreground: hsl(230 70% 45%);
  --color-sidebar-border: hsl(220 13% 93%);
  --color-sidebar-ring: hsl(230 70% 55%);

  /* Chart palette — harmonious 5-color system */
  --color-chart-1: hsl(230 70% 55%);
  --color-chart-2: hsl(280 60% 55%);
  --color-chart-3: hsl(170 60% 42%);
  --color-chart-4: hsl(35 85% 55%);
  --color-chart-5: hsl(350 65% 55%);

  --radius: 0.625rem;
}

@layer base {
  .dark {
    --color-brand: hsl(230 70% 65%);
    --color-brand-foreground: hsl(0 0% 100%);
    --color-brand-muted: hsl(230 30% 15%);

    --color-background: hsl(220 14% 5%);
    --color-foreground: hsl(220 10% 95%);
    --color-card: hsl(220 14% 7%);
    --color-card-foreground: hsl(220 10% 95%);
    --color-popover: hsl(220 14% 8%);
    --color-popover-foreground: hsl(220 10% 95%);
    --color-primary: hsl(230 70% 65%);
    --color-primary-foreground: hsl(0 0% 100%);
    --color-secondary: hsl(220 10% 12%);
    --color-secondary-foreground: hsl(220 10% 95%);
    --color-muted: hsl(220 10% 12%);
    --color-muted-foreground: hsl(220 8% 56%);
    --color-accent: hsl(220 10% 12%);
    --color-accent-foreground: hsl(220 10% 95%);
    --color-destructive: hsl(0 62% 40%);
    --color-destructive-foreground: hsl(0 0% 100%);
    --color-border: hsl(220 10% 14%);
    --color-input: hsl(220 10% 14%);
    --color-ring: hsl(230 70% 65%);

    --color-sidebar-background: hsl(220 14% 6%);
    --color-sidebar-foreground: hsl(220 10% 70%);
    --color-sidebar-primary: hsl(230 70% 65%);
    --color-sidebar-primary-foreground: hsl(0 0% 100%);
    --color-sidebar-accent: hsl(230 30% 14%);
    --color-sidebar-accent-foreground: hsl(230 70% 75%);
    --color-sidebar-border: hsl(220 10% 12%);
    --color-sidebar-ring: hsl(230 70% 65%);

    --color-chart-1: hsl(230 70% 65%);
    --color-chart-2: hsl(280 60% 65%);
    --color-chart-3: hsl(170 55% 50%);
    --color-chart-4: hsl(35 80% 55%);
    --color-chart-5: hsl(350 60% 60%);
  }
}

@layer base {
  * {
    @apply border-border;
  }
  html,
  body {
    @apply h-full;
    overscroll-behavior: none;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  #root {
    @apply h-full overflow-hidden;
  }
  body {
    @apply bg-background text-foreground;
    overflow: hidden;
  }
}

/* Refined component styles */
@layer components {
  /* Multi-layer card shadow for depth */
  .card-elevated {
    box-shadow:
      0 0 0 1px hsl(220 13% 91% / 0.6),
      0 1px 2px hsl(220 14% 10% / 0.03),
      0 2px 4px hsl(220 14% 10% / 0.03),
      0 4px 16px hsl(220 14% 10% / 0.03);
  }
  .dark .card-elevated {
    box-shadow:
      0 0 0 1px hsl(220 10% 14% / 0.8),
      0 1px 2px hsl(0 0% 0% / 0.15),
      0 4px 16px hsl(0 0% 0% / 0.12);
  }

  /* Table wrapper with refined shadow */
  .table-wrapper {
    @apply rounded-xl border bg-card overflow-hidden;
    box-shadow:
      0 1px 2px hsl(220 14% 10% / 0.02),
      0 2px 8px hsl(220 14% 10% / 0.02);
  }
  .dark .table-wrapper {
    box-shadow:
      0 1px 2px hsl(0 0% 0% / 0.12),
      0 2px 8px hsl(0 0% 0% / 0.08);
  }

  /* Popover/dropdown refined shadow */
  .shadow-popover {
    box-shadow:
      0 0 0 1px hsl(220 13% 91% / 0.6),
      0 4px 6px -1px hsl(220 14% 10% / 0.06),
      0 10px 24px -4px hsl(220 14% 10% / 0.08);
  }
  .dark .shadow-popover {
    box-shadow:
      0 0 0 1px hsl(220 10% 16% / 0.8),
      0 4px 6px -1px hsl(0 0% 0% / 0.2),
      0 10px 24px -4px hsl(0 0% 0% / 0.25);
  }

  /* Code block styling */
  .code-block {
    @apply rounded-lg border bg-muted/40 p-4 text-xs font-mono leading-relaxed overflow-auto whitespace-pre-wrap break-all;
  }
  .dark .code-block {
    @apply bg-muted/20;
  }
}

/* Subtle animation utilities */
@layer utilities {
  .animate-in-subtle {
    animation: fadeInSubtle 0.15s ease-out;
  }
}

@keyframes fadeInSubtle {
  from {
    opacity: 0;
    transform: translateY(2px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

**Step 2: Verify the dev server compiles without error**

Run: `cd /Users/fanjunjie/Documents/repositories/personal/omnikit && npm run dev`
Expected: No compilation errors.

---

### Task 2: Upgrade Base UI Components

**Files:**
- Modify: `src/components/ui/table.tsx`
- Modify: `src/components/ui/button.tsx`
- Modify: `src/components/ui/badge.tsx`
- Modify: `src/components/ui/dialog.tsx`
- Modify: `src/components/ui/card.tsx`
- Modify: `src/components/ui/input.tsx`
- Modify: `src/components/ui/dropdown-menu.tsx`
- Modify: `src/components/ui/select.tsx`

**Goal:** Refine spacing, transitions, and visual quality of all base components.

**Step 1: Upgrade Table component**

In `src/components/ui/table.tsx`, make these changes:
- `TableHead`: Increase padding to `px-4`, add `text-xs uppercase tracking-wider text-muted-foreground/70` for refined header style, increase height to `h-11`
- `TableCell`: Increase padding to `px-4 py-3` for more breathing room
- `TableRow`: Add `transition-colors duration-150` for smoother hover

**Step 2: Upgrade Button component**

In `src/components/ui/button.tsx`, add:
- `active:scale-[0.98]` to the base class for tactile press feedback
- Add `cursor-pointer` to base class
- Adjust primary variant: Add `shadow-sm` and `hover:shadow` for depth on primary buttons

**Step 3: Upgrade Badge component**

In `src/components/ui/badge.tsx`, refine:
- Reduce font-weight for less heavy badges (use `font-medium` as is but ensure `text-[11px]` for more refined sizing)
- Add `transition-colors duration-150`

**Step 4: Upgrade Dialog component**

In `src/components/ui/dialog.tsx`:
- Change overlay from `bg-black/50` to `bg-black/40 backdrop-blur-[2px]` for modern glass effect
- DialogContent: Change `gap-4` to `gap-5`, add `shadow-popover` class
- DialogContent: Change animation from `zoom-out-95`/`zoom-in-95` to `zoom-out-[0.97]`/`zoom-in-[0.97]` for subtler scale
- DialogHeader: add `pb-1` for slight spacing from content
- DialogFooter: add `pt-2` for spacing from content

**Step 5: Upgrade Card component**

In `src/components/ui/card.tsx`:
- CardHeader: Add `pb-2` to reduce gap between header and content slightly
- Adjust base shadow: change `shadow-sm` to remove it (rely on card-elevated class for shadow control)

**Step 6: Upgrade Input component**

In `src/components/ui/input.tsx`:
- Add `transition-all duration-150` for smoother focus state
- Add `hover:border-input/80` for subtle hover feedback
- Dark mode: enhance with `dark:hover:border-input/60`

**Step 7: Upgrade DropdownMenu component**

In `src/components/ui/dropdown-menu.tsx`:
- Add `shadow-popover` to DropdownMenuContent
- DropdownMenuItem: add `transition-colors duration-100`

**Step 8: Upgrade Select component**

In `src/components/ui/select.tsx`:
- Add `shadow-popover` to SelectContent

**Step 9: Verify dev server compiles**

Run: `npm run dev`
Expected: No errors, all components render correctly.

---

### Task 3: Create Reusable Composite Components

**Files:**
- Create: `src/components/page-header.tsx`
- Create: `src/components/empty-state.tsx`
- Create: `src/components/status-badge.tsx`
- Create: `src/components/data-table.tsx`

**Goal:** Extract commonly repeated patterns into well-designed, reusable composite components.

**Step 1: Create PageHeader component**

```tsx
// src/components/page-header.tsx
import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
```

**Step 2: Create EmptyState component**

```tsx
// src/components/empty-state.tsx
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center rounded-xl border border-dashed py-16",
      className
    )}>
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/50">
        <Icon className="size-6 text-muted-foreground/50" />
      </div>
      <p className="mt-4 text-sm font-medium text-muted-foreground">{title}</p>
      {description && (
        <p className="mt-1 text-xs text-muted-foreground/70">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
```

**Step 3: Create StatusBadge component**

```tsx
// src/components/status-badge.tsx
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatusType = "success" | "warning" | "error" | "info" | "neutral";

const statusStyles: Record<StatusType, string> = {
  success: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400",
  warning: "bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400",
  error: "bg-red-500/10 text-red-600 border-red-500/20 dark:text-red-400",
  info: "bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400",
  neutral: "bg-muted text-muted-foreground",
};

interface StatusBadgeProps {
  status: StatusType;
  children: React.ReactNode;
  className?: string;
}

export function StatusBadge({ status, children, className }: StatusBadgeProps) {
  return (
    <Badge className={cn(statusStyles[status], className)}>
      {children}
    </Badge>
  );
}

// HTTP status code helper
export function HttpStatusBadge({ status }: { status: number | null }) {
  if (status === null || status === undefined) {
    return <StatusBadge status="neutral">N/A</StatusBadge>;
  }
  if (status >= 200 && status < 300) {
    return <StatusBadge status="success">{status}</StatusBadge>;
  }
  if (status >= 300 && status < 400) {
    return <StatusBadge status="info">{status}</StatusBadge>;
  }
  if (status >= 400 && status < 500) {
    return <StatusBadge status="warning">{status}</StatusBadge>;
  }
  return <StatusBadge status="error">{status}</StatusBadge>;
}

// Enabled/Disabled badge
export function EnabledBadge({ enabled, enabledText, disabledText }: { enabled: boolean; enabledText: string; disabledText: string }) {
  return enabled
    ? <StatusBadge status="success">{enabledText}</StatusBadge>
    : <StatusBadge status="neutral">{disabledText}</StatusBadge>;
}

// Method badge for HTTP methods
const methodColors: Record<string, StatusType> = {
  GET: "info",
  POST: "success",
  PUT: "warning",
  DELETE: "error",
  PATCH: "info",
};

export function MethodBadge({ method }: { method: string }) {
  const upper = method.toUpperCase();
  return <StatusBadge status={methodColors[upper] ?? "neutral"}>{upper}</StatusBadge>;
}
```

**Step 4: Create DataTable wrapper**

```tsx
// src/components/data-table.tsx
import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface DataTableProps {
  headers: { label: string; className?: string }[];
  loading?: boolean;
  loadingText?: string;
  children: ReactNode;
  className?: string;
}

export function DataTable({ headers, loading, loadingText, children, className }: DataTableProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
        {loadingText && (
          <span className="ml-2 text-sm text-muted-foreground">{loadingText}</span>
        )}
      </div>
    );
  }

  return (
    <div className={cn("table-wrapper", className)}>
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((h, i) => (
              <TableHead key={i} className={h.className}>{h.label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {children}
        </TableBody>
      </Table>
    </div>
  );
}
```

---

### Task 4: Apply Design System to Dashboard Page

**Files:**
- Modify: `src/pages/Dashboard.tsx`

**Goal:** Use new composite components, refine stat card layout, improve skeleton states.

**Changes:**
- Replace inline header with `<PageHeader>`
- StatCard: fine-tune icon container size, add subtle `transition-shadow duration-200 hover:shadow-md` to cards
- Chart: ensure tooltip uses theme variables consistently
- Skeleton: use `rounded-lg` for softer corners

---

### Task 5: Apply Design System to Channels Page

**Files:**
- Modify: `src/pages/Channels.tsx`

**Goal:** Replace inline status badges with `EnabledBadge`, use `PageHeader`, `EmptyState`, `DataTable`. Refine dialog layouts.

**Changes:**
- Replace header block with `<PageHeader>`
- Replace empty state JSX with `<EmptyState icon={Network}>`
- Replace inline enabled/disabled badges with `<EnabledBadge>`
- Replace table wrapper + manual table with `<DataTable>`
- Test badges: use `<StatusBadge>` for success/error states
- Dialog forms: ensure `gap-5` spacing, add `pt-1` after description
- API Keys dialog: refine key list item styling — add `hover:bg-muted/50 transition-colors` to rows

---

### Task 6: Apply Design System to Tokens Page

**Files:**
- Modify: `src/pages/Tokens.tsx`

**Goal:** Use shared components, refine status badge, clean up local StatusBadge.

**Changes:**
- Replace header with `<PageHeader>`
- Replace empty state with `<EmptyState icon={KeyRound}>`
- Replace local `StatusBadge` component with imported `StatusBadge` from `src/components/status-badge.tsx`
- Replace table with `<DataTable>`
- Dialog forms: uniform `gap-5` spacing

---

### Task 7: Apply Design System to RequestLogs Page

**Files:**
- Modify: `src/pages/RequestLogs.tsx`

**Goal:** Use shared components, enhance filter bar layout, refine detail dialog.

**Changes:**
- Replace header with `<PageHeader>`
- Replace local `StatusBadge` with `HttpStatusBadge`
- Toolbar: wrap filter bar in a subtle `rounded-lg border bg-card/50 p-2` container for visual grouping
- Detail dialog: metadata grid add subtle `bg-muted/30 rounded-lg p-4` container
- Code blocks: use `.code-block` class

---

### Task 8: Apply Design System to ModelMappings Page

**Files:**
- Modify: `src/pages/ModelMappings.tsx`

**Goal:** Use shared components.

**Changes:**
- Replace header with `<PageHeader>`
- Replace empty state with `<EmptyState icon={Route}>`
- Replace table with `<DataTable>`
- Dialog: uniform `gap-5`

---

### Task 9: Apply Design System to UsageStats Page

**Files:**
- Modify: `src/pages/UsageStats.tsx`

**Goal:** Refine stat cards, charts, model breakdown table. Use PageHeader.

**Changes:**
- Replace header with `<PageHeader>` (with time range buttons as actions)
- Stat cards: consistent hover elevation effect
- Chart cards: ensure consistent tooltip styling
- Model breakdown table: wrap in `.table-wrapper` for consistency

---

### Task 10: Apply Design System to Settings Page

**Files:**
- Modify: `src/pages/Settings.tsx`

**Goal:** Refine card layouts, improve button group styling, use PageHeader.

**Changes:**
- Replace header with `<PageHeader>`
- Theme/Language button groups: wrap in `rounded-lg border p-1 bg-muted/30` for segmented control appearance
- Card content: improve grid spacing and label styling

---

### Task 11: Apply Design System to Proxy Page

**Files:**
- Modify: `src/pages/Proxy.tsx`

**Goal:** Use shared components throughout both Rules and Logs tabs.

**Changes:**
- Replace header with `<PageHeader>`
- Rules tab: Replace empty state with `<EmptyState>`, table with `<DataTable>`
- Replace local `StatusBadge` and `MethodBadge` with shared versions
- Logs tab: use shared badges
- Replace inline enabled/disabled badges with `<EnabledBadge>`
- Detail dialog: use `.code-block` for pre blocks

---

### Task 12: Upgrade Layout & Sidebar

**Files:**
- Modify: `src/components/layout/Layout.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

**Goal:** Refine main layout padding, sidebar transitions, and navigation link hover states.

**Changes:**
- Layout: change main padding from `p-6` to `px-8 py-6` for wider horizontal breathing room
- Sidebar: add subtle active indicator — a small 2px accent bar on the left of active nav item
- Bottom section buttons: add `transition-colors duration-150`
- Sidebar border: ensure consistent with dark mode

---

### Task 13: Final Visual QA & Consistency Pass

**Goal:** Check all pages render correctly in both light and dark modes, ensure consistent spacing, verify responsive behavior.

**Steps:**
1. Run dev server: `npm run dev`
2. Open each page and verify:
   - Light mode: consistent shadows, spacing, typography
   - Dark mode: borders visible, no contrast issues
   - Tables: headers aligned, cells have comfortable spacing
   - Dialogs: open/close smoothly, form spacing consistent
   - Buttons: press feedback works, primary has shadow
   - Badges: consistent sizing and colors
   - Empty states: icon + text + action layout correct
3. Fix any visual inconsistencies found

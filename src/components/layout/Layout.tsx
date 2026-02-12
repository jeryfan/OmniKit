import { Outlet } from "react-router";
import { Sidebar } from "./Sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";

export function Layout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <ScrollArea className="flex-1">
        <main className="p-6">
          <Outlet />
        </main>
      </ScrollArea>
    </div>
  );
}

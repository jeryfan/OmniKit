import { Outlet } from "react-router";
import { Sidebar } from "./Sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UpdateBanner } from "@/components/UpdateBanner";

export function Layout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <UpdateBanner />
        <ScrollArea className="flex-1">
          <main className="px-8 py-6">
            <Outlet />
          </main>
        </ScrollArea>
      </div>
    </div>
  );
}

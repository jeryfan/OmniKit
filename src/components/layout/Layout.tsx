import { Outlet } from "react-router";
import { Sidebar } from "./Sidebar";
import { UpdateBanner } from "@/components/UpdateBanner";

export function Layout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <UpdateBanner />
        <main className="flex-1 p-1.5 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

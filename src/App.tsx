import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { Layout } from "@/components/layout/Layout";
import ApiGateway from "@/pages/ApiGateway";
import UsageStats from "@/pages/UsageStats";
import Settings from "@/pages/Settings";
import VideoDownload from "@/pages/VideoDownload";
import VideoRecords from "@/pages/VideoRecords";
import ToolBox from "@/pages/ToolBox";
import TextCleaner from "@/pages/tools/TextCleaner";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/api-gateway" replace />} />
          <Route path="api-gateway" element={<ApiGateway />} />
          <Route path="usage-stats" element={<UsageStats />} />
          <Route path="settings" element={<Settings />} />
          <Route path="video-download" element={<VideoDownload />} />
          <Route path="video-records" element={<VideoRecords />} />
          <Route path="toolbox" element={<ToolBox />} />
          <Route path="toolbox/text-cleaner" element={<TextCleaner />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;

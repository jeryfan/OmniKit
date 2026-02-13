import { BrowserRouter, Routes, Route } from "react-router";
import { Layout } from "@/components/layout/Layout";
import Dashboard from "@/pages/Dashboard";
import Channels from "@/pages/Channels";
import ModelMappings from "@/pages/ModelMappings";
import Tokens from "@/pages/Tokens";
import RequestLogs from "@/pages/RequestLogs";
import UsageStats from "@/pages/UsageStats";
import Settings from "@/pages/Settings";
import Proxy from "@/pages/Proxy";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="channels" element={<Channels />} />
          <Route path="model-mappings" element={<ModelMappings />} />
          <Route path="tokens" element={<Tokens />} />
          <Route path="request-logs" element={<RequestLogs />} />
          <Route path="usage-stats" element={<UsageStats />} />
          <Route path="settings" element={<Settings />} />
          <Route path="proxy" element={<Proxy />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;

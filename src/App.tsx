import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { Layout } from "@/components/layout/Layout";
import ApiGateway from "@/pages/ApiGateway";
import UsageStats from "@/pages/UsageStats";
import Settings from "@/pages/Settings";
import VideoDownload from "@/pages/VideoDownload";
import VideoRecords from "@/pages/VideoRecords";
import ToolBox from "@/pages/ToolBox";
import TextCleaner from "@/pages/tools/TextCleaner";
import JwtDecoder from "@/pages/tools/JwtDecoder";
import Base64Codec from "@/pages/tools/Base64Codec";
import RegexTester from "@/pages/tools/RegexTester";
import SqlFormatter from "@/pages/tools/SqlFormatter";
import JsonFormatter from "@/pages/tools/JsonFormatter";
import MarkdownPreview from "@/pages/tools/MarkdownPreview";
import PasswordGenerator from "@/pages/tools/PasswordGenerator";
import TimestampConverter from "@/pages/tools/TimestampConverter";
import ClipboardHistory from "@/pages/tools/ClipboardHistory";
import QrCodeGenerator from "@/pages/tools/QrCodeGenerator";
import HttpDebugger from "@/pages/tools/HttpDebugger";
import PortScanner from "@/pages/tools/PortScanner";
import ImageCompressor from "@/pages/tools/ImageCompressor";
import ColorPicker from "@/pages/tools/ColorPicker";
import SrtTool from "@/pages/tools/SrtTool";

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
          <Route path="toolbox/jwt-decoder" element={<JwtDecoder />} />
          <Route path="toolbox/base64-codec" element={<Base64Codec />} />
          <Route path="toolbox/regex-tester" element={<RegexTester />} />
          <Route path="toolbox/sql-formatter" element={<SqlFormatter />} />
          <Route path="toolbox/json-formatter" element={<JsonFormatter />} />
          <Route path="toolbox/markdown-preview" element={<MarkdownPreview />} />
          <Route path="toolbox/password-generator" element={<PasswordGenerator />} />
          <Route path="toolbox/timestamp-converter" element={<TimestampConverter />} />
          <Route path="toolbox/clipboard-history" element={<ClipboardHistory />} />
          <Route path="toolbox/qr-code-generator" element={<QrCodeGenerator />} />
          <Route path="toolbox/http-debugger" element={<HttpDebugger />} />
          <Route path="toolbox/port-scanner" element={<PortScanner />} />
          <Route path="toolbox/image-compressor" element={<ImageCompressor />} />
          <Route path="toolbox/color-picker" element={<ColorPicker />} />
          <Route path="toolbox/srt-tool" element={<SrtTool />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;

import { Navigate, Route, Routes } from "react-router-dom";

import AppLayout from "@/layouts/AppLayout";
import BrandLayout from "@/layouts/BrandLayout";
import BrandListPage from "@/pages/BrandListPage";
import CreateBrandPage from "@/pages/CreateBrandPage";
import BrandDashboardPage from "@/pages/BrandDashboardPage";
import LiveMentionsPage from "@/pages/LiveMentionsPage";
import AnalyticsPage from "@/pages/AnalyticsPage";
import LiveMentionDetailPage from "@/pages/LiveMentionDetailPage";
import NotFoundPage from "@/pages/NotFoundPage";

function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/brands" replace />} />
        <Route path="brands" element={<BrandListPage />} />
        <Route path="brands/create" element={<CreateBrandPage />} />
        <Route path="brands/:brandId" element={<BrandLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<BrandDashboardPage />} />
          <Route path="live" element={<LiveMentionsPage />} />
          <Route path="live/:mentionId" element={<LiveMentionDetailPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;

import { Routes, Route } from "react-router-dom";
import Home from "@/pages/Home";
import ModulePage from "@/pages/ModulePage";
import ModulesPage from "@/pages/ModulesPage";
import NotFound from "@/pages/NotFound";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/modules" element={<ModulesPage />} />
      <Route path="/module/:slug" element={<ModulePage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DashboardPage } from "./dashboard/DashboardPage";

createRoot(document.getElementById("root")!).render(<StrictMode><DashboardPage /></StrictMode>);

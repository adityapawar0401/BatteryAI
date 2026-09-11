import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { FailureRiskPage } from "./failure/FailureRiskPage";

createRoot(document.getElementById("root")!).render(<StrictMode><FailureRiskPage /></StrictMode>);

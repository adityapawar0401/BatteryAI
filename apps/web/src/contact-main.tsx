import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ContactPage } from "./contact/ContactPage";

createRoot(document.getElementById("root")!).render(<StrictMode><ContactPage /></StrictMode>);

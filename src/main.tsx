import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { enableAnalytics } from "./analytics";
import "./styles.css";

enableAnalytics();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

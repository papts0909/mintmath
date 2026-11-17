import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { setupPwa } from "./pwa";
import "@fontsource/cormorant-garamond/latin-500.css";
import "@fontsource/cormorant-garamond/latin-500-italic.css";
import "./styles.css";

setupPwa();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

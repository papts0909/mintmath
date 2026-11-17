import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { setupPwa } from "./pwa";
import "@fontsource/poppins/400.css";
import "@fontsource/poppins/500.css";
import "@fontsource/poppins/600.css";
// Poppins has no Vietnamese letters (ư, ệ, ở…): Be Vietnam Pro fills them in.
import "@fontsource/be-vietnam-pro/400.css";
import "@fontsource/be-vietnam-pro/500.css";
import "@fontsource/be-vietnam-pro/600.css";
import "@fontsource/cormorant-garamond/latin-500.css";
import "@fontsource/cormorant-garamond/latin-500-italic.css";
import "./styles.css";
import { loadSettings } from "./core/persistence";
import { applyTheme } from "./core/theme";

// Set the theme before the first paint (no flash of the wrong colours).
applyTheme(loadSettings().theme)(); // App keeps it updated from here on
setupPwa();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

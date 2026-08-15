import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { getRouter } from "./router";
import "./styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root container in index.html");

// StrictMode stays on: the audio engine is built to survive its double mount,
// and leaving it enabled is what keeps that guarantee honest in development.
createRoot(container).render(
  <StrictMode>
    <RouterProvider router={getRouter()} />
  </StrictMode>,
);

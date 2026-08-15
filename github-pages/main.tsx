import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/montserrat";
import "../app/globals.css";
import CareerGame from "../app/CareerGame";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <CareerGame cloudEnabled={false} />
  </React.StrictMode>,
);

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BeginnerShell } from "@/components/editor/beginner-shell";
import { StudioShell } from "@/components/editor/studio-shell";
import { MODE } from "@/lib/mode/mode";

// The header (back to the first page, step switcher) comes from templates/header.html
const root = document.getElementById("root");
if (root)
  createRoot(root).render(
    <StrictMode>{MODE === "beginner" ? <BeginnerShell /> : <StudioShell />}</StrictMode>,
  );

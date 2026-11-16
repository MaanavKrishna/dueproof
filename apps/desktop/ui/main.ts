import "@dueproof/tokens/tokens.css";
import "./setup.css";
import { invoke } from "@tauri-apps/api/core";
import { mount } from "./setup";

void mount(document, invoke).catch(() => {
  const status = document.getElementById("status");
  if (status) {
    status.textContent = "This screen only works inside the Dueproof app.";
    status.dataset.tone = "danger";
    status.hidden = false;
  }
});

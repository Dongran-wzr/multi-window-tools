import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Prevent transitions on initial load
document.documentElement.classList.add("no-transitions");
window.addEventListener("load", () => {
  setTimeout(() => {
    document.documentElement.classList.remove("no-transitions");
  }, 100);
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

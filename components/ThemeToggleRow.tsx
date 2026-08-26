"use client";

import { useEffect, useState } from "react";

export default function ThemeToggleRow() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.getAttribute("data-theme") === "dark");
  }, []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
    try {
      localStorage.setItem("orex-theme", next ? "dark" : "light");
    } catch {}
  }

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0" }}>
      <div style={{ fontSize: 13, color: "var(--ink-secondary)" }}>Dark mode</div>
      <button className="btn-discard" style={{ padding: "6px 14px" }} onClick={toggleTheme} type="button">
        {dark ? "On — switch to light" : "Off — switch to dark"}
      </button>
    </div>
  );
}

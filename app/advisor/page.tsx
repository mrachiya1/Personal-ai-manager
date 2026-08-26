"use client";

import { useState, useRef, useEffect } from "react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const MODES = [
  { key: "daily", label: "Daily plan", prompt: "What should I do today, and what should I avoid?" },
  { key: "decision", label: "Decision", prompt: "I'm considering a decision — help me think it through: " },
  { key: "review", label: "Review", prompt: "What patterns do you see in my recent logs and work?" },
];

export default function AdvisorPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hey — I'm your advisor. Ask me for today's plan, run a decision by me, or ask what patterns I'm seeing in your recent logs. I answer from your real rules, numerology, and Notion data, not generic horoscope stuff.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(content: string) {
    if (!content.trim() || loading) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInput("");
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Overview · AI Advisor</div>
          <h1 className="brand-serif">Advisor Chat</h1>
        </div>
      </div>

      <div className="card section-card" style={{ marginBottom: 16 }}>
        <div className="chip-row">
          {MODES.map((m) => (
            <span key={m.key} className="chip" style={{ cursor: "pointer" }} onClick={() => send(m.prompt)}>
              <span className="dot" style={{ background: "var(--violet)" }} />
              {m.label}
            </span>
          ))}
        </div>
      </div>

      <div className="card section-card" style={{ display: "flex", flexDirection: "column", height: "60vh" }}>
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14, paddingRight: 4 }}>
          {messages.map((m, i) => (
            <div
              key={i}
              style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "80%",
                background: m.role === "user" ? "var(--ink)" : "var(--surface-raised)",
                color: m.role === "user" ? "#fbfaf6" : "var(--ink)",
                border: m.role === "user" ? "none" : "1px solid var(--border)",
                borderRadius: 14,
                padding: "10px 14px",
                fontSize: 13.5,
                lineHeight: 1.55,
                whiteSpace: "pre-wrap",
              }}
            >
              {m.content}
            </div>
          ))}
          {loading && (
            <div style={{ alignSelf: "flex-start", color: "var(--ink-muted)", fontSize: 13 }}>Thinking…</div>
          )}
          {error && (
            <div style={{ alignSelf: "flex-start", color: "#a12424", fontSize: 12.5 }}>
              {error} — check that ANTHROPIC_API_KEY is set in .env.local.
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="capture-input"
          style={{ marginTop: 14, marginBottom: 0 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 2 11 13" />
            <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
          </svg>
          <input
            type="text"
            placeholder="Ask your advisor anything…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </form>
      </div>
    </>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  actions?: { tool: string; ok: boolean; summary: string }[];
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setError(null);
    const next: ChatMsg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setLoading(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.map((m) => ({ role: m.role, content: m.content })) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Assistant request failed");
      setMessages((m) => [...m, { role: "assistant", content: data.reply || "", actions: data.actions }]);
      if (data.actions?.some((a: any) => a.ok)) {
        router.refresh();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        className="chat-fab"
        onClick={() => setOpen((o) => !o)}
        type="button"
        aria-label={open ? "Close assistant" : "Open assistant"}
      >
        {open ? "✕" : "💬"}
      </button>
      {open && (
        <div className="chat-panel">
          <div className="chat-panel-header">
            <div>
              <div className="chat-panel-title">Assistant</div>
              <div className="chat-panel-sub">Can add tasks, expenses, income, payments, clients &amp; more — right from chat</div>
            </div>
            <button className="link-btn" type="button" onClick={() => setMessages([])}>Clear</button>
          </div>
          <div className="chat-panel-body">
            {messages.length === 0 && (
              <div className="chat-empty">
                Try: &ldquo;log a Rs 2000 fuel expense from Boc My account&rdquo;, &ldquo;add a task to follow up
                with the Irway client tomorrow&rdquo;, or &ldquo;what&rsquo;s overdue right now?&rdquo;
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`chat-msg chat-msg-${m.role}`}>
                <div className="chat-bubble">{m.content}</div>
                {m.actions && m.actions.length > 0 && (
                  <div className="chat-actions">
                    {m.actions.map((a, j) => (
                      <div key={j} className={`chat-action ${a.ok ? "ok" : "fail"}`}>
                        {a.ok ? "✓" : "✕"} {a.summary}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {loading && <div className="chat-msg chat-msg-assistant"><div className="chat-bubble">Thinking…</div></div>}
            {error && <div className="form-error" style={{ margin: "8px 12px" }}>{error}</div>}
            <div ref={bottomRef} />
          </div>
          <div className="chat-panel-input">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Ask, or tell it to add something…"
              disabled={loading}
            />
            <button className="btn-primary" type="button" onClick={send} disabled={loading || !input.trim()}>
              Send
            </button>
          </div>
        </div>
      )}
    </>
  );
}

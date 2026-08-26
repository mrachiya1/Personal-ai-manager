"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Company } from "@/lib/types";

export function NewClientButton({ companies }: { companies: Company[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [relationship, setRelationship] = useState("Lead");
  const [preferredContact, setPreferredContact] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email,
          phone,
          country,
          companyId: companyId || undefined,
          relationship,
          preferredContact,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add client");
      setOpen(false);
      setName(""); setEmail(""); setPhone(""); setCountry(""); setCompanyId(""); setPreferredContact(""); setNotes("");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)} type="button">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 3v18M3 12h18" />
        </svg>
        Add Client
      </button>
      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add Client</h2>
            <div className="modal-sub">Writes straight to your Notion Clients database</div>
            <form onSubmit={submit}>
              <div className="form-field">
                <label>Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label>Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="form-field">
                  <label>Phone</label>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label>Country</label>
                  <input value={country} onChange={(e) => setCountry(e.target.value)} />
                </div>
                <div className="form-field">
                  <label>Company</label>
                  <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                    <option value="">—</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label>Relationship</label>
                  <select value={relationship} onChange={(e) => setRelationship(e.target.value)}>
                    <option value="Lead">Lead</option>
                    <option value="Active">Active</option>
                    <option value="VIP">VIP</option>
                    <option value="Past">Past</option>
                  </select>
                </div>
                <div className="form-field">
                  <label>Preferred Contact</label>
                  <input value={preferredContact} onChange={(e) => setPreferredContact(e.target.value)} placeholder="Email, WhatsApp…" />
                </div>
              </div>
              <div className="form-field">
                <label>Notes</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              {error && <div className="form-error">{error}</div>}
              <div className="form-actions">
                <button type="button" className="btn-discard" onClick={() => setOpen(false)}>Cancel</button>
                <button type="submit" className="btn-save" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

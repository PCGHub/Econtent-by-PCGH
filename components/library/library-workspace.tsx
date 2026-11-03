"use client";
import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { browserSupabase } from "@/lib/supabase/browser";

type Item = { id: string; name: string; file_path: string; mime_type: string; size_bytes: number; status: "pending" | "completed"; created_at: string; updated_at: string };
const BUCKET = "econtent-library";
const MAX = 100 * 1024 * 1024;
function db() { return browserSupabase() as unknown as SupabaseClient | null; }
export function LibraryWorkspace() {
  const [items, setItems] = useState<Item[]>([]);
  const [filter, setFilter] = useState<"all" | "pending" | "completed">("all");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [uploadStatus, setUploadStatus] = useState<"pending" | "completed">("pending");
  const [file, setFile] = useState<File | null>(null);
  const load = useCallback(async () => {
    const client = db();
    if (!client) { setMessage("Cloud storage is not configured."); return; }
    const { data, error } = await client.from("library_items").select("*").order("updated_at", { ascending: false }).limit(100);
    if (error) { setMessage(error.message); return; }
    setItems((data ?? []) as Item[]);
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function upload() {
    if (!file || busy) return;
    const client = db();
    if (!client) return setMessage("Cloud storage is not configured.");
    if (file.size > MAX) return setMessage("Maximum file size is 100 MB.");
    setBusy(true); setMessage("Uploading file securely…");
    let path = "";
    try {
      const { data: user, error: authError } = await client.auth.getUser();
      if (authError || !user.user) throw Error("Sign in before saving to Library.");
      path = `${user.user.id}/${crypto.randomUUID()}/${file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0,100)}`;
      const uploaded = await client.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type || "application/octet-stream" });
      if (uploaded.error) throw uploaded.error;
      const saved = await client.from("library_items").insert({
        owner_id: user.user.id, name: file.name.slice(0,180), file_path: path,
        mime_type: file.type || "application/octet-stream", size_bytes: file.size, status: uploadStatus,
      });
      if (saved.error) throw saved.error;
      setFile(null); setMessage("File saved to Library."); await load();
    } catch (e) {
      if (path) await client.storage.from(BUCKET).remove([path]);
      setMessage(`Save failed; file was not added to Library. ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally { setBusy(false); }
  }
  async function download(item: Item) {
    const client = db(); if (!client) return;
    const { data, error } = await client.storage.from(BUCKET).createSignedUrl(item.file_path, 60);
    if (error || !data) return setMessage(error?.message || "Could not open file.");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }
  async function changeStatus(item: Item) {
    const client = db(); if (!client) return;
    setBusy(true);
    const status = item.status === "pending" ? "completed" : "pending";
    const { error } = await client.from("library_items").update({ status, updated_at: new Date().toISOString() }).eq("id", item.id);
    setBusy(false);
    if (error) setMessage(error.message); else await load();
  }
  async function remove(item: Item) {
    if (!window.confirm(`Permanently delete ${item.name} from your Library?`)) return;
    const client = db(); if (!client) return;
    setBusy(true);
    const deleted = await client.storage.from(BUCKET).remove([item.file_path]);
    if (deleted.error) { setMessage(deleted.error.message); setBusy(false); return; }
    const result = await client.from("library_items").delete().eq("id", item.id);
    setBusy(false);
    if (result.error) setMessage(result.error.message); else await load();
  }
  const visible = items.filter(item => filter === "all" || item.status === filter);
  return <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
    <p className="text-xs font-bold uppercase tracking-widest text-blue-600">Econtent by PCGH</p>
    <h1 className="mt-2 text-3xl font-bold">My Library</h1>
    <p className="mt-2 text-sm text-slate-600">Private cloud files for your pending and completed work. Failed uploads and failed processing attempts are not saved as Library items.</p>
    <section className="mt-6 rounded-2xl border bg-white p-5">
      <h2 className="font-semibold">Save a file</h2>
      <p className="mt-1 text-xs text-slate-500">Upload up to 100 MB. Only completed uploads appear in Library. Files are private to your account.</p>
      <input aria-label="Choose file to save" type="file" className="mt-3 block w-full text-sm" onChange={e => setFile(e.target.files?.[0] ?? null)}/>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <select aria-label="File status" className="rounded-lg border p-2 text-sm" value={uploadStatus} onChange={e => setUploadStatus(e.target.value as "pending" | "completed")}>
          <option value="pending">Pending work</option><option value="completed">Completed work</option>
        </select>
        <button type="button" disabled={!file || busy} onClick={() => void upload()} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Working…" : "Save to Library"}</button>
      </div>
      {message && <p role="status" className="mt-3 text-sm text-slate-700">{message}</p>}
    </section>
    <div className="mt-6 flex flex-wrap gap-2">
      {(["all","pending","completed"] as const).map(value => <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${filter===value ? "bg-blue-700 text-white" : "border bg-white text-slate-700"}`}>{value === "all" ? "All files" : value === "pending" ? "In progress" : "Completed"} ({value==="all" ? items.length : items.filter(item=>item.status===value).length})</button>)}
    </div>
    <section className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {visible.map(item => <article key={item.id} className="min-w-0 rounded-xl border bg-white p-4">
        <div className="flex h-24 items-center justify-center rounded-lg bg-blue-50 text-3xl">{item.mime_type.startsWith("video/") ? "🎞️" : item.mime_type.startsWith("image/") ? "🖼️" : "📄"}</div>
        <h2 className="mt-3 truncate font-semibold" title={item.name}>{item.name}</h2>
        <p className="mt-1 text-xs text-slate-500">{(item.size_bytes/1024/1024).toFixed(1)} MB · {new Date(item.updated_at).toLocaleString()}</p>
        <p className="mt-2 text-xs font-semibold">{item.status === "completed" ? "Completed" : "In progress"}</p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm font-semibold text-blue-700">
          <button onClick={() => void download(item)}>Open / Download</button>
          <button disabled={busy} onClick={() => void changeStatus(item)}>Mark {item.status === "pending" ? "completed" : "pending"}</button>
          <button disabled={busy} onClick={() => void remove(item)} className="text-red-700">Delete</button>
        </div>
      </article>)}
    </section>
    {!visible.length && <p className="mt-8 text-sm text-slate-500">No files in this category yet.</p>}
  </div>;
}

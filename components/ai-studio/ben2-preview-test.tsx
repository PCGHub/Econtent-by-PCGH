"use client";
import { useState } from "react";

export function Ben2PreviewTest() {
  const [url, setUrl] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [requestId, setRequestId] = useState("");
  const [output, setOutput] = useState("");
  async function submit() {
    if (!confirmed || busy) return;
    setBusy(true); setMessage("Submitting paid BEN2 test…"); setOutput("");
    try {
      const response = await fetch("/api/ai-background/ben2", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_url: url, background_color: [21, 93, 252], confirmCharge: true }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Submission failed");
      setRequestId(data.requestId);
      setMessage("Job submitted. fal.ai may charge your balance. Use Check status to retrieve the result.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Request failed"); }
    finally { setBusy(false); }
  }
  async function check() {
    if (!requestId || busy) return;
    setBusy(true);
    try {
      const status = await fetch(`/api/ai-background/ben2?requestId=${encodeURIComponent(requestId)}`);
      const data = await status.json();
      if (!status.ok) throw Error(data.error || "Status check failed");
      setMessage(`BEN2 status: ${data.status ?? "unknown"}`);
      if (data.status === "COMPLETED") {
        const response = await fetch(`/api/ai-background/ben2?requestId=${encodeURIComponent(requestId)}&result=true`);
        const result = await response.json();
        if (!response.ok) throw Error(result.error || "Could not fetch output");
        if (typeof result.video?.url === "string") setOutput(result.video.url);
        else setMessage("Completed but no video URL was returned.");
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Status failed"); }
    finally { setBusy(false); }
  }
  return (
    <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <h2 className="font-semibold">BEN2 paid API · Preview test only</h2>
      <p className="mt-2 text-sm">This sends your video to fal.ai. It is not a local editor operation. Start with a public HTTPS URL for a 3–5 second test clip. The API does not verify clip duration, and submitting can incur charges. No job runs automatically.</p>
      <label className="mt-3 block text-sm">Test video URL
        <input className="mt-1 w-full rounded border bg-white p-2" type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://.../short-test.mp4"/>
      </label>
      <label className="mt-3 flex items-start gap-2 text-sm">
        <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>
        I understand fal.ai may charge my account for this request, and I approve submitting this one test.
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={!confirmed || !url.startsWith("https://") || busy} onClick={submit} className="rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Submit paid test</button>
        {requestId && <button type="button" disabled={busy} onClick={check} className="rounded border px-4 py-2 text-sm">Check status</button>}
      </div>
      <p className="mt-2 text-sm" role="status">{message}</p>
      {output && <a href={output} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm font-semibold text-blue-700 underline">Open processed BEN2 video</a>}
    </section>
  );
}

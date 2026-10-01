"use client";

import { useState } from "react";
import type { Role } from "@/lib/types";

type Phase = "queued" | "parsing" | "scoring" | "done" | "error";

interface Row {
  key: string;
  filename: string;
  appliedRole: Role | null;
  phase: Phase;
  candidateId?: string;
  errorMessage?: string;
  file?: File; // kept for retry-from-parse
}

const CONCURRENCY = 3;

function PhaseBadge({ phase }: { phase: Phase }) {
  const styles: Record<Phase, string> = {
    queued: "bg-gray-100 text-gray-500",
    parsing: "bg-primary-soft text-primary",
    scoring: "bg-amber-50 text-amber-600",
    done: "bg-accent-soft text-accent-dark",
    error: "bg-red-50 text-red-600",
  };
  return <span className={`pill ${styles[phase]}`}>{phase}</span>;
}

export default function UploadPage() {
  const [role, setRole] = useState<Role | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function scoreRow(key: string, candidateId: string) {
    updateRow(key, { phase: "scoring", candidateId });
    const res = await fetch("/api/upload/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateId }),
    });
    const data = await res.json();
    if (data.status === "scored") {
      updateRow(key, { phase: "done" });
    } else {
      updateRow(key, { phase: "error", errorMessage: data.error ?? "Scoring failed" });
    }
  }

  async function parseAndScoreFile(key: string, file: File, appliedRole: Role | null) {
    updateRow(key, { phase: "parsing" });
    const form = new FormData();
    form.append("file", file);
    if (appliedRole) form.append("appliedRole", appliedRole);
    try {
      const res = await fetch("/api/upload/parse", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        updateRow(key, { phase: "error", errorMessage: data.error ?? "Parse failed" });
        return;
      }
      if (data.status === "error") {
        updateRow(key, { phase: "error", candidateId: data.candidateId, errorMessage: data.errorMessage });
        return;
      }
      await scoreRow(key, data.candidateId);
    } catch (err) {
      updateRow(key, { phase: "error", errorMessage: err instanceof Error ? err.message : String(err) });
    }
  }

  async function runQueue(keys: string[], run: (key: string) => Promise<void>) {
    let idx = 0;
    async function worker() {
      while (idx < keys.length) {
        const key = keys[idx++];
        await run(key);
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  }

  function handleFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    const newRows: Row[] = files.map((file) => ({
      key: `${file.name}-${crypto.randomUUID()}`,
      filename: file.name,
      appliedRole: role,
      phase: "queued",
      file,
    }));
    setRows((prev) => [...newRows, ...prev]);
    runQueue(
      newRows.map((r) => r.key),
      async (key) => {
        const row = newRows.find((r) => r.key === key)!;
        await parseAndScoreFile(key, row.file!, row.appliedRole);
      }
    );
  }

  function retry(row: Row) {
    if (row.file) {
      parseAndScoreFile(row.key, row.file, row.appliedRole);
    } else if (row.candidateId) {
      scoreRow(row.key, row.candidateId);
    }
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold mb-1">Upload CVs</h1>
        <p className="text-sm text-gray-500">
          PDF, DOCX or TXT. Each candidate is scored automatically the moment it&apos;s uploaded — same 4-step
          pipeline (score, guardrail, interview brief, email drafts) used for the rest of the shortlist. If it
          lands as PASS, the rejection sends right away; INTERVIEW or REVIEW candidates wait for your
          Advance/Reject call.
        </p>
      </div>

      <div className="card p-4 space-y-3">
        <label className="text-sm font-medium block">Applied role</label>
        <select
          value={role ?? ""}
          onChange={(e) => setRole(e.target.value === "" ? null : (e.target.value as Role))}
          className="border border-gray-200 rounded-xl px-3.5 py-2 text-sm"
        >
          <option value="">Not specified — score against both</option>
          <option value="PM">Product Manager</option>
          <option value="SPM">Senior Product Manager</option>
        </select>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
          }}
          className="border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center text-sm text-gray-500 bg-canvas/40"
        >
          Drag and drop PDF / DOCX / TXT files here, or
          <label className="text-primary cursor-pointer ml-1 font-medium">
            browse
            <input
              type="file"
              multiple
              accept=".pdf,.docx,.txt"
              className="hidden"
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
            />
          </label>
        </div>
      </div>

      <div className="card">
        <div className="p-4 border-b">
          <h2 className="text-sm font-semibold">Progress</h2>
        </div>
        <ul className="divide-y">
          {rows.length === 0 && <li className="p-4 text-sm text-gray-400">No uploads yet.</li>}
          {rows.map((row) => (
            <li key={row.key} className="p-3 flex items-center gap-3 text-sm">
              <span className="flex-1 truncate">{row.filename}</span>
              <span className="text-xs text-gray-400">{row.appliedRole}</span>
              <PhaseBadge phase={row.phase} />
              {row.phase === "error" && (
                <>
                  <span className="text-red-600 text-xs max-w-xs truncate" title={row.errorMessage}>
                    {row.errorMessage}
                  </span>
                  <button className="btn-secondary" onClick={() => retry(row)}>
                    Retry
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

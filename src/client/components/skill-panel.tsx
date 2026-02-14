"use client";

/**
 * SkillPanel - Sidebar skill list with upload and clone modals
 *
 * Skills are prompt sets that help the AI choose strategies.
 * Supports:
 *   - Uploading zip files to the skills directory
 *   - Cloning skills from GitHub repos (e.g. vercel-labs/agent-skills)
 */

import { useState, useRef, useCallback } from "react";
import { useSkills } from "../hooks/use-skills";

export function SkillPanel() {
  const {
    skills,
    repoSkills,
    loadedSkill,
    loading,
    cloning,
    error,
    loadSkill,
    reloadFromDisk,
    cloneFromGithub,
  } = useSkills();
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showCloneModal, setShowCloneModal] = useState(false);
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);

  const handleSkillClick = useCallback(
    async (name: string) => {
      if (expandedSkill === name) {
        setExpandedSkill(null);
        return;
      }
      setExpandedSkill(name);
      await loadSkill(name);
    },
    [expandedSkill, loadSkill]
  );

  const allDisplaySkills = [...skills, ...repoSkills.filter(
    (rs) => !skills.some((s) => s.name === rs.name)
  )];

  return (
    <div>
      {/* Section header */}
      <div className="px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Skills
          </span>
          {allDisplaySkills.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-full">
              {allDisplaySkills.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCloneModal(true)}
            className="text-[11px] text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 transition-colors"
            title="Clone skills from GitHub"
          >
            Clone
          </button>
          <button
            onClick={() => setShowUploadModal(true)}
            className="text-[11px] text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
            title="Upload skill zip"
          >
            Upload
          </button>
          <button
            onClick={reloadFromDisk}
            disabled={loading}
            className="text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50 transition-colors"
          >
            {loading ? "..." : "Reload"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-3 mb-2 px-2 py-1.5 rounded-md bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-[11px]">
          {error}
        </div>
      )}

      {/* Skill list */}
      <div className="px-1.5 pb-2">
        {allDisplaySkills.length === 0 ? (
          <div className="px-3 py-4 text-center text-gray-400 dark:text-gray-500 text-xs">
            No skills found. Clone from GitHub, upload a zip, or add SKILL.md files.
          </div>
        ) : (
          allDisplaySkills.map((skill) => (
            <div key={skill.name}>
              <button
                onClick={() => handleSkillClick(skill.name)}
                className={`w-full text-left px-2.5 py-2 mb-0.5 rounded-md transition-colors ${
                  expandedSkill === skill.name
                    ? "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300"
                    : "hover:bg-gray-50 dark:hover:bg-gray-800/50 text-gray-700 dark:text-gray-300"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <svg
                    className={`w-3 h-3 text-gray-400 transition-transform duration-150 ${expandedSkill === skill.name ? "rotate-90" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="text-xs font-medium truncate">
                    /{skill.name}
                  </span>
                  {skill.source === "repo" && (
                    <span className="shrink-0 px-1.5 py-0.5 text-[9px] text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 rounded">
                      repo
                    </span>
                  )}
                  {skill.license && (
                    <span className="ml-auto shrink-0 px-1.5 py-0.5 text-[9px] text-gray-400 bg-gray-100 dark:bg-gray-800 rounded">
                      {skill.license}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 ml-[18px] text-[10px] text-gray-400 dark:text-gray-500 truncate">
                  {skill.description}
                </div>
              </button>

              {/* Expanded skill content */}
              {expandedSkill === skill.name && loadedSkill?.name === skill.name && (
                <div className="mx-2.5 mb-2 p-2 rounded-md bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800">
                  <div className="text-[10px] font-mono text-gray-600 dark:text-gray-400 whitespace-pre-wrap max-h-40 overflow-y-auto leading-relaxed">
                    {loadedSkill.content}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Clone Modal */}
      {showCloneModal && (
        <SkillCloneModal
          onClose={() => setShowCloneModal(false)}
          onCloned={reloadFromDisk}
          cloneFromGithub={cloneFromGithub}
        />
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <SkillUploadModal onClose={() => setShowUploadModal(false)} onUploaded={reloadFromDisk} />
      )}
    </div>
  );
}

// ─── Skill Clone Modal ──────────────────────────────────────────────────

function SkillCloneModal({
  onClose,
  onCloned,
  cloneFromGithub,
}: {
  onClose: () => void;
  onCloned: () => void;
  cloneFromGithub: (url: string) => Promise<{ success: boolean; imported: string[]; count: number; error?: string }>;
}) {
  const [url, setUrl] = useState("");
  const [cloning, setCloning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    imported: string[];
    count: number;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClone = useCallback(async () => {
    if (!url.trim()) return;

    try {
      setCloning(true);
      setError(null);
      setResult(null);

      const res = await cloneFromGithub(url.trim());

      if (res.success) {
        setResult({ imported: res.imported, count: res.count });
        onCloned();
        setTimeout(onClose, 2000);
      } else {
        setError(res.error || "Failed to clone skills");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Clone failed");
    } finally {
      setCloning(false);
    }
  }, [url, cloneFromGithub, onCloned, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md mx-4 bg-white dark:bg-[#1e2130] rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg
              className="w-4 h-4 text-green-600 dark:text-green-400"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Clone Skills from GitHub
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Clone a GitHub repo containing skills (with{" "}
            <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[10px]">
              SKILL.md
            </code>{" "}
            files). Skills will be imported to{" "}
            <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[10px]">
              .agents/skills/
            </code>
            .
          </p>

          {/* URL input */}
          <div>
            <label className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 block">
              Repository URL
            </label>
            <div className="flex items-center rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#161922] overflow-hidden">
              <span className="pl-3 text-[10px] text-gray-400 dark:text-gray-500 font-mono whitespace-nowrap">
                github.com/
              </span>
              <input
                ref={inputRef}
                type="text"
                value={url.replace(
                  /^(https?:\/\/)?(www\.)?github\.com\//i,
                  ""
                )}
                onChange={(e) => {
                  const v = e.target.value;
                  setUrl(v.includes("github.com") ? v : v);
                  setError(null);
                  setResult(null);
                }}
                placeholder="vercel-labs/agent-skills"
                className="flex-1 px-1.5 py-2.5 bg-transparent text-xs text-gray-900 dark:text-gray-100 placeholder:text-gray-400 outline-none font-mono"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && url.trim()) handleClone();
                  if (e.key === "Escape") onClose();
                }}
                autoFocus
              />
            </div>
          </div>

          {/* Examples */}
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[10px] text-gray-400 dark:text-gray-500">
              Examples:
            </span>
            {[
              "vercel-labs/agent-skills",
            ].map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => {
                  setUrl(example);
                  setError(null);
                  setResult(null);
                }}
                className="px-1.5 py-0.5 text-[10px] font-mono text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
              >
                {example}
              </button>
            ))}
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/50 px-3 py-2">
              <div className="text-xs text-red-700 dark:text-red-400">
                {error}
              </div>
            </div>
          )}

          {/* Success */}
          {result && (
            <div className="rounded-md bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/50 px-3 py-2">
              <div className="text-xs text-green-700 dark:text-green-400 font-medium mb-1">
                Imported {result.count} skill{result.count !== 1 ? "s" : ""}!
              </div>
              <div className="flex flex-wrap gap-1">
                {result.imported.map((name) => (
                  <span
                    key={name}
                    className="px-1.5 py-0.5 text-[10px] font-mono text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/30 rounded"
                  >
                    /{name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 rounded-md transition-colors"
          >
            {result ? "Close" : "Cancel"}
          </button>
          {!result && (
            <button
              onClick={handleClone}
              disabled={!url.trim() || cloning}
              className="px-4 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {cloning ? (
                <>
                  <svg
                    className="w-3 h-3 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Cloning...
                </>
              ) : (
                <>
                  <svg
                    className="w-3 h-3"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  Clone &amp; Import
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Skill Upload Modal ─────────────────────────────────────────────────

function SkillUploadModal({
  onClose,
  onUploaded,
}: {
  onClose: () => void;
  onUploaded: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileSelect = useCallback((file: File) => {
    if (!file.name.endsWith(".zip")) {
      setError("Please select a .zip file");
      return;
    }
    setError(null);
    setSelectedFile(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;

    try {
      setUploading(true);
      setError(null);

      const formData = new FormData();
      formData.append("file", selectedFile);

      const res = await fetch("/api/skills/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Upload failed (${res.status})`);
      }

      setSuccess(true);
      onUploaded();
      setTimeout(onClose, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [selectedFile, onUploaded, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md mx-4 bg-white dark:bg-[#1e2130] rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Upload Skill Package
          </h3>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            Upload a .zip file containing SKILL.md and any related files.
            It will be extracted to the <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[10px]">.agents/skills/</code> directory.
          </p>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
              dragOver
                ? "border-blue-400 bg-blue-50 dark:bg-blue-900/10"
                : selectedFile
                  ? "border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/10"
                  : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
            />

            {selectedFile ? (
              <div>
                <svg className="w-8 h-8 mx-auto text-green-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {selectedFile.name}
                </div>
                <div className="text-[11px] text-gray-400 mt-1">
                  {(selectedFile.size / 1024).toFixed(1)} KB - Click to change
                </div>
              </div>
            ) : (
              <div>
                <svg className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Drop a .zip file here or click to browse
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="mt-3 px-3 py-2 rounded-md bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs">
              {error}
            </div>
          )}

          {success && (
            <div className="mt-3 px-3 py-2 rounded-md bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 text-xs">
              Skill uploaded successfully! Reloading...
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!selectedFile || uploading || success}
            className="px-4 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {uploading ? "Uploading..." : success ? "Done!" : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
}

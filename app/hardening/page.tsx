"use client";

import { useCallback, useState } from "react";
import { AppNav } from "@/components/app-nav";
import { Badge, Button, Card, cn } from "@/components/ui/primitives";

const NEXUS_API =
  process.env.NEXT_PUBLIC_NEXUS_API_URL ??
  "https://black-vault-nexus-live-690989569474.europe-west1.run.app";

type SeverityTone = "danger" | "warning" | "info" | "neutral";

interface Finding {
  rule_id: string;
  title: string;
  description: string;
  severity: string;
  line_number: number;
  cwe_id: string;
  owasp_category: string;
  fix_hint: string;
}

interface AnalysisResult {
  pattern_findings: Finding[];
  deep_scan: {
    vulnerabilities: unknown[];
    positive_findings: unknown[];
    recommendations: unknown[];
  };
  risk_score: number;
  compliance_status: Record<string, boolean>;
  scan_id: string;
}

const severityTone: Record<string, SeverityTone> = {
  P0: "danger",
  P1: "danger",
  P2: "warning",
  P3: "info",
};

const SAMPLE_CODES: Record<string, string> = {
  "SQL Injection": `import sqlite3

def get_user(user_id):
    conn = sqlite3.connect("app.db")
    query = f"SELECT * FROM users WHERE id='{user_id}'"
    return conn.execute(query).fetchone()`,
  "Hardcoded Secret": `API_KEY = "REDACTED_FIXTURE"
PASSWORD = "super_secret_123"

def authenticate():
    return requests.post(url, headers={"Authorization": API_KEY})`,
  "Command Injection": `import subprocess

def run_tool(user_cmd):
    subprocess.run(user_cmd, shell=True)
    return "done"`,
  "Clean Code": `import os

def get_api_key():
    return os.environ.get("API_KEY", "")

def add(a: int, b: int) -> int:
    return a + b`,
};

export default function HardeningPage() {
  const [code, setCode] = useState(SAMPLE_CODES["SQL Injection"]);
  const [filename, setFilename] = useState("app.py");
  const [language, setLanguage] = useState("python");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);

  const analyze = useCallback(async () => {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch(`${NEXUS_API}/api/v1/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          filename,
          language,
          frameworks: ["OWASP_TOP_10", "SOC2"],
          include_fixes: true,
        }),
      });
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }, [code, filename, language]);

  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch(`${NEXUS_API}/health`);
      setHealth(await res.json());
    } catch {
      setHealth({ error: "unreachable" });
    }
  }, []);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-white/5 px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/20">
              <span className="text-sm font-bold text-red-400">BV</span>
            </div>
            <h1 className="font-heading text-lg font-bold tracking-tight">
              BLACK_VAULT NEXUS
            </h1>
            <Badge tone="danger">LIVE</Badge>
          </div>
          <Button size="sm" variant="ghost" onClick={checkHealth}>
            System Health
          </Button>
        </div>
        <AppNav current="hardening" className="mt-3" />
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {health && (
          <Card className="mb-6 border-emerald-500/20 bg-emerald-500/5 p-4">
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-sm font-medium text-emerald-400">
                {String(
                  (health as Record<string, unknown>).status ?? "unknown"
                )}{" "}
                &mdash; {String((health as Record<string, unknown>).service ?? "")}
                {" v"}
                {String((health as Record<string, unknown>).version ?? "")}
              </span>
            </div>
          </Card>
        )}

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Left: Code Input */}
          <section>
            <h2 className="mb-4 font-heading text-xl font-bold">
              Code Analysis
            </h2>

            {/* Presets */}
            <div className="mb-4 flex flex-wrap gap-2">
              {Object.keys(SAMPLE_CODES).map((name) => (
                <button
                  key={name}
                  onClick={() => setCode(SAMPLE_CODES[name])}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
                    code === SAMPLE_CODES[name]
                      ? "border-sky-500/30 bg-sky-500/10 text-sky-400"
                      : "border-white/10 text-zinc-500 hover:text-white"
                  )}
                >
                  {name}
                </button>
              ))}
            </div>

            <div className="flex gap-3 mb-3">
              <input
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                className="flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm"
                placeholder="filename"
              />
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm"
              >
                <option value="python">Python</option>
                <option value="javascript">JavaScript</option>
                <option value="typescript">TypeScript</option>
                <option value="go">Go</option>
                <option value="java">Java</option>
              </select>
            </div>

            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              rows={12}
              className="w-full rounded-lg border border-white/10 bg-black/40 p-4 font-mono text-sm text-emerald-300 placeholder:text-zinc-600"
              placeholder="Paste code to analyze..."
            />

            <Button
              className="mt-4 w-full"
              onClick={analyze}
              disabled={loading || !code.trim()}
            >
              {loading ? "Scanning..." : "Analyze for Vulnerabilities"}
            </Button>

            {error && (
              <p className="mt-3 text-sm text-red-400">{error}</p>
            )}
          </section>

          {/* Right: Results */}
          <section>
            <h2 className="mb-4 font-heading text-xl font-bold">
              Scan Results
            </h2>

            {!result && !loading && (
              <Card className="flex h-64 items-center justify-center text-zinc-600">
                <p>Submit code to see analysis results</p>
              </Card>
            )}

            {loading && (
              <Card className="flex h-64 items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
                  <p className="text-sm text-zinc-400">
                    Running vulnerability scan...
                  </p>
                </div>
              </Card>
            )}

            {result && (
              <div className="space-y-4">
                {/* Risk Score */}
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-400">Risk Score</span>
                    <span
                      className={cn(
                        "text-3xl font-bold font-heading",
                        result.risk_score === 0
                          ? "text-emerald-400"
                          : result.risk_score <= 3
                            ? "text-amber-400"
                            : "text-red-400"
                      )}
                    >
                      {result.risk_score.toFixed(1)} / 10
                    </span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-white/10">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        result.risk_score === 0
                          ? "bg-emerald-500"
                          : result.risk_score <= 3
                            ? "bg-amber-500"
                            : "bg-red-500"
                      )}
                      style={{ width: `${result.risk_score * 10}%` }}
                    />
                  </div>
                </Card>

                {/* Compliance */}
                <Card className="p-4">
                  <h3 className="mb-2 text-sm font-bold text-zinc-400">
                    Compliance
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(result.compliance_status).map(
                      ([fw, ok]) => (
                        <Badge
                          key={fw}
                          tone={ok ? "success" : "danger"}
                        >
                          {fw}: {ok ? "PASS" : "FAIL"}
                        </Badge>
                      )
                    )}
                  </div>
                </Card>

                {/* Findings */}
                {result.pattern_findings.length > 0 ? (
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-zinc-400">
                      Findings ({result.pattern_findings.length})
                    </h3>
                    {result.pattern_findings.map((f, i) => (
                      <Card
                        key={i}
                        className={cn(
                          "border-l-4 p-4",
                          f.severity === "P0"
                            ? "border-l-red-500"
                            : f.severity === "P1"
                              ? "border-l-orange-500"
                              : "border-l-amber-500"
                        )}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <Badge tone={severityTone[f.severity] ?? "neutral"}>
                                {f.severity}
                              </Badge>
                              <span className="text-sm font-bold">
                                {f.title}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-zinc-400">
                              {f.description}
                            </p>
                          </div>
                          <span className="text-xs text-zinc-600">
                            Line {f.line_number}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs">
                          <span className="rounded bg-white/5 px-2 py-0.5 text-zinc-400">
                            {f.rule_id}
                          </span>
                          <span className="rounded bg-white/5 px-2 py-0.5 text-zinc-400">
                            {f.cwe_id}
                          </span>
                          {f.owasp_category && (
                            <span className="rounded bg-white/5 px-2 py-0.5 text-zinc-400">
                              {f.owasp_category}
                            </span>
                          )}
                        </div>
                        {f.fix_hint && (
                          <p className="mt-2 rounded bg-emerald-500/5 px-3 py-2 text-xs text-emerald-300">
                            Fix: {f.fix_hint}
                          </p>
                        )}
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Card className="flex items-center gap-3 p-4 border-emerald-500/20">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/20">
                      <span className="text-lg">&#10003;</span>
                    </div>
                    <div>
                      <p className="font-bold text-emerald-400">
                        Code is Clean
                      </p>
                      <p className="text-xs text-zinc-500">
                        No vulnerabilities detected
                      </p>
                    </div>
                  </Card>
                )}

                {/* Scan ID */}
                <p className="text-center text-xs text-zinc-600">
                  Scan ID: {result.scan_id}
                </p>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

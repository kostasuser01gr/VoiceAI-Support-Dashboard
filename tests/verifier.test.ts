import { describe, expect, it } from "vitest";

import { runGroundingVerifier } from "@/lib/verifier";

// Base valid email draft used in tests below
const VALID_EMAIL = "Subject: Update\n\nPlease review before sending.";
// Minimal email for window/score boundary tests — no line has 4+ tokens so the
// email body never triggers a spurious token_window_mismatch check.
// email_footer_missing will be set (acceptable for these focused tests).
const SHORT_EMAIL = "subject: t\n\nreview.";

describe("runGroundingVerifier", () => {
  it("flags empty summary and missing subject/footer", () => {
    const result = runGroundingVerifier({
      transcript: "Please send a recap to Maya today.",
      summary: "",
      taskList: ["Send recap to Maya today"],
      emailDraft: "Draft body only",
      policy: "warn",
    });

    expect(result.report.ok).toBe(false);
    expect(result.report.flags).toContain("summary_empty");
    expect(result.report.flags).toContain("email_subject_missing");
    expect(result.report.flags).toContain("email_footer_missing");
  });

  it("repairs output under repair policy", () => {
    const result = runGroundingVerifier({
      transcript: "Please schedule QA sync tomorrow and send summary to customer success.",
      summary: "This introduces New Entity that is not in transcript.",
      taskList: ["Create onboarding deck for Finance Board next month"],
      emailDraft: "Body without header",
      policy: "repair",
    });

    expect(result.repaired.emailDraft.toLowerCase()).toContain("subject:");
    expect(result.repaired.emailDraft.toLowerCase()).toContain(
      "please review before sending",
    );
    expect(result.report.score).toBeGreaterThanOrEqual(70);
  });

  it("flags non-actionable tasks and token window mismatch", () => {
    const result = runGroundingVerifier({
      transcript: "Please send release notes to Maya and schedule QA sync tomorrow.",
      summary: "A separate finance board discussion happened with external counsel.",
      taskList: ["Board decision documentation for legal counsel"],
      emailDraft:
        "Subject: External Board Update\n\nThis references counsel actions.\n\nPlease review before sending.",
      policy: "warn",
    });

    expect(result.report.ok).toBe(false);
    expect(result.report.flags).toContain("task_non_actionable");
    expect(result.report.flags).toContain("token_window_mismatch");
  });

  it("keeps verifier failed output under reject policy for route-level blocking", () => {
    const result = runGroundingVerifier({
      transcript: "Schedule the support handoff and send status to Priya.",
      summary: "A new contract was signed by Marcus yesterday.",
      taskList: ["Coordinate contract legal closure"],
      emailDraft:
        "Subject: Contract Closure\n\nProceed with legal closure.\n\nPlease review before sending.",
      policy: "reject",
    });

    expect(result.report.ok).toBe(false);
    expect(result.report.flags.some((flag) => flag.startsWith("entity_mismatch:"))).toBe(true);
  });
});

// ── tokenize boundary tests (L22-L27) ──────────────────────────────────────────
// Killing: MethodExpression (removes filter), EqualityOperator (>= vs >), ConditionalExpression
describe("tokenize filter — tokens ≤2 chars are excluded", () => {
  it("summary with only ≤2-char words triggers low-overlap (filter is active)", () => {
    // All words ≤2 chars → tokenize produces [] for both transcript and summary
    // overlapRatio = 0 < 0.2 → summary_low_overlap flagged
    // With mutant removing filter: words kept, perfect overlap, no flag
    const result = runGroundingVerifier({
      transcript: "go do it as me by",
      summary: "go do it",
      taskList: [],
      emailDraft: VALID_EMAIL,
      policy: "warn",
    });
    expect(result.report.flags).toContain("summary_low_overlap");
  });

  it("summary with 3-char tokens is included in overlap (not filtered)", () => {
    // "the", "big", "red" are 3 chars each — kept by filter
    const result = runGroundingVerifier({
      transcript: "the big red fox ran fast today",
      summary: "The big red fox ran fast today.",
      taskList: [],
      emailDraft: VALID_EMAIL,
      policy: "warn",
    });
    expect(result.report.flags).not.toContain("summary_low_overlap");
  });

  it("2-char token in task does NOT count as overlap with transcript", () => {
    const result = runGroundingVerifier({
      transcript: "go do it as me",
      summary: "Do the work.",
      taskList: ["Go do it"],
      emailDraft: VALID_EMAIL,
      policy: "warn",
    });
    // taskList has only ≤2-char tokens → task overlap = 0 → task_low_overlap
    expect(result.report.flags).toContain("task_low_overlap");
  });
});

// ── tokenWindows boundary tests (L32-L42) ──────────────────────────────────────
// Killing: ConditionalExpression (size boundary), EqualityOperator, ArithmeticOperator
describe("tokenWindows boundary conditions", () => {
  it("output line with exactly 4 tokens produces a single window for grounding check", () => {
    // Transcript: "send update email tomorrow" (4 tokens)
    // Summary sentence: "send update email tomorrow" → exact 4-token match
    // Must match the transcript window → no token_window_mismatch
    // SHORT_EMAIL has no 4-token lines so won't create spurious window mismatches
    const transcript = "send update email tomorrow";
    const result = runGroundingVerifier({
      transcript,
      summary: "Send update email tomorrow.",
      taskList: ["Send update email tomorrow"],
      emailDraft: SHORT_EMAIL,
      policy: "warn",
    });
    expect(result.report.flags).not.toContain("token_window_mismatch");
  });

  it("output line with 5 tokens creates sliding windows", () => {
    // "send update email tomorrow morning" — 5 tokens, creates windows [0..3] and [1..4]
    // Both present in transcript → no mismatch
    const transcript = "send update email tomorrow morning";
    const result = runGroundingVerifier({
      transcript,
      summary: "Send update email tomorrow morning.",
      taskList: [],
      emailDraft: SHORT_EMAIL,
      policy: "warn",
    });
    expect(result.report.flags).not.toContain("token_window_mismatch");
  });

  it("5-token output line absent from transcript triggers window mismatch", () => {
    // Transcript has none of these 4-token windows
    // SHORT_EMAIL lines are all < 4 tokens so only the summary triggers the mismatch
    const result = runGroundingVerifier({
      transcript: "please schedule the follow-up meeting",
      summary: "Finalize contract legal closure document.",
      taskList: [],
      emailDraft: SHORT_EMAIL,
      policy: "warn",
    });
    expect(result.report.flags).toContain("token_window_mismatch");
  });

  it("output sentence with exactly 3 tokens is not checked for window mismatch", () => {
    // Tokens < 4 → skip window check → no window_mismatch flag even if not in transcript
    // SHORT_EMAIL has no 4-token lines to generate spurious flags
    const result = runGroundingVerifier({
      transcript: "please send email",
      summary: "Finalize legal closure.",
      taskList: [],
      emailDraft: SHORT_EMAIL,
      policy: "warn",
    });
    // "finalize legal closure" = 3 tokens → under window threshold → no token_window_mismatch
    expect(result.report.flags).not.toContain("token_window_mismatch");
  });
});

// ── ACTION_VERBS string literal tests (L49-L68) ────────────────────────────────
// Killing: each StringLiteral mutation that replaces a verb string with ""
describe("ACTION_VERBS — tasks starting with each verb are actionable", () => {
  const verbs = [
    "send",
    "schedule",
    "follow",
    "review",
    "prepare",
    "confirm",
    "update",
    "share",
    "call",
    "email",
    "draft",
    "assign",
    "check",
    "resolve",
    "investigate",
    "deliver",
    "complete",
    "track",
    "create",
    "finalize",
  ];

  for (const verb of verbs) {
    it(`task starting with "${verb}" is not flagged as non-actionable`, () => {
      const task = `${verb.charAt(0).toUpperCase()}${verb.slice(1)} the report for the team today`;
      const result = runGroundingVerifier({
        transcript: `Please ${verb} the report for the team today.`,
        summary: `Team asked to ${verb} the report today.`,
        taskList: [task],
        emailDraft: VALID_EMAIL,
        policy: "warn",
      });
      expect(result.report.flags).not.toContain("task_non_actionable");
    });
  }
});

// ── overlapRatio and score arithmetic tests (L116-L184) ─────────────────────────
// Killing: EqualityOperator (<= vs <), AssignmentOperator (+= vs -=), Math.min/max
describe("score arithmetic and overlap thresholds", () => {
  it("missing_requested_task penalty reduces score — verify -=30 not +=30", () => {
    // score = 100 - 30 (missing task) - 15 (no subject) - 10 (no footer) = 45 → ok=false
    // mutant +30: 100 + 30 - 15 - 10 = 105 → ok=true → test fails → mutant killed
    const result = runGroundingVerifier({
      transcript: "Please send the update report to the team today.",
      summary: "Update report needs to be sent today to team.",
      taskList: [],
      emailDraft: "No subject no footer",
      policy: "warn",
    });
    expect(result.report.ok).toBe(false);
    expect(result.report.flags).toContain("missing_requested_task");
  });

  it("score exactly 70 passes (>= 70 threshold, not > 70)", () => {
    // Precisely score=70: only missing_requested_task (-30), all other checks pass.
    // - transcript contains "please review before sending" so email footer window matches
    // - summary has 2 tokens (< 4 → no window check)
    // - all lowercase → no entity leakage
    // - email_subject / email_footer both present
    // original: 70 >= 70 → ok=true; mutant > 70: 70 > 70 → false → test killed
    const result = runGroundingVerifier({
      transcript: "please send update please review before sending",
      summary: "send update.",
      taskList: [],
      emailDraft: "subject: x\n\nplease review before sending.",
      policy: "warn",
    });
    expect(result.report.score).toBe(70);
    expect(result.report.ok).toBe(true);
  });

  it("summary low overlap penalty is applied (not negated by += mutant)", () => {
    // summary_low_overlap flag reduces score below 100
    // AssignmentOperator mutant += would increase score → ok would change
    const result = runGroundingVerifier({
      transcript: "please send update today",
      summary: "Finalize external contract. Deploy production system.",
      taskList: [],
      emailDraft: SHORT_EMAIL,
      policy: "warn",
    });
    expect(result.report.flags).toContain("summary_low_overlap");
    expect(result.report.score).toBeLessThan(100);
  });

  it("task low overlap penalty is applied (flag present and score reduced)", () => {
    // task_low_overlap flag reduces score; mutant += would increase it
    const result = runGroundingVerifier({
      transcript: "please send update today",
      summary: "send update.",
      taskList: [
        "finalize external contract immediately",
        "deploy production system tonight",
      ],
      emailDraft: SHORT_EMAIL,
      policy: "warn",
    });
    expect(result.report.flags).toContain("task_low_overlap");
    expect(result.report.score).toBeLessThan(100);
  });

  it("entity leakage is flagged and penalises score", () => {
    const result = runGroundingVerifier({
      transcript: "please schedule the meeting",
      summary: "Meeting scheduled with John Smith from Acme Corp.",
      taskList: ["Contact John Smith at Acme Corp"],
      emailDraft: VALID_EMAIL,
      policy: "warn",
    });
    expect(result.report.flags).toContain("entity_leakage");
    expect(result.report.score).toBeLessThan(100);
  });

  it("email footer on non-terminal position triggers missing footer flag", () => {
    // Kills L187 regex mutant that removes $ anchor.
    // "sending, but verify first." does not end with "sending" or "sending."
    // With $: no match → footer missing. Without $: matches "sending" → footer present.
    const result = runGroundingVerifier({
      transcript: "please schedule the meeting with the team today",
      summary: "Schedule meeting with team today.",
      taskList: ["Schedule meeting with team today"],
      emailDraft:
        "Subject: Meeting\n\nPlease review before sending, but verify first.",
      policy: "warn",
    });
    expect(result.report.flags).toContain("email_footer_missing");
  });
});

// ── repair policy branch coverage (L197-L227) ─────────────────────────────────
describe("repair policy — comprehensive branch coverage", () => {
  it("repairs empty summary using transcript sentences", () => {
    const result = runGroundingVerifier({
      transcript: "Please send status update to the team. Schedule follow-up for tomorrow.",
      summary: "",
      taskList: ["Send status update to team"],
      emailDraft: VALID_EMAIL,
      policy: "repair",
    });
    expect(result.repaired.summary).not.toBe("");
    expect(result.repaired.summary).not.toContain("unavailable");
  });

  it("repair filters low-overlap tasks and adds fallback when all removed", () => {
    const result = runGroundingVerifier({
      transcript: "Please send update today",
      summary: "Send update today.",
      taskList: ["Finalize external contract closure"],
      emailDraft: VALID_EMAIL,
      policy: "repair",
    });
    expect(result.repaired.taskList.length).toBeGreaterThan(0);
    expect(result.repaired.taskList[0]).toContain("Follow up");
  });

  it("repair prefixes non-actionable tasks with Follow up", () => {
    const result = runGroundingVerifier({
      transcript: "please send update to the team and schedule sync today",
      summary: "Update needed for the team and sync scheduled.",
      taskList: ["The update for the team", "The sync today"],
      emailDraft: VALID_EMAIL,
      policy: "repair",
    });
    const prefixed = result.repaired.taskList.every((t) => t.startsWith("Follow up:"));
    expect(prefixed).toBe(true);
  });

  it("repaired score is boosted to at least 75 under repair policy", () => {
    const result = runGroundingVerifier({
      transcript: "Please schedule the meeting.",
      summary: "Unrelated external vendor contract signed.",
      taskList: ["External vendor procurement"],
      emailDraft: "no subject",
      policy: "repair",
    });
    expect(result.report.score).toBeGreaterThanOrEqual(75);
  });
});

// ── L98 ArrayDeclaration + L110 LogicalOperator ────────────────────────────────
describe("flags array and missing_requested_task logic", () => {
  it("produces empty flags and score 100 for perfect grounded input", () => {
    // Kills L98 ArrayDeclaration (flags=["Stryker was here"]) — empty flags proves no default pollution
    const result = runGroundingVerifier({
      transcript: "please send update today please review before sending",
      summary: "send update today.",
      taskList: ["send update today"],
      emailDraft: "subject: x\n\nplease review before sending.",
      policy: "warn",
    });
    expect(result.report.flags).toEqual([]);
    expect(result.report.score).toBe(100);
  });

  it("non-empty taskList suppresses missing_requested_task even when transcript has request words", () => {
    // Kills L110 LogicalOperator (&&→||): mutant would flag because transcript matches
    const result = runGroundingVerifier({
      transcript: "please send the report to the team",
      summary: "send report to the team.",
      taskList: ["send report to team"],
      emailDraft: "subject: x\n\nplease send the report to the team please review before sending.",
      policy: "warn",
    });
    expect(result.report.flags).not.toContain("missing_requested_task");
  });
});

// ── L90 ArithmeticOperator (hits/tokens.length) ────────────────────────────────
describe("overlapRatio arithmetic", () => {
  it("1-in-7 overlap (0.143 < 0.2) triggers summary_low_overlap (kills / → * mutant)", () => {
    // hits=1 ("finalize" in transcript), tokens=7 → 1/7≈0.143 < 0.2 → flag
    // mutant *: 1*7=7 > 0.2 → no flag → test kills mutant
    const result = runGroundingVerifier({
      transcript: "please finalize today",
      summary: "finalize the external legal contract closure document.",
      taskList: [],
      emailDraft: VALID_EMAIL,
      policy: "warn",
    });
    expect(result.report.flags).toContain("summary_low_overlap");
  });
});

// ── L117 EqualityOperator (< 0.2 vs <= 0.2) ───────────────────────────────────
describe("summary overlap threshold strict boundary", () => {
  it("summary with exactly 0.2 overlap (1/5 tokens) is NOT low-overlap (strict <, not <=)", () => {
    // tokens: ["send","external","legal","contract","closure"]=5; 1 matches → ratio=1/5=0.2
    // 0.2 < 0.2 = false → no flag; mutant <=: true → flag → kills mutant
    const result = runGroundingVerifier({
      transcript: "please send report today",
      summary: "send external legal contract closure.",
      taskList: ["send report today"],
      emailDraft: SHORT_EMAIL,
      policy: "warn",
    });
    expect(result.report.flags).not.toContain("summary_low_overlap");
  });
});

// ── L121 MethodExpression (Math.min vs Math.max) ──────────────────────────────
describe("score deduction Math.min boundaries", () => {
  it("1 low-overlap summary sentence deducts 10 not 30 — Math.min(30,1*10)=10", () => {
    // 1 sentence, 3 tokens → skip window check; 0/3 overlap → low-overlap → score -= min(30,10)=10
    // score = 100 - 10 = 90; mutant Math.max: max(30,10)=30 → 100-30=70 → kills mutant
    const result = runGroundingVerifier({
      transcript: "please send update today please review before sending",
      summary: "finalize external closure.",
      taskList: ["send update today"],
      emailDraft: "subject: x\n\nplease review before sending.",
      policy: "warn",
    });
    expect(result.report.score).toBe(90);
    expect(result.report.flags).toContain("summary_low_overlap");
    expect(result.report.flags).not.toContain("token_window_mismatch");
  });

  it("1 low-overlap task deducts 12 not 40 — Math.min(40,1*12)=12", () => {
    // score = 100 - 12 = 88; mutant Math.max: 100-40=60 → kills mutant
    const result = runGroundingVerifier({
      transcript: "please send update today please review before sending",
      summary: "send update today.",
      taskList: ["finalize contract"],
      emailDraft: "subject: x\n\nplease review before sending.",
      policy: "warn",
    });
    expect(result.report.score).toBe(88);
    expect(result.report.flags).toContain("task_low_overlap");
  });
});

// ── L132/133 ConditionalExpression/BooleanLiteral (no firstToken) ─────────────
describe("non-actionable task with empty token list", () => {
  it("task with only ≤2-char words has no firstToken and is flagged non-actionable", () => {
    // tokenize("do it") → [] → firstToken=undefined → return true (non-actionable)
    // BooleanLiteral mutant: return false → not flagged → test kills mutant
    const result = runGroundingVerifier({
      transcript: "please send report please review before sending",
      summary: "send report.",
      taskList: ["do it"],
      emailDraft: "subject: x\n\nplease review before sending.",
      policy: "warn",
    });
    expect(result.report.flags).toContain("task_non_actionable");
  });
});

// ── L138 Regex (/^(to|please)$/i) ─────────────────────────────────────────────
// Note: "to" is 2 chars → always filtered by tokenize, so firstToken is never "to".
// "please" is 3 chars → survives tokenize filter; regex must include "please" to pass.
describe("task starting with 'please' passes actionability check (kills L138 Regex)", () => {
  it("task starting with 'please' is not flagged non-actionable", () => {
    // firstToken = "please" (3 chars, survives filter); not in ACTION_VERBS → hits regex
    // Mutant removes "please" from regex → no match → non-actionable → test kills mutant
    const result = runGroundingVerifier({
      transcript: "please send the report to the team today",
      summary: "send report to team.",
      taskList: ["Please send the monthly report to the team"],
      emailDraft: VALID_EMAIL,
      policy: "warn",
    });
    expect(result.report.flags).not.toContain("task_non_actionable");
  });
});

// ── L152 EqualityOperator (tokens.length < 4 vs <= 4) ─────────────────────────
describe("window check applies to exactly 4-token lines", () => {
  it("4-token output line NOT in transcript IS checked for mismatch (< not <=)", () => {
    // "finalize legal contract closure" = 4 tokens; not in transcript
    // < 4: 4<4=false → checked → mismatch; <= 4: 4<=4=true → skipped → no mismatch → kills mutant
    const result = runGroundingVerifier({
      transcript: "please send the email",
      summary: "finalize legal contract closure.",
      taskList: [],
      emailDraft: SHORT_EMAIL,
      policy: "warn",
    });
    expect(result.report.flags).toContain("token_window_mismatch");
  });
});

// ── L183 StringLiteral (comma separator in entity_mismatch) ───────────────────
describe("entity_mismatch flag format with multiple entities", () => {
  it("entity_mismatch flag has comma-separated entries for multiple leaked entities", () => {
    // "Follow", "John Smith", "Acme Corp" extracted → joined with ","
    // mutant "," → "": no comma in flag → test kills mutant
    const result = runGroundingVerifier({
      transcript: "please send the update",
      summary: "Follow up with John Smith and Acme Corp on the contract.",
      taskList: [],
      emailDraft: VALID_EMAIL,
      policy: "warn",
    });
    const mismatchFlag = result.report.flags.find((f) => f.startsWith("entity_mismatch:"));
    expect(mismatchFlag).toBeDefined();
    expect(mismatchFlag).toContain(",");
  });
});

// ── L192 Regex (^subject: anchor) ─────────────────────────────────────────────
describe("email subject anchor check", () => {
  it("email with 'subject:' in body but not at start still triggers email_subject_missing", () => {
    // Original ^subject:/i: not at start → flag
    // Mutant removes ^: matches anywhere → no flag → kills mutant
    const result = runGroundingVerifier({
      transcript: "please send the report",
      summary: "send report.",
      taskList: ["send report"],
      emailDraft: "Body only. The subject: is noted here.\n\nPlease review before sending.",
      policy: "warn",
    });
    expect(result.report.flags).toContain("email_subject_missing");
  });
});

// ── L197-L230 repair policy targeted kills ────────────────────────────────────
describe("repair policy — precision mutation kills", () => {
  it("repair with empty transcript and empty summary uses 'unavailable' fallback (kills L201 StringLiteral)", () => {
    // sentenceList("") = [] → join=" " → "" → fallback "Summary unavailable..."
    // L201 mutant "" → "": fallback="" → repaired.summary="" → test fails → kills mutant
    const result = runGroundingVerifier({
      transcript: "",
      summary: "",
      taskList: [],
      emailDraft: "subject: x\n\nplease review before sending.",
      policy: "repair",
    });
    expect(result.repaired.summary).not.toBe("");
    expect(result.repaired.summary.toLowerCase()).toContain("unavailable");
  });

  it("repair joins transcript sentences with space separator (kills L200 MethodExpression join)", () => {
    // join(" "): "Sentence one. Sentence two." — mutant join(""): "Sentence one.Sentence two."
    const result = runGroundingVerifier({
      transcript: "Please send status update. Schedule follow-up tomorrow.",
      summary: "",
      taskList: ["send update"],
      emailDraft: "subject: x\n\nPlease send status update. Schedule follow-up tomorrow. please review before sending.",
      policy: "repair",
    });
    expect(result.repaired.summary).toBe(
      "Please send status update. Schedule follow-up tomorrow.",
    );
  });

  it("repair with flags but grounded summary leaves summary unchanged (kills L198 EqualityOperator)", () => {
    // email_footer_missing flag forces repair block entry; L198: !summary||0>0=false → no change
    // L198 mutant >=0: 0>=0=true → always changes summary → test kills mutant
    const result = runGroundingVerifier({
      transcript: "please send the update to the team today",
      summary: "send the update to the team today.",
      taskList: ["send update to team"],
      emailDraft: "subject: x\n\nBody only.",
      policy: "repair",
    });
    expect(result.repaired.summary).toBe("send the update to the team today.");
  });

  it("repair policy with empty summary: ok is false because summary_empty flag (kills L230 StringLiteral)", () => {
    // score boosted to 75 by repair; ok = 75>=70 && !flags.includes("summary_empty") = false
    // L230 mutant "summary_empty"→"": flags.includes("")=false → ok=true → test kills mutant
    const result = runGroundingVerifier({
      transcript: "please send update today please review before sending",
      summary: "",
      taskList: ["send update today"],
      emailDraft: "subject: x\n\nplease review before sending.",
      policy: "repair",
    });
    expect(result.report.ok).toBe(false);
    expect(result.report.flags).toContain("summary_empty");
  });
});

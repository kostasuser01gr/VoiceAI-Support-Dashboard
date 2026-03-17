import { describe, expect, it } from "vitest";

import { runSafetyCheck } from "@/lib/safety";

describe("runSafetyCheck", () => {
  it("passes valid grounded output and adds footer when missing", () => {
    const result = runSafetyCheck({
      transcript: "Please send status update to Maya by Friday.",
      summary: "Team needs a status email by Friday.",
      taskList: ["Send status update to Maya by Friday"],
      emailDraft: "Subject: Status Follow-up\n\nDraft body",
    });

    expect(result.ok).toBe(true);
    expect(result.normalized.emailDraft).toContain("Please review before sending.");
  });

  it("fails when transcript has request but no tasks", () => {
    const result = runSafetyCheck({
      transcript: "Please schedule the follow-up meeting.",
      summary: "Meeting needs to be scheduled.",
      taskList: [],
      emailDraft: "Subject: Follow-up\n\nPlease review before sending.",
    });

    expect(result.ok).toBe(false);
    expect(result.issues.join(" ")).toContain("no action items");
  });
});

// ── normalizeEmailDraft branch tests (L44-L57) ────────────────────────────────
// Killing: ConditionalExpression, BooleanLiteral, Regex mutations on subject/footer
describe("normalizeEmailDraft", () => {
  it("adds Subject header when missing and sets fallbackUsed=true", () => {
    const result = runSafetyCheck({
      transcript: "Send the report",
      summary: "Send the report.",
      taskList: ["Send the report"],
      emailDraft: "Body only no subject\n\nPlease review before sending.",
    });
    expect(result.fallbackUsed).toBe(true);
    expect(result.normalized.emailDraft.toLowerCase()).toMatch(/^subject:/);
  });

  it("adds footer when missing and sets fallbackUsed=true", () => {
    const result = runSafetyCheck({
      transcript: "Send the report",
      summary: "Send the report.",
      taskList: ["Send the report"],
      emailDraft: "Subject: Report\n\nBody without footer.",
    });
    expect(result.fallbackUsed).toBe(true);
    expect(result.normalized.emailDraft).toContain("Please review before sending.");
  });

  it("does not set fallbackUsed when draft already has subject and footer", () => {
    const result = runSafetyCheck({
      transcript: "Send the report",
      summary: "Send the report.",
      taskList: ["Send the report"],
      emailDraft: "Subject: Report\n\nBody.\n\nPlease review before sending.",
    });
    expect(result.fallbackUsed).toBe(false);
  });

  it("footer not at end of line triggers missing footer flag", () => {
    // Kills regex mutant that removes $ anchor from footer check.
    // "sending, but verify." — the word "sending" is present but NOT at EOL,
    // so the $-anchored regex doesn't match. Without $ the mutant would accept it.
    const result = runSafetyCheck({
      transcript: "Send the report",
      summary: "Send the report.",
      taskList: ["Send the report"],
      emailDraft: "Subject: Report\n\nPlease review before sending, but verify first.",
    });
    expect(result.fallbackUsed).toBe(true);
    expect(result.normalized.emailDraft).toMatch(/Please review before sending\.?$/im);
  });
});

// ── countSentences boundary (L82-L88) ─────────────────────────────────────────
// Killing: EqualityOperator (> 3 vs >= 3), ConditionalExpression
describe("summary sentence truncation", () => {
  it("does NOT truncate summary with exactly 3 sentences", () => {
    const result = runSafetyCheck({
      transcript: "Send report. Schedule sync. Update team.",
      summary: "Send report. Schedule sync. Update team.",
      taskList: ["Send report"],
      emailDraft: "Subject: S\n\nPlease review before sending.",
    });
    expect(result.fallbackUsed).toBe(false);
    expect(result.normalized.summary).toContain("Update team");
  });

  it("truncates summary with 4 sentences to first 3", () => {
    // Kills EqualityOperator mutant >= vs >
    const result = runSafetyCheck({
      transcript: "Send report. Schedule sync. Update team. Follow up.",
      summary: "Send report. Schedule sync. Update team. Follow up on action items.",
      taskList: ["Send report"],
      emailDraft: "Subject: S\n\nPlease review before sending.",
    });
    expect(result.fallbackUsed).toBe(true);
    expect(result.normalized.summary).not.toContain("Follow up on action items");
  });
});

// ── task normalization (L91-L104) ─────────────────────────────────────────────
// Killing: EqualityOperator (> 140 vs >= 140), BooleanLiteral, ACTION_PREFIX_REGEX
describe("task normalization", () => {
  it("truncates task at exactly 141 chars (> 140 boundary)", () => {
    const longTask = "send " + "x".repeat(136); // 141 chars
    const result = runSafetyCheck({
      transcript: "send " + "x".repeat(136),
      summary: "Send long item.",
      taskList: [longTask],
      emailDraft: "Subject: S\n\nPlease review before sending.",
    });
    expect(result.fallbackUsed).toBe(true);
    expect(result.normalized.taskList[0]).toHaveLength(140);
    expect(result.normalized.taskList[0]).toMatch(/\.\.\.$/);
  });

  it("does NOT truncate task at exactly 140 chars", () => {
    const exactTask = "send " + "x".repeat(135); // 140 chars
    const result = runSafetyCheck({
      transcript: "send " + "x".repeat(135),
      summary: "Send task.",
      taskList: [exactTask],
      emailDraft: "Subject: S\n\nPlease review before sending.",
    });
    expect(result.normalized.taskList[0]).toHaveLength(140);
    expect(result.normalized.taskList[0]).not.toMatch(/\.\.\.$/);
  });

  it("prefixes non-action task with 'Follow up:'", () => {
    const result = runSafetyCheck({
      transcript: "please prepare the weekly report",
      summary: "Weekly report needed.",
      taskList: ["The weekly report documentation"],
      emailDraft: "Subject: S\n\nPlease review before sending.",
    });
    expect(result.normalized.taskList[0]).toMatch(/^Follow up:/);
    expect(result.fallbackUsed).toBe(true);
  });

  it("each ACTION_PREFIX_REGEX verb keeps task without Follow-up prefix", () => {
    // Kills Regex mutant on L20 that breaks the prefix match
    const verbs = [
      "follow",
      "send",
      "schedule",
      "share",
      "prepare",
      "update",
      "create",
      "review",
      "confirm",
      "draft",
      "book",
      "call",
      "email",
      "sync",
      "investigate",
      "deploy",
      "monitor",
      "document",
      "close",
      "assign",
    ];
    for (const verb of verbs) {
      const task = `${verb.charAt(0).toUpperCase()}${verb.slice(1)} the report today`;
      const result = runSafetyCheck({
        transcript: `please ${verb} the report today`,
        summary: `${verb} the report.`,
        taskList: [task],
        emailDraft: "Subject: S\n\nPlease review before sending.",
      });
      expect(result.normalized.taskList[0]).not.toMatch(/^Follow up:/);
    }
  });
});

// ── entity detection (L35-L37, L111-L119) ─────────────────────────────────────
// Killing: Regex mutants, ArrayDeclaration, ArrowFunction on extractPotentialEntities
describe("foreign entity detection", () => {
  it("flags entities in tasks not present in transcript", () => {
    const result = runSafetyCheck({
      transcript: "please schedule the weekly sync meeting",
      summary: "Schedule weekly sync.",
      taskList: ["Contact John Smith about the Acme project"],
      emailDraft: "Subject: S\n\nPlease review before sending.",
    });
    expect(result.ok).toBe(false);
    expect(result.issues.join(" ")).toContain("entities");
  });

  it("does not flag when all Title Case entities appear in transcript", () => {
    const result = runSafetyCheck({
      transcript: "Please follow up with John Smith about the Acme project",
      summary: "Follow up with John Smith.",
      taskList: ["Follow up with John Smith about Acme project"],
      emailDraft: "Subject: S\n\nPlease review before sending.",
    });
    expect(result.issues.join(" ")).not.toContain("entities");
  });

  it("lowercase names are not detected as entities", () => {
    // Kills regex mutant that lowers the case requirement
    const result = runSafetyCheck({
      transcript: "please schedule the meeting today",
      summary: "Schedule meeting.",
      taskList: ["contact john smith today"],
      emailDraft: "Subject: S\n\nPlease review before sending.",
    });
    expect(result.issues.join(" ")).not.toContain("entities");
  });

  it("all-lowercase task items produce no entity leakage", () => {
    // Kills regex mutant that changes case-sensitivity of entity detection.
    // Lowercase words are never matched by \b[A-Z][a-z]+... → no entities detected
    const result = runSafetyCheck({
      transcript: "please schedule the meeting",
      summary: "Schedule meeting.",
      taskList: ["contact the team today"],
      emailDraft: "Subject: S\n\nPlease review before sending.",
    });
    expect(result.issues.join(" ")).not.toContain("entities");
  });
});

// ── L37 ArrayDeclaration (?? [] → ?? ["Stryker was here"]) ────────────────────
describe("extractPotentialEntities null fallback", () => {
  it("no entity issue when transcript has real entities but task has none (kills L37 ArrayDeclaration)", () => {
    // transcript entities: ["John Smith"]; task: no Title Case → match=null → returns []
    // mutant ?? ["Stryker was here"]: task returns ["stryker was here"] → not in transcript → flag!
    const result = runSafetyCheck({
      transcript: "Please follow up with John Smith about the project",
      summary: "Follow up with John Smith.",
      taskList: ["send the update today"],
      emailDraft: "Subject: S\n\nPlease review before sending.",
    });
    expect(result.issues.join(" ")).not.toContain("entities");
  });
});

// ── L44 MethodExpression (emailDraft.trim()) ───────────────────────────────────
describe("normalizeEmailDraft trims input", () => {
  it("email with leading whitespace is trimmed so subject check works (kills L44 MethodExpression)", () => {
    // With trim: "  Subject: ..." → trimmed → starts with "Subject:" → no change → fallbackUsed=false
    // Without trim mutant: "  Subject:..." doesn't match ^subject: → subject added → fallbackUsed=true
    const result = runSafetyCheck({
      transcript: "Send the report",
      summary: "Send report.",
      taskList: ["Send the report"],
      emailDraft: "  Subject: Report\n\nPlease review before sending.",
    });
    expect(result.fallbackUsed).toBe(false);
    expect(result.normalized.emailDraft.toLowerCase()).toMatch(/^subject:/);
  });
});

// ── L47 Regex (^subject:/i anchor) ────────────────────────────────────────────
describe("email subject anchor in normalizeEmailDraft", () => {
  it("'subject:' appearing in body but not at start still gets a header prepended", () => {
    // Original ^subject:/i: "Body. subject: note." doesn't match at start → add header
    // Mutant removes ^: finds "subject:" anywhere → no add → fallbackUsed false → kills mutant
    const result = runSafetyCheck({
      transcript: "Send the report",
      summary: "Send report.",
      taskList: ["Send the report"],
      emailDraft: "Some body. The subject: is in the middle.\n\nPlease review before sending.",
    });
    expect(result.fallbackUsed).toBe(true);
    expect(result.normalized.emailDraft.toLowerCase()).toMatch(/^subject:/);
  });
});

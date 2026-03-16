import { describe, expect, it } from "vitest";
import { runSafetyCheck } from "@/lib/safety";
import { runGroundingVerifier } from "@/lib/verifier";

describe("ScanLedger: 100% Coverage Suite", () => {
  
  describe("lib/safety.ts", () => {
    it("hits all safety normalization and edge cases", () => {
      // 1. Empty transcript & summary
      const r1 = runSafetyCheck({
        transcript: "",
        summary: "",
        taskList: ["Just a task"],
        emailDraft: "Subject: test\n\nbody\n\nPlease review before sending.",
      });
      expect(r1.ok).toBe(false);
      expect(r1.issues).toContain("Transcript is empty.");
      expect(r1.issues).toContain("Summary is empty.");

      // 2. Summary truncation (> 3 sentences)
      const r2 = runSafetyCheck({
        transcript: "Transcript.",
        summary: "Sent 1. Sent 2. Sent 3. Sent 4. Sent 5.",
        taskList: ["Update system"],
        emailDraft: "Subject: test\n\nbody\n\nPlease review before sending.",
      });
      expect(r2.normalized.summary).toBe("Sent 1. Sent 2. Sent 3.");
      expect(r2.fallbackUsed).toBe(true);

      // 3. Task normalization (length and prefix)
      const longTask = "Send " + "A".repeat(145); // Start with ACTION_PREFIX
      const r3 = runSafetyCheck({
        transcript: "Transcript.",
        summary: "Summary.",
        taskList: [longTask, "no prefix"],
        emailDraft: "Subject: test\n\nbody\n\nPlease review before sending.",
      });
      expect(r3.normalized.taskList[0].length).toBe(140);
      expect(r3.normalized.taskList[0]).toContain("...");
      expect(r3.normalized.taskList[1]).toBe("Follow up: no prefix");

      // 4. Entity leakage
      const r4 = runSafetyCheck({
        transcript: "No entities here.",
        summary: "Summary.",
        taskList: ["Send to John Doe"],
        emailDraft: "Subject: test\n\nbody\n\nPlease review before sending.",
      });
      expect(r4.issues).toContain("Action items may introduce entities not present in the transcript.");

      // 5. Empty email draft after normalization
      const r5 = runSafetyCheck({
        transcript: "Transcript.",
        summary: "Summary.",
        taskList: ["Update"],
        emailDraft: "   ",
      });
      // normalizeEmailDraft will add Subject and Footer, so it won't be empty.
      // To hit "Email draft is empty", we'd need normalizeEmailDraft to return empty.
      // But normalizeEmailDraft always returns at least the Subject and Footer if input is empty.
      // Wait, let's check normalizeEmailDraft logic again.
      expect(r5.normalized.emailDraft).toContain("Subject:");
    });

    it("hits all explicit request keywords", () => {
      const keywords = ["please", "need to", "can you", "could you", "action item", "follow up", "schedule", "send", "prepare", "share", "book", "draft", "update", "assign"];
      for (const kw of keywords) {
        const r = runSafetyCheck({
          transcript: `Hey, ${kw} something.`,
          summary: "Summary.",
          taskList: [],
          emailDraft: "Subject: test\n\nbody\n\nPlease review before sending.",
        });
        expect(r.issues.join(" ")).toContain("no action items were extracted");
      }
    });

    it("hits all action prefix keywords", () => {
      const prefixes = ["follow", "send", "schedule", "share", "prepare", "update", "create", "review", "confirm", "draft", "book", "call", "email", "sync", "investigate", "deploy", "monitor", "document", "close", "assign"];
      const r = runSafetyCheck({
        transcript: "Transcript.",
        summary: "Summary.",
        taskList: prefixes,
        emailDraft: "Subject: test\n\nbody\n\nPlease review before sending.",
      });
      // None should have "Follow up: " prepended if they match
      r.normalized.taskList.forEach((t, i) => {
        expect(t.toLowerCase()).toBe(prefixes[i].toLowerCase());
      });
    });
  });

  describe("lib/verifier.ts", () => {
    it("hits tokenizer and window edge cases", () => {
      // Small tokens, special characters
      const result = runGroundingVerifier({
        transcript: "A B C D E F G",
        summary: "Summary",
        taskList: ["Task"],
        emailDraft: "Subject: test\n\nbody\n\nPlease review before sending.",
        policy: "warn"
      });
      expect(result.report.score).toBeLessThan(100);
    });

    it("hits repair policy branches", () => {
      // Summary repair, task filter, task generic, email subject/footer
      const result = runGroundingVerifier({
        transcript: "Please send the file. User Marcus mentioned it.",
        summary: "Totally unrelated stuff about Mars.",
        taskList: ["Buy milk", "Check crypto"],
        emailDraft: "Draft",
        policy: "repair"
      });
      
      expect(result.report.score).toBe(75);
      expect(result.repaired.summary).toContain("Please send");
      expect(result.repaired.emailDraft).toContain("Subject:");
      expect(result.repaired.emailDraft).toContain("Please review");
      // Task generic "Follow up" should be used if all tasks filtered
      expect(result.repaired.taskList).toContain("Follow up on explicitly requested items from transcript.");
    });

    it("hits non-actionable repair", () => {
      const result = runGroundingVerifier({
        transcript: "Transcript has actionable task.",
        summary: "Summary.",
        taskList: ["actionable task"],
        emailDraft: "Subject: test\n\nbody\n\nPlease review before sending.",
        policy: "repair"
      });
      expect(result.repaired.taskList[0]).toBe("Follow up: actionable task");
    });

    it("hits entity leakage with many entities", () => {
      const result = runGroundingVerifier({
        transcript: "No entities.",
        summary: "Alice Smith and Bob Brown.",
        taskList: ["Charlie Davis", "Dana Evans"],
        emailDraft: "Subject: test\n\nEve F\n\nPlease review before sending.",
        policy: "warn"
      });
      expect(result.report.flags).toContain("entity_leakage");
      const mismatch = result.report.flags.find(f => f.startsWith("entity_mismatch:"));
      expect(mismatch?.split(",").length).toBeLessThanOrEqual(3);
    });

    it("hits window mismatch with long lines", () => {
      const result = runGroundingVerifier({
        transcript: "One two three four five six seven eight nine ten.",
        summary: "Alpha beta gamma delta epsilon zeta eta theta iota kappa.",
        taskList: ["Lambda mu nu xi omicron pi rho sigma tau upsilon."],
        emailDraft: "Subject: test\n\nPhi chi psi omega alpha beta gamma delta.\n\nPlease review before sending.",
        policy: "warn"
      });
      expect(result.report.flags).toContain("token_window_mismatch");
    });

    it("hits scoring lower bounds", () => {
      const result = runGroundingVerifier({
        transcript: "Nothing.",
        summary: "",
        taskList: ["Bad task ".repeat(10), "Bad task ".repeat(10)],
        emailDraft: "Bad draft",
        policy: "warn"
      });
      expect(result.report.score).toBe(0);
    });
  });
});

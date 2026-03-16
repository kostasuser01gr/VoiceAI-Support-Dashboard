import fs from "node:fs";
import path from "node:path";

import { processPayload } from "@/app/api/process/route";
import { ProcessResponseSchema, type ProcessResponse } from "@/lib/schema";

type EvalFixture = {
  name: string;
  inputMode: "voice" | "text";
  text: string;
  presetId?: string;
  expectsTask: boolean;
};

function loadFixtures(): EvalFixture[] {
  const fixturesDir = path.join(process.cwd(), "eval", "fixtures");
  const files = fs
    .readdirSync(fixturesDir)
    .filter((file) => file.endsWith(".json"))
    .sort();

  return files.map((file) => {
    const raw = fs.readFileSync(path.join(fixturesDir, file), "utf8");
    return JSON.parse(raw) as EvalFixture;
  });
}

function sentenceCount(text: string) {
  return text
    .split(/[.!?]+/)
    .map((part) => part.trim())
    .filter(Boolean).length;
}

function hasAllAuditSteps(response: ProcessResponse) {
  const steps: ProcessResponse["auditTrail"][number]["step"][] = [
    "capture",
    "transcribe",
    "extract",
    "draft",
    "safety_check",
  ];

  const actual = response.auditTrail.map((entry) => entry.step);
  return steps.every((step) => actual.includes(step));
}

function hasVerifierAudit(response: ProcessResponse) {
  return response.auditTrail.some(
    (entry) => entry.step === "safety_check" && /verifier score:/i.test(entry.details),
  );
}

function makeStubResponse(params: {
  inputMode: "voice" | "text";
  transcript: string;
  requestId: string;
  presetId: string;
}): ProcessResponse {
  const firstSentence =
    params.transcript
      .split(/[.!?]/)
      .map((part) => part.trim())
      .find(Boolean) ?? "Transcript summary.";

  const hasRequest =
    /\b(please|need to|can you|could you|schedule|send|prepare|share|assign|update|create|must)\b/i.test(
      params.transcript,
    );

  const taskList = hasRequest
    ? [`Send follow-up based strictly on transcript details.`]
    : [];

  const summary = `${firstSentence}. Next steps are tracked.`;

  return {
    inputMode: params.inputMode,
    transcript: params.transcript,
    summary,
    actions: {
      taskList,
      emailDraft: `Subject: Follow-up\n\n${summary}\n\nPlease review before sending.`,
    },
    intelligence: {
      topics: [],
      entities: [],
      urgency: "low",
      sentiment: "neutral",
      openLoops: [],
    },
    auditTrail: [
      {
        step: "capture",
        timestamp: "2026-03-02T10:00:00.000Z",
        details: "Captured",
      },
      {
        step: "transcribe",
        timestamp: "2026-03-02T10:00:00.000Z",
        details: "Transcribed",
      },
      {
        step: "extract",
        timestamp: "2026-03-02T10:00:00.000Z",
        details: "Extracted",
      },
      {
        step: "draft",
        timestamp: "2026-03-02T10:00:00.000Z",
        details: "Drafted",
      },
      {
        step: "safety_check",
        timestamp: "2026-03-02T10:00:00.000Z",
        details: "Checked",
      },
    ],
    meta: {
      requestId: params.requestId,
      model: "gemini-2.0-flash",
      latencyMs: 42,
      validation: "passed",
      fallbackUsed: false,
      approvalRequired: false,
    },
  };
}

async function run() {
  const fixtures = loadFixtures();
  let passed = 0;
  let failed = 0;

  for (const fixture of fixtures) {
    try {
      const requestId = `eval-${fixture.name}`;
      const response = await processPayload(
        {
          inputMode: fixture.inputMode,
          text: fixture.text,
          presetId: fixture.presetId,
        },
        {
          requestId,
          now: () => "2026-03-02T10:00:00.000Z",
          nowMs: () => 1_000,
          generateStructuredResponse: async ({
            inputMode,
            transcript,
            requestId: generatedRequestId,
            preset,
          }) => ({
            output: makeStubResponse({
              inputMode,
              transcript,
              requestId: generatedRequestId,
              presetId: preset.id,
            }),
            model: "gemini-2.0-flash",
          }),
        },
      );

      ProcessResponseSchema.parse(response);

      const checks = {
        schema: true,
        audit: hasAllAuditSteps(response),
        verifier: hasVerifierAudit(response),
        summarySentences: sentenceCount(response.summary) >= 1 && sentenceCount(response.summary) <= 3,
        tasksPresent: !fixture.expectsTask || response.actions.taskList.length >= 1,
        actionLikeTasks:
          !fixture.expectsTask ||
          response.actions.taskList.some((task) =>
            /\b(follow|send|schedule|prepare|update|assign|review|book|confirm)\b/i.test(
              task,
            ),
          ),
        emailSubject:
          response.actions.emailDraft.trim().length > 0 &&
          /^subject:/i.test(response.actions.emailDraft),
      };

      const isPass = Object.values(checks).every(Boolean);

      if (isPass) {
        passed += 1;
        console.log(`PASS  ${fixture.name}`);
      } else {
        failed += 1;
        console.log(`FAIL  ${fixture.name} ${JSON.stringify(checks)}`);
      }
    } catch (error) {
      failed += 1;
      console.log(
        `FAIL  ${fixture.name} ${(error as Error).message || String(error)}`,
      );
    }
  }

  console.log("\nEval report");
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();

import { google } from "@ai-sdk/google";
import { streamObject } from "ai";
import { z } from "zod";

export const runtime = "edge";
export const maxDuration = 30;

// We use a simplified schema specifically optimized for fast streaming.
// The frontend will merge this with its local context (like audit trails).
const StreamingResponseSchema = z.object({
  summary: z.string().describe("A concise 2-3 sentence summary of the transcript."),
  actions: z.object({
    taskList: z.array(z.string()).describe("A list of clear, actionable tasks extracted from the transcript."),
    emailDraft: z.string().describe("A professional email draft summarizing the status or tasks."),
  }),
});

export async function POST(req: Request) {
  try {
    const { text, inputMode } = await req.json();

    const result = await streamObject({
      model: google("gemini-2.5-flash"),
      schema: StreamingResponseSchema,
      prompt: `You are an elite, hyper-intelligent Voice-to-Action agent. 
      Analyze the following transcript (captured via ${inputMode}). 
      1. Write a professional summary.
      2. Extract a list of actionable tasks.
      3. Draft a follow-up email based on the context.
      
      Transcript:
      ${text}`,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error("Streaming error", error);
    return new Response(JSON.stringify({ error: "Streaming request failed." }), { status: 500 });
  }
}

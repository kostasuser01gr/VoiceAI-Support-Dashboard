import { google } from "@ai-sdk/google";
import { generateObject, generateText, tool } from "ai";
import { z } from "zod";

export async function orchestrateMasterAgents(transcript: string) {
  console.log("🚀 Initializing Multi-Agent Orchestration...");

  // Agent 1: The Extractor
  const extraction = await generateObject({
    model: google("gemini-2.5-flash"),
    schema: z.object({
      entities: z.array(z.string()).describe("Key people, companies, or products mentioned"),
      topics: z.array(z.string()).describe("Business topics (e.g., sales, engineering, HR)"),
      urgency: z.enum(["high", "medium", "low"]),
      sentiment: z.enum(["positive", "neutral", "negative"])
    }),
    prompt: `Analyze this transcript deeply. Extract core entities, assign business topics, and judge urgency and sentiment.\n\nTranscript: ${transcript}`
  });

  // Agent 2: The Executor
  const execution = await generateText({
    model: google("gemini-2.5-pro"),
    tools: {
      createJiraTicket: tool({
        description: "Create a ticket for engineering or product tasks",
        parameters: z.object({ title: z.string(), description: z.string() })
      } as any),
      draftEmail: tool({
        description: "Draft a follow up email to the client or team",
        parameters: z.object({ subject: z.string(), body: z.string() })
      } as any)
    },
    prompt: `Based on the following transcript and its extracted metadata (${JSON.stringify(extraction.object)}), determine the exact actions needed and execute the necessary tools.\n\nTranscript: ${transcript}`
  });

  // Agent 3: The Critic
  const critic = await generateObject({
    model: google("gemini-2.5-flash"),
    schema: z.object({
      score: z.number().min(0).max(100),
      feedback: z.string(),
      approved: z.boolean()
    }),
    prompt: `Review the actions taken by the executor: ${JSON.stringify(execution.toolResults)}. 
    Are they safe, appropriate, and fully grounded in the original transcript? Provide a quality score and strict feedback.
    
    Original Transcript: ${transcript}`
  });

  return {
    intelligence: extraction.object,
    actions: execution.toolResults,
    critic: critic.object
  };
}

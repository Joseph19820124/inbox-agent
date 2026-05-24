/**
 * inbox-agent — Brain · Hands · Loop reference build
 *
 * Adapted from the AI Accelerator's Agent Architecture Build Guide (2026),
 * with one structural change for cost / latency / sovereignty:
 *
 *   Skool guide:  OpenRouter ───► (Claude | GPT | Gemini)
 *   This file:    @ai-sdk/anthropic ───► Claude (direct billing, no markup,
 *                                                no middleman, no OAuth bypass)
 *
 * To swap brain to GPT-5 / Gemini, just `npm i @ai-sdk/openai` (or google),
 * import its provider, and change ONE constant (MODEL). The Loop and Hands
 * don't move.
 *
 * Run:
 *   npx tsx agent.ts                     # real run (requires env vars)
 *   DRY_RUN=1 npx tsx agent.ts           # mock run (no API calls, verifies structure)
 */

import "dotenv/config";
import { z } from "zod";
import { generateText, tool, stepCountIs, type LanguageModel } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { createZapierSdk } from "@zapier/zapier-sdk";

// ────────────────────────────────────────────────────────────────────
// CONFIG
// ────────────────────────────────────────────────────────────────────

/** The Brain. One line. Swap providers by changing this + the import. */
function makeBrain(): LanguageModel {
  if (process.env.DRY_RUN === "1") {
    // Mock brain: scripted 2-step plan (search → DM) — no API calls.
    let step = 0;
    return new MockLanguageModelV3({
      doGenerate: (async () => {
        step++;
        if (step === 1) {
          return {
            finishReason: "tool-calls" as const,
            usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
            content: [
              {
                type: "tool-call" as const,
                toolCallId: "call_1",
                toolName: "read_recent_emails",
                input: JSON.stringify({ query: "is:unread newer_than:1d" }),
              },
            ],
            warnings: [],
          };
        }
        if (step === 2) {
          return {
            finishReason: "tool-calls" as const,
            usage: { inputTokens: 30, outputTokens: 40, totalTokens: 70 },
            content: [
              {
                type: "tool-call" as const,
                toolCallId: "call_2",
                toolName: "send_slack_dm",
                input: JSON.stringify({
                  text:
                    "URGENT (1): alice@nike.com — Q3 platform migration sync reschedule\n" +
                    "WORK (0): —\n" +
                    "NOISE (2): newsletters/recruiters archived",
                }),
              },
            ],
            warnings: [],
          };
        }
        return {
          finishReason: "stop" as const,
          usage: { inputTokens: 5, outputTokens: 10, totalTokens: 15 },
          content: [{ type: "text" as const, text: "Digest sent." }],
          warnings: [],
        };
      }) as never,
    });
  }
  // Brain selection via env var BRAIN=claude|gemini|openai (default: claude)
  switch (process.env.BRAIN ?? "claude") {
    case "gemini":
      return google("gemini-3-pro");                      // needs GOOGLE_GENERATIVE_AI_API_KEY
    // case "openai":
    //   return openai("gpt-5.1");                         // needs @ai-sdk/openai + OPENAI_API_KEY
    case "claude":
    default:
      return anthropic("claude-opus-4-7");                // needs ANTHROPIC_API_KEY
  }
}

/** Owner email — used to look up the Slack user to DM. */
const MY_EMAIL = process.env.MY_EMAIL ?? "joseph.siyi@gmail.com";

/** Max iterations of the brain↔hands cycle before forced stop. */
const MAX_STEPS = 15;

/** Dry-run lets us verify loop structure without real API calls. */
const DRY_RUN = process.env.DRY_RUN === "1";

// ────────────────────────────────────────────────────────────────────
// HANDS — wrap real-world side effects as tools the model can call.
// ────────────────────────────────────────────────────────────────────

interface Hands {
  searchEmails: (query: string) => Promise<EmailSummary[]>;
  dmSelf: (text: string) => Promise<{ ok: boolean; ts: string }>;
}

interface EmailSummary {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  receivedAt: string;
}

/** Real hands: route through Zapier SDK (production path).
 *
 * ⚠️ Day-14 verification step: the actionKey strings below ("find_email",
 * "send_direct_message", "find_user_by_email") are best-guess. Before running
 * for real, run:
 *
 *   npx zapier-sdk list-actions gmail
 *   npx zapier-sdk list-actions slack
 *
 * and adjust the actionType + actionKey to match what your Zapier account
 * actually exposes. The structure here is what matters; the exact keys are
 * a 5-minute verification.
 */
async function makeZapierHands(): Promise<Hands> {
  const zapier = createZapierSdk();

  const gmailConnResp = await zapier.findFirstConnection({ app: "gmail", owner: "me" });
  const slackConnResp = await zapier.findFirstConnection({ app: "slack", owner: "me" });
  const gmailConnId = gmailConnResp?.data?.id;
  const slackConnId = slackConnResp?.data?.id;
  if (!gmailConnId || !slackConnId) {
    throw new Error(
      "Missing Gmail or Slack connection in Zapier. " +
        "Set them up at https://zapier.com/app/connections first.",
    );
  }

  // Look up the Slack user ID for MY_EMAIL so we can DM ourselves.
  const lookupRes = (await zapier.runAction({
    app: "slack",
    actionType: "search",
    action: "find_user_by_email",
    connection: slackConnId,
    inputs: { email: MY_EMAIL },
  } as never)) as { data?: { id?: string } } | undefined;
  const slackUserId = lookupRes?.data?.id;
  if (!slackUserId) {
    throw new Error(`Could not find Slack user for ${MY_EMAIL}`);
  }

  return {
    searchEmails: async (query) => {
      const res = (await zapier.runAction({
        app: "gmail",
        actionType: "search",
        action: "find_email",
        connection: gmailConnId,
        inputs: { search_string: query, max_results: 20 },
      } as never)) as { data?: { emails?: EmailSummary[] } } | undefined;
      return (res?.data?.emails ?? []).slice(0, 20);
    },
    dmSelf: async (text) => {
      const res = (await zapier.runAction({
        app: "slack",
        actionType: "write",
        action: "send_direct_message",
        connection: slackConnId,
        inputs: { user: slackUserId, text },
      } as never)) as { data?: { ts?: string } } | undefined;
      return { ok: true, ts: String(res?.data?.ts ?? Date.now()) };
    },
  };
}

/** Mock hands for DRY_RUN — same interface, no API calls. */
function makeMockHands(): Hands {
  return {
    searchEmails: async (query) => {
      console.log(`[mock] searchEmails(${JSON.stringify(query)})`);
      return [
        {
          id: "m1",
          from: "alice@nike.com",
          subject: "Q3 platform migration sync",
          snippet: "Hey Joseph — can we move the sync to Thursday 3pm?",
          receivedAt: "2026-05-24T08:00:00Z",
        },
        {
          id: "m2",
          from: "newsletter@vercel.com",
          subject: "What's new in v0 this week",
          snippet: "5 new features dropped including...",
          receivedAt: "2026-05-24T07:30:00Z",
        },
        {
          id: "m3",
          from: "recruiter@coldoutreach.io",
          subject: "I came across your profile",
          snippet: "Great fit for our senior cloud role at $240/day...",
          receivedAt: "2026-05-24T07:00:00Z",
        },
      ];
    },
    dmSelf: async (text) => {
      console.log(`[mock] dmSelf:\n${text}\n`);
      return { ok: true, ts: `mock-${Date.now()}` };
    },
  };
}

// ────────────────────────────────────────────────────────────────────
// LOOP — wire hands as tools the brain can invoke, then run the cycle.
// ────────────────────────────────────────────────────────────────────

async function main() {
  const hands = DRY_RUN ? makeMockHands() : await makeZapierHands();
  const brain = makeBrain();

  const result = await generateText({
    model: brain,
    stopWhen: stepCountIs(MAX_STEPS),
    tools: {
      read_recent_emails: tool({
        description:
          "Search Gmail for emails. Use Gmail search syntax (e.g. 'is:unread newer_than:1d'). Returns up to 20 emails.",
        inputSchema: z.object({
          query: z
            .string()
            .describe("Gmail search query, e.g. 'is:unread newer_than:1d'"),
        }),
        execute: async ({ query }) => hands.searchEmails(query),
      }),

      send_slack_dm: tool({
        description:
          "Post a Slack DM to me. Use this exactly once at the end with a 3-line digest of what needs my attention.",
        inputSchema: z.object({
          text: z.string().describe("The digest text to DM"),
        }),
        execute: async ({ text }) => hands.dmSelf(text),
      }),
    },
    prompt: [
      "You are an inbox triage assistant running unattended.",
      "",
      "1. Use read_recent_emails to fetch the last 20 unread emails ('is:unread newer_than:1d').",
      "2. Classify each into URGENT (needs reply today), WORK (read but not urgent), or NOISE (newsletter/recruiter spam).",
      "3. At the end, call send_slack_dm exactly once with a 3-line summary:",
      "   line 1: URGENT count + the most important item",
      "   line 2: WORK count + 1-line",
      "   line 3: NOISE count (no detail)",
      "",
      "Be terse. Do not call any tool more than necessary.",
    ].join("\n"),
  });

  console.log("\n──── final text ────");
  console.log(result.text);
  console.log("\n──── steps ────");
  console.log(`Steps used: ${result.steps?.length ?? "?"}`);
}

main().catch((err) => {
  console.error("Agent failed:", err);
  process.exit(1);
});

# inbox-agent

Pre-baked Brain · Hands · Loop reference build for **Day 14 (Week 2 bonus)** of the [Anthropic Academy plan](https://github.com/Joseph19820124/anthropic-academy-plan) — see [BONUS_AGENT_BUILD.md](https://joseph19820124.github.io/anthropic-academy-plan/BONUS_AGENT_BUILD) for curriculum context.

> **Why this exists.** The AI Accelerator's "Agent Architecture Build Guide" (Skool community, 2026) shows how to build a multi-LLM agent in ~50 lines using OpenRouter. **This is the senior-engineer adaptation**: direct provider SDKs (no OpenRouter middleman), hermetic `DRY_RUN` mode for architecture-without-quota-burn verification, and runtime `BRAIN=claude|gemini` switching.

**Current state: 100% scaffolded + structurally verified.** All dependencies installed, TypeScript clean, `DRY_RUN=1` mock loop runs end-to-end. Day 14 to-do: drop in real API keys + verify Zapier action keys.

## What's already done

- ✅ Project scaffold (`package.json`, `tsconfig.json`, `.gitignore`)
- ✅ All 8 npm packages installed (no further `npm install` needed)
- ✅ `agent.ts` written — full Brain/Hands/Loop in ~190 lines
- ✅ TypeScript `--strict` clean
- ✅ Hermetic dry-run mode (`DRY_RUN=1`) — mocks both brain and hands, verifies architecture without any API calls
- ✅ `.env.example` documenting required env vars

## What Day 14 still needs (≤30 min)

1. **Anthropic API key** — get one at <https://console.anthropic.com/settings/keys>, save to `.env` (copy `.env.example` → `.env`)
2. **Zapier connections** — connect Gmail + Slack at <https://zapier.com/app/connections>
3. **Zapier SDK login** — run once: `npx zapier-sdk login`
4. **Verify action keys** — run:
   ```bash
   npx zapier-sdk list-actions gmail
   npx zapier-sdk list-actions slack
   ```
   and confirm the action names used in `agent.ts` (`find_email`, `send_direct_message`, `find_user_by_email`) match what your Zapier account exposes. If different, edit `agent.ts` accordingly. **5-minute task.**
5. Run: `npx tsx agent.ts`

## Architecture

```text
┌──────────┐       ┌──────────┐       ┌──────────┐
│  BRAIN   │ ◄────►│   LOOP   │ ◄────►│  HANDS   │
│ Anthropic│       │ ai@^6    │       │ Zapier   │
│  Claude  │       │ generate-│       │ SDK →    │
│ via direct       │ Text +   │       │ Gmail +  │
│ provider │       │ tools    │       │ Slack    │
└──────────┘       └──────────┘       └──────────┘
```

**Three deliberate deviations from the Skool guide:**

1. **No OpenRouter.** Direct `@ai-sdk/anthropic`. Saves ~5% markup and 100-300ms per call. Cost: lose multi-provider one-key billing (you have direct API access anyway).
2. **`makeBrain()` is a function, not a constant.** Lets `DRY_RUN=1` swap in `MockLanguageModelV3` from `ai/test` — verifies architecture without burning any quota.
3. **`Hands` is a TypeScript interface.** Both real-Zapier and mock implementations satisfy it. Lets you swap one without touching the loop.

## Files

| File | Purpose |
|------|---------|
| `agent.ts` | The whole agent — Brain config, real & mock hands, loop |
| `package.json` | Dependency manifest (all 8 packages installed) |
| `tsconfig.json` | Strict TS config, ES2022 + ESM |
| `.env.example` | Template for required env vars |
| `.gitignore` | Excludes `.env` and `node_modules` |

## Verify the scaffold

Run the dry-run to confirm everything's wired:

```bash
DRY_RUN=1 npx tsx agent.ts
```

Expected output:

```text
[mock] searchEmails("is:unread newer_than:1d")
[mock] dmSelf:
URGENT (1): alice@nike.com — Q3 platform migration sync reschedule
WORK (0): —
NOISE (2): newsletters/recruiters archived

──── final text ────
Digest sent.

──── steps ────
Steps used: 3
```

If you see that, the scaffold is good. Day 14 is just plumbing real APIs in.

## Swapping the brain (one line)

After the real run works, prove the "one line swap" claim:

```typescript
// In agent.ts, makeBrain() function:
return anthropic("claude-opus-4-7");        // default
// Swap to (after `npm i @ai-sdk/openai` + adding the import):
// return openai("gpt-5.1");
// Swap to (after `npm i @ai-sdk/google` + adding the import):
// return google("gemini-3-pro");
```

Rerun `npx tsx agent.ts` — same agent, different brain.

## Variant B (optional extension, 60 min)

Replace Zapier hands with a custom MCP server. Scaffold:

```bash
mkdir mcp-mail && cd mcp-mail
npm init -y && npm pkg set type=module
npm install @modelcontextprotocol/sdk googleapis
# Implement two tools — read_recent_emails, send_digest — using
# Gmail API via googleapis (not via Zapier).
```

Wire it in `agent.ts` via Vercel AI SDK's MCP client. This proves you can ship the same agent on a stack you fully own (no Zapier middleman). See [BONUS_AGENT_BUILD.md](https://github.com/Joseph19820124/anthropic-academy-plan/blob/main/BONUS_AGENT_BUILD.md) for the full plan.

## Reflection log (the actual deliverable)

After running both variants (or just variant A), create `REFLECTION.md` answering:

1. Which hand layer felt better for personal use? (Zapier or custom MCP)
2. Which would you ship to a non-technical friend?
3. Where did the "one-line brain swap" claim hold up?
4. What's worth pulling into `codex-oauth-client` / `gemini-codeassist-client`?

Then commit it to `artifacts/bonus/` in the [anthropic-academy-plan repo](https://github.com/Joseph19820124/anthropic-academy-plan).

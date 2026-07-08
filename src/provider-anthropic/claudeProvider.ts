/**
 * Claude (Anthropic) provider - implements ReviewProvider by asking Claude
 * to fill in a "submit_review" tool call whose input mirrors
 * RawReviewPayload exactly, then adapts that tool call into a RawReview.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { RawReview, ReviewContext, ReviewProvider } from "../shared/types.js";

export const DEFAULT_CLAUDE_MODEL = "claude-sonnet-5";

export interface ClaudeProviderOptions {
  apiKey?: string;
  model?: string;
  maxOutputTokens?: number;
}

const SUBMIT_REVIEW_TOOL_NAME = "submit_review";

const submitReviewTool: Anthropic.Tool = {
  name: SUBMIT_REVIEW_TOOL_NAME,
  description:
    "Submit the code review findings: an overall summary plus a list of issues discovered in the diff.",
  input_schema: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description: "A concise, high-level summary of the overall review.",
      },
      issues: {
        type: "array",
        description: "The list of individual issues found while reviewing the diff.",
        items: {
          type: "object",
          properties: {
            severity: {
              type: "string",
              enum: ["critical", "high", "medium", "low"],
              description: "How severe this issue is.",
            },
            category: {
              type: "string",
              enum: ["security", "performance", "architecture", "style", "bug"],
              description: "The category this issue falls under.",
            },
            title: {
              type: "string",
              description: "A short, human-readable title for the issue.",
            },
            description: {
              type: "string",
              description: "A detailed explanation of the issue.",
            },
            file: {
              type: "string",
              description: "The path of the file this issue was found in.",
            },
            line: {
              type: "number",
              description: "The line number in the file where this issue occurs.",
            },
            suggestion: {
              type: "string",
              description: "A concrete suggestion for how to fix or address the issue.",
            },
            confidence: {
              type: "number",
              description: "A confidence score (0 to 1) that this issue is a real, valid finding.",
            },
          },
          required: [
            "severity",
            "category",
            "title",
            "description",
            "file",
            "line",
            "suggestion",
            "confidence",
          ],
        },
      },
    },
    required: ["summary", "issues"],
  },
};

export class ClaudeProvider implements ReviewProvider {
  readonly name = "claude" as const;

  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxOutputTokens: number;

  constructor(options: ClaudeProviderOptions = {}) {
    const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Missing Anthropic API key. Set the ANTHROPIC_API_KEY environment variable, or pass { apiKey } when constructing ClaudeProvider.",
      );
    }

    this.model = options.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_CLAUDE_MODEL;
    this.maxOutputTokens = options.maxOutputTokens ?? 4096;
    this.client = new Anthropic({ apiKey });
  }

  async review(context: ReviewContext): Promise<RawReview> {
    if (!context.prompt) {
      throw new Error(
        "ReviewContext.prompt is not set - run the Prompt Builder (buildPrompt) before calling provider.review().",
      );
    }

    const start = Date.now();

    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxOutputTokens,
        system: context.prompt.system,
        messages: [{ role: "user", content: context.prompt.user }],
        tools: [submitReviewTool],
        tool_choice: { type: "tool", name: SUBMIT_REVIEW_TOOL_NAME },
      });
    } catch (err) {
      throw new Error(
        "Anthropic API request failed: " + (err instanceof Error ? err.message : String(err)),
        { cause: err },
      );
    }

    const toolUseBlock = response.content.find(
      (block): block is Anthropic.ToolUseBlock =>
        block.type === "tool_use" && block.name === SUBMIT_REVIEW_TOOL_NAME,
    );

    if (!toolUseBlock) {
      throw new Error("Claude did not return a submit_review tool call.");
    }

    const input = toolUseBlock.input as Partial<{
      summary: string;
      issues: RawReview["payload"]["issues"];
    }>;

    const summary = input.summary ?? "";
    const issues = input.issues ?? [];

    return {
      payload: { summary, issues },
      provider: this.name,
      model: this.model,
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Shared base for any ReviewProvider that speaks the OpenAI chat-completions
 * wire format - OpenAI itself, and OpenAI-compatible endpoints (NVIDIA NIM,
 * Ollama's /v1 API). Each concrete provider (provider-openai, provider-nvidia,
 * provider-ollama) just supplies its own api key / model / base URL defaults
 * and delegates review() to the reviewer this factory returns.
 */
import OpenAI from "openai";
import type { RawReview, RawReviewIssue, ReviewContext, ReviewProvider } from "./types.js";

export interface OpenAICompatibleProviderOptions {
  providerName: string;
  apiKey: string;
  model: string;
  baseURL?: string;
  maxOutputTokens?: number;
}

const SUBMIT_REVIEW_FUNCTION_NAME = "submit_review";

function buildSubmitReviewTool(): OpenAI.Chat.Completions.ChatCompletionTool {
  return {
    type: "function",
    function: {
      name: SUBMIT_REVIEW_FUNCTION_NAME,
      description:
        "Submit the code review findings: an overall summary plus a list of issues discovered in the diff.",
      parameters: {
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
                title: { type: "string", description: "A short, human-readable title for the issue." },
                description: { type: "string", description: "A detailed explanation of the issue." },
                file: { type: "string", description: "The path of the file this issue was found in." },
                line: { type: "number", description: "The line number in the file where this issue occurs." },
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
    },
  };
}

const submitReviewTool = buildSubmitReviewTool();

/**
 * Builds a ReviewProvider that talks to any OpenAI chat-completions-compatible
 * endpoint, forcing structured output via a named tool call (mirrors how
 * ClaudeProvider forces its submit_review tool use).
 */
export function createOpenAICompatibleReviewer(
  options: OpenAICompatibleProviderOptions,
): ReviewProvider {
  const client = new OpenAI({ apiKey: options.apiKey, baseURL: options.baseURL });

  return {
    name: options.providerName,

    async review(context: ReviewContext): Promise<RawReview> {
      if (!context.prompt) {
        throw new Error(
          "ReviewContext.prompt is not set - run the Prompt Builder (buildPrompt) before calling provider.review().",
        );
      }

      const start = Date.now();

      let response: OpenAI.Chat.Completions.ChatCompletion;
      try {
        response = await client.chat.completions.create({
          model: options.model,
          max_tokens: options.maxOutputTokens ?? 4096,
          messages: [
            { role: "system", content: context.prompt.system },
            { role: "user", content: context.prompt.user },
          ],
          tools: [submitReviewTool],
          tool_choice: { type: "function", function: { name: SUBMIT_REVIEW_FUNCTION_NAME } },
        });
      } catch (err) {
        throw new Error(
          `${options.providerName} API request failed: ${err instanceof Error ? err.message : String(err)}`,
          { cause: err },
        );
      }

      const toolCall = response.choices[0]?.message?.tool_calls?.find(
        (call): call is OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall =>
          call.type === "function" && call.function.name === SUBMIT_REVIEW_FUNCTION_NAME,
      );

      if (!toolCall) {
        throw new Error(
          `${options.providerName} did not return a submit_review tool call. Make sure the selected ` +
            `model ("${options.model}") supports tool/function calling.`,
        );
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(toolCall.function.arguments);
      } catch (err) {
        throw new Error(
          `${options.providerName} returned malformed JSON for the submit_review tool call arguments.`,
          { cause: err },
        );
      }

      const input = parsed as Partial<{ summary: string; issues: RawReviewIssue[] }>;

      return {
        payload: {
          summary: input.summary ?? "",
          issues: input.issues ?? [],
        },
        provider: options.providerName,
        model: options.model,
        durationMs: Date.now() - start,
      };
    },
  };
}

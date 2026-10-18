import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { modelOutput, parseInput } from "../../lib/validation/ai";
import { AppError } from "../../lib/http/errors";
import {
  parsingContext,
  parsingInstruction,
  validateModelOutput,
} from "./parser";

export function createGeminiParser(apiKey: string | undefined, model: string) {
  return async (
    input: z.infer<typeof parseInput>,
    timeZone: string,
    now: Date,
    signal?: AbortSignal,
  ) => {
    if (!apiKey)
      throw new AppError(
        503,
        "ai_unavailable",
        "Text interpretation is unavailable. You can still enter your reminder manually.",
      );
    const client = new GoogleGenAI({
      apiKey,
      httpOptions: { timeout: 25_000, retryOptions: { attempts: 1 } },
    });
    const deadline = AbortSignal.timeout(25_000);
    try {
      const result = await client.models.generateContent({
        model,
        contents: parsingContext(input, timeZone, now),
        config: {
          systemInstruction: parsingInstruction,
          responseMimeType: "application/json",
          responseJsonSchema: z.toJSONSchema(modelOutput),
          maxOutputTokens: 2048,
          abortSignal: signal ? AbortSignal.any([signal, deadline]) : deadline,
        },
      });
      return validateModelOutput(result.text ?? "", timeZone);
    } catch (error) {
      if (error instanceof AppError) throw error;
      const status =
        typeof error === "object" && error !== null && "status" in error
          ? Number(error.status)
          : 0;
      if (status === 429)
        throw new AppError(
          429,
          "ai_capacity",
          "Text interpretation is busy. Wait a minute or enter your reminder manually.",
        );
      if (deadline.aborted)
        throw new AppError(
          504,
          "ai_timeout",
          "Text interpretation took too long. Try again or enter your reminder manually.",
        );
      throw new AppError(
        503,
        "ai_unavailable",
        "Text interpretation is unavailable right now. Your input is still here; try again or enter it manually.",
      );
    }
  };
}

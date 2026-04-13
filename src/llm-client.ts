// src/llm-client.ts
/**
 * MiniMax LLM Client — thin wrapper around theclawbay API.
 * Used by finance-risk modules for CFO-ready narrative generation.
 */

export interface LLMCallParams {
  prompt: string;
  system?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LLMResponse {
  text: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Call the MiniMax Codex API with Bearer auth.
 * Returns the text of the completion, or empty string on failure.
 */
export async function callMiniMaxLLM(params: LLMCallParams): Promise<string> {
  const { prompt, system, maxTokens = 512, temperature = 0.3 } = params;

  const body: Record<string, unknown> = {
    model: "mini",
    messages: [
      ...(system ? [{ role: "system", content: system }] : []),
      { role: "user", content: prompt },
    ],
    max_tokens: maxTokens,
    temperature,
  };

  try {
    const res = await fetch("https://api.theclawbay.com/backend-api/codex", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.MINIMAX_API_KEY ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.warn(`[llm-client] API error ${res.status}`);
      return "";
    }

    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }>; text?: string; error?: unknown };

    // OpenAI-compatible response shape
    if (data.choices?.[0]?.message?.content) {
      return data.choices[0].message.content;
    }
    // Alternative / legacy shape
    if (typeof data.text === "string") {
      return data.text;
    }
    return "";
  } catch (err) {
    console.warn(`[llm-client] request failed:`, err);
    return "";
  }
}
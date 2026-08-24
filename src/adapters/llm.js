function endpoint(baseUrl, pathname) {
  return new URL(pathname.replace(/^\//, ""), `${baseUrl.replace(/\/$/, "")}/`).toString();
}

export async function runLlmChat(input, context) {
  const config = { ...context.settings.services.llm, ...(input.service ?? {}) };
  const messages = normalizeMessages(input);

  if (context.dryRun) {
    return {
      provider: config.provider,
      model: input.model ?? config.model,
      content: input.mockResponse ?? "DRY_RUN_LLM_RESPONSE",
      parsed: input.parseJson ? {} : undefined
    };
  }

  const headers = { "content-type": "application/json" };
  if (config.tokenEnv && process.env[config.tokenEnv]) {
    headers.authorization = `Bearer ${process.env[config.tokenEnv]}`;
  }

  let url;
  let body;
  if (config.provider === "ollama") {
    url = endpoint(config.baseUrl, "/api/chat");
    body = {
      model: input.model ?? config.model,
      messages,
      stream: false,
      format: input.parseJson ? "json" : undefined,
      options: input.options
    };
  } else if (config.provider === "openai-compatible") {
    url = endpoint(config.baseUrl, "/v1/chat/completions");
    body = {
      model: input.model ?? config.model,
      messages,
      temperature: input.temperature ?? 0.2,
      response_format: input.parseJson ? { type: "json_object" } : undefined
    };
  } else {
    throw new Error(`Unsupported LLM provider '${config.provider}'`);
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(context.timeoutMs)
  });
  if (!response.ok) throw new Error(`LLM HTTP ${response.status}: ${await response.text()}`);
  const payload = await response.json();
  const content = config.provider === "ollama"
    ? payload.message?.content
    : payload.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("LLM response did not contain message content");

  return {
    provider: config.provider,
    model: input.model ?? config.model,
    content,
    parsed: input.parseJson ? JSON.parse(content) : undefined
  };
}

function normalizeMessages(input) {
  if (Array.isArray(input.messages)) return input.messages;
  const messages = [];
  if (input.system) messages.push({ role: "system", content: input.system });
  if (input.prompt) messages.push({ role: "user", content: input.prompt });
  if (messages.length === 0) throw new Error("llm.chat requires messages or prompt");
  return messages;
}


import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const STATUS = "codex-session-fast";

type Model = { provider: string; id: string } | undefined;

/** Any model on the native subscription provider is eligible. */
export function eligible(model: Model): boolean {
  return model?.provider === "openai-codex";
}

/** Registers volatile Fast state and metadata-only response receipts; never restores Fast from disk. */
export default function sessionFast(pi: ExtensionAPI): void {
  let owner: string | undefined;
  let warned = false;
  type Receipt = { sessionId: string; provider: string; model: string; requestedTier: string };
  let pending: Receipt | undefined;
  let active: { id: string; receipt: Receipt } | undefined;

  function show(ctx: ExtensionContext): void {
    if (ctx.mode === "tui") {
      ctx.ui.setStatus(STATUS, owner && eligible(ctx.model) ? "⚡ priority requested" : undefined);
    }
  }
  function reset(ctx: ExtensionContext): void {
    owner = undefined;
    warned = false;
    show(ctx);
  }
  function sync(ctx: ExtensionContext): void {
    if (owner && (owner !== ctx.sessionManager.getSessionId() || !eligible(ctx.model))) reset(ctx);
  }
  function notify(ctx: ExtensionContext, message: string, level: "info" | "warning" = "info"): void {
    if (ctx.hasUI) ctx.ui.notify(message, level);
  }

  function resetSession(ctx: ExtensionContext): void {
    pending = undefined;
    active = undefined;
    reset(ctx);
  }
  pi.on("session_start", (_event, ctx) => resetSession(ctx));
  pi.on("session_shutdown", (_event, ctx) => resetSession(ctx));
  pi.on("model_select", (event, ctx) => {
    // event.model is authoritative: ctx.model can still describe the previous selection.
    if (!eligible(event.model)) reset(ctx);
    else show(ctx);
  });

  pi.registerCommand("fast", {
    description: "Fast одной Codex-сессии: /fast [on|off|status]",
    handler: async (args, ctx) => {
      sync(ctx);
      const command = args.trim().toLowerCase() || "toggle";
      if (!["on", "off", "status", "toggle"].includes(command)) {
        notify(ctx, "Использование: /fast [on|off|status]", "warning");
        return;
      }
      if (command === "status") {
        notify(ctx, owner ? "Fast включён: priority запрошен, исполнение сервером не гарантируется."
          : "Fast выключен: расширение не добавляет priority.");
        return;
      }
      if (command === "off" || (command === "toggle" && owner)) {
        reset(ctx);
        notify(ctx, "Fast выключен. Уже отправленный запрос не изменён.");
        return;
      }
      if (!eligible(ctx.model)) {
        reset(ctx);
        notify(ctx, "Fast доступен только на поддержанной модели openai-codex. Провайдер не переключён.", "warning");
        return;
      }
      owner = ctx.sessionManager.getSessionId();
      warned = false;
      show(ctx);
      notify(ctx, "Fast включён только для текущей сессии. Расход кредитов выше; сервер может не применить priority.");
    },
  });

  pi.on("before_provider_request", (event, ctx) => {
    sync(ctx);
    pending = undefined;
    active = undefined;
    const payload = event.payload;
    if (!ctx.model || !eligible(ctx.model) || !payload || typeof payload !== "object" || Array.isArray(payload)) return;
    const body = payload as Record<string, unknown>;
    if (body.model !== ctx.model?.id) return;
    const requestedTier = typeof body.service_tier === "string" ? body.service_tier : "default";
    pending = { sessionId: ctx.sessionManager.getSessionId(), provider: "openai-codex",
      model: ctx.model.id, requestedTier };
    if (!owner) return;
    // Another owner may have explicit tier policy. Never silently overwrite it.
    if ("service_tier" in body) {
      if (body.service_tier !== "priority") {
        reset(ctx);
        notify(ctx, "Конфликт service_tier: Fast выключен, чужой tier не изменён.", "warning");
      } else if (!warned) {
        warned = true;
        notify(ctx, "priority уже задан другим компонентом. /fast off не отменяет чужие настройки.", "warning");
      }
      return;
    }
    pending.requestedTier = "priority";
    return { ...body, service_tier: "priority" };
  });

  pi.on("provider_stream_event", (event, ctx) => {
    if (event.provider !== "openai-codex" || !event.data || typeof event.data !== "object") return;
    const frame = event.data as { type?: string; response?: { id?: string; service_tier?: string } };
    const response = frame.response;
    if (!response || typeof response.id !== "string") return;
    if (frame.type === "response.created" && pending
        && pending.sessionId === ctx.sessionManager.getSessionId() && pending.model === event.model) {
      active = { id: response.id, receipt: pending };
      pending = undefined;
    }
    if (!active || active.id !== response.id || active.receipt.sessionId !== ctx.sessionManager.getSessionId()) return;
    if (!["response.created", "response.done", "response.completed", "response.failed", "response.incomplete"].includes(frame.type ?? "")) return;
    // Receipts contain no payload or model text. A later hook may still override the requested tier.
    try {
      pi.appendEntry("codex-session-fast-response.v1", { ...active.receipt, version: 1,
        responseId: response.id, stage: frame.type,
        serverTier: typeof response.service_tier === "string" ? response.service_tier : null });
    } catch {
      notify(ctx, "Не удалось сохранить метку Fast; режим этого ответа может остаться неизвестным в отчёте.", "warning");
    }
    if (frame.type !== "response.created") active = undefined;
  });
}

"use client";

import { formatClockTime } from "@/lib/format";
import type { ThreadMessage } from "@/lib/conversations/types";

/** Etiqueta del autor en los OUT: bot vs. persona del equipo (T9). */
function authorBadge(message: ThreadMessage): string | null {
  if (message.direction !== "OUT") return null;
  return message.author === "HUMAN" ? "tú" : "🤖 bot";
}

export function MessageBubble({
  message,
  zone,
}: {
  message: ThreadMessage;
  zone: string;
}) {
  const isOut = message.direction === "OUT";
  const badge = authorBadge(message);
  const meta = message.metadata;

  return (
    <div className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
      <div className="flex max-w-[80%] flex-col gap-1">
        {badge ? (
          <span
            className={`text-[10px] font-medium text-faint ${
              isOut ? "text-right" : ""
            }`}
          >
            {badge}
          </span>
        ) : null}

        <div
          className={`rounded-2xl px-3 py-2 text-sm ${
            isOut
              ? "rounded-br-sm bg-brand text-white"
              : "rounded-bl-sm bg-white text-ink"
          } border ${isOut ? "border-transparent" : "border-border"}`}
        >
          <p className="whitespace-pre-wrap break-words">{message.body}</p>
        </div>

        {meta?.reminder ? (
          <Marker isOut={isOut}>Recordatorio automático</Marker>
        ) : null}
        {meta?.escalation ? (
          <Marker isOut={isOut}>Escaló: {meta.escalation.motivo}</Marker>
        ) : null}

        <span
          className={`text-[10px] text-faint ${isOut ? "text-right" : ""}`}
        >
          {formatClockTime(message.createdAt, zone)}
        </span>
      </div>
    </div>
  );
}

function Marker({
  children,
  isOut,
}: {
  children: React.ReactNode;
  isOut: boolean;
}) {
  return (
    <span
      className={`inline-flex w-fit items-center rounded-full bg-background px-2 py-0.5 text-[10px] font-medium text-label ${
        isOut ? "self-end" : "self-start"
      }`}
    >
      {children}
    </span>
  );
}

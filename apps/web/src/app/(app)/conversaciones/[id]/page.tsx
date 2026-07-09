"use client";

import { use } from "react";
import { ConversationThread } from "@/components/conversations/conversation-thread";

export default function ConversacionDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <ConversationThread id={id} />;
}

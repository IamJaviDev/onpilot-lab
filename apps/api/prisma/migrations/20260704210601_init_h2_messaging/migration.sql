-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('BOT_ACTIVE', 'PENDING_REVIEW', 'HUMAN_CONTROL', 'CLOSED');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "MessageAuthor" AS ENUM ('CLIENT', 'BOT', 'HUMAN');

-- CreateTable
CREATE TABLE "Conversation" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "clientId" UUID,
    "phone" TEXT NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'BOT_ACTIVE',
    "lastMessageAt" TIMESTAMP(3),
    "contextSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "author" "MessageAuthor" NOT NULL,
    "body" TEXT NOT NULL,
    "waMessageId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Conversation_businessId_status_lastMessageAt_idx" ON "Conversation"("businessId", "status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Invariantes no expresables en schema.prisma (mantenidos manualmente aquí).
-- Prisma NO los introspecta ni los refleja en el schema: no aparecen en
-- `prisma db pull` ni en el diff de `migrate dev`. Cualquier cambio futuro sobre
-- ellos debe editarse a mano en una nueva migración. NO declarar en schema.prisma.
-- ---------------------------------------------------------------------------

-- Idempotencia de webhook: un mismo mensaje de WhatsApp no puede persistirse dos
-- veces en el mismo negocio (Meta reintenta webhooks). Solo sobre filas activas.
CREATE UNIQUE INDEX "Message_businessId_waMessageId_idem_idx"
  ON "Message" ("businessId", "waMessageId")
  WHERE "waMessageId" IS NOT NULL AND "deletedAt" IS NULL;

-- Una sola conversación ABIERTA (no CLOSED) por teléfono y negocio. Las CLOSED
-- pueden acumularse como historial. Solo sobre filas activas.
CREATE UNIQUE INDEX "Conversation_businessId_phone_open_idx"
  ON "Conversation" ("businessId", "phone")
  WHERE "status" <> 'CLOSED' AND "deletedAt" IS NULL;

-- Coherencia dirección/autor: un entrante solo puede ser del cliente; un
-- saliente solo del bot o del humano.
ALTER TABLE "Message" ADD CONSTRAINT "Message_direction_author_coherent"
  CHECK (
    ("direction" = 'IN' AND "author" = 'CLIENT')
    OR ("direction" = 'OUT' AND "author" IN ('BOT', 'HUMAN'))
  );

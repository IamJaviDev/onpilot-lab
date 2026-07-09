import { MessageAuthor } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { ConversationService } from './conversation.service';

// Qué se protege: la generalización de persistOutgoing (T9). Los llamadores
// existentes (webhook, reminder processor) NO pasan `author` → deben seguir
// creando OUT/BOT exactamente igual. El panel pasa HUMAN.

const BUSINESS_ID = 'b0000000-0000-0000-0000-000000000001';
const CONV_ID = 'c0000000-0000-0000-0000-000000000001';

interface CreateArgs {
  data?: { author?: string; direction?: string };
}

function firstCreateArgs(create: jest.Mock): CreateArgs {
  const calls = create.mock.calls as CreateArgs[][];
  return calls[0]?.[0] ?? {};
}

function makeService() {
  const create = jest.fn().mockReturnValue({ __op: 'create' });
  const updateMany = jest.fn().mockReturnValue({ __op: 'updateMany' });
  const $transaction = jest.fn().mockResolvedValue([]);

  const prisma = {
    message: { create },
    conversation: { updateMany },
    $transaction,
  } as unknown as PrismaService;

  return { service: new ConversationService(prisma), create };
}

describe('ConversationService.persistOutgoing', () => {
  it('sin author (llamador existente: bot/recordatorio) → crea OUT/BOT', async () => {
    const { service, create } = makeService();

    await service.persistOutgoing({
      businessId: BUSINESS_ID,
      conversationId: CONV_ID,
      body: 'respuesta del bot',
      waMessageId: 'wamid.bot.1',
    });

    const args = firstCreateArgs(create);
    expect(args.data?.direction).toBe('OUT');
    expect(args.data?.author).toBe('BOT');
  });

  it('con author HUMAN (panel T9) → crea OUT/HUMAN', async () => {
    const { service, create } = makeService();

    await service.persistOutgoing({
      businessId: BUSINESS_ID,
      conversationId: CONV_ID,
      body: 'respuesta manual',
      waMessageId: 'wamid.human.1',
      author: MessageAuthor.HUMAN,
    });

    const args = firstCreateArgs(create);
    expect(args.data?.direction).toBe('OUT');
    expect(args.data?.author).toBe('HUMAN');
  });
});

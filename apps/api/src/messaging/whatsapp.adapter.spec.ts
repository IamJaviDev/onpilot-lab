import type { ConfigService } from '@nestjs/config';
import { WhatsAppAdapter, WhatsAppSendError } from './whatsapp.adapter';

// Tests unitarios del adapter con el HTTP mockeado: aquí NUNCA se llama a Meta.
// Se verifica la construcción de la request (URL/headers/payload), el parseo
// del wamid y el mapeo de errores de la Graph API.

const ENV: Record<string, string> = {
  WHATSAPP_PHONE_NUMBER_ID: 'PHONE123',
  WHATSAPP_ACCESS_TOKEN: 'test-access-token',
};

function makeAdapter(): WhatsAppAdapter {
  const config = {
    getOrThrow: (key: string) => {
      const value = ENV[key];
      if (value === undefined) throw new Error(`missing env ${key}`);
      return value;
    },
  } as unknown as ConfigService;
  return new WhatsAppAdapter(config);
}

function graphResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('WhatsAppAdapter.sendText', () => {
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('envía el payload correcto a la Graph API y devuelve el wamid', async () => {
    fetchMock.mockResolvedValue(
      graphResponse(200, {
        messaging_product: 'whatsapp',
        contacts: [{ wa_id: '34600000000' }],
        messages: [{ id: 'wamid.OUT-0001' }],
      }),
    );

    const result = await makeAdapter().sendText('34600000000', 'hola');

    expect(result).toEqual({ waMessageId: 'wamid.OUT-0001' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v25.0/PHONE123/messages');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer test-access-token',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(init.body as string)).toEqual({
      messaging_product: 'whatsapp',
      to: '34600000000',
      type: 'text',
      text: { body: 'hola' },
    });
  });

  it('mapea un error de Meta a WhatsAppSendError con code y subcode', async () => {
    fetchMock.mockResolvedValue(
      graphResponse(400, {
        error: {
          message: 'Invalid parameter',
          type: 'OAuthException',
          code: 100,
          error_subcode: 2018001,
        },
      }),
    );

    const promise = makeAdapter().sendText('34600000000', 'hola');
    await expect(promise).rejects.toThrow(WhatsAppSendError);
    await expect(promise).rejects.toMatchObject({
      metaCode: 100,
      metaSubcode: 2018001,
      isReengagementWindowClosed: false,
    });
  });

  it('identifica el error de ventana de 24h cerrada (code 131047)', async () => {
    fetchMock.mockResolvedValue(
      graphResponse(400, {
        error: {
          message: 'Re-engagement message',
          type: 'OAuthException',
          code: 131047,
        },
      }),
    );

    await expect(
      makeAdapter().sendText('34600000000', 'hola'),
    ).rejects.toMatchObject({
      metaCode: 131047,
      isReengagementWindowClosed: true,
    });
  });

  it('lanza WhatsAppSendError si el HTTP es OK pero no hay wamid', async () => {
    fetchMock.mockResolvedValue(graphResponse(200, { messages: [] }));

    await expect(makeAdapter().sendText('34600000000', 'hola')).rejects.toThrow(
      WhatsAppSendError,
    );
  });

  it('mapea un fallo de red (fetch rechaza) a WhatsAppSendError sin code', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const promise = makeAdapter().sendText('34600000000', 'hola');
    await expect(promise).rejects.toThrow(WhatsAppSendError);
    await expect(promise).rejects.toMatchObject({ metaCode: undefined });
  });
});

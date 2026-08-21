import { ServiceUnavailableException } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { SmsService } from './sms.service';

/**
 * The real SMS gateways can't be called from CI, so these tests pin down the
 * part we control: the exact HTTP request each provider builds, and the failure
 * behaviour when a gateway rejects or is unconfigured. `fetch` is stubbed, so
 * nothing leaves the machine — but if the request shape is wrong (missing DLT
 * id, un-prefixed mobile, wrong auth header) that is a bug these tests catch
 * before real credentials are ever wired in.
 */
describe('SmsService', () => {
  const ORIGINAL_ENV = { ...process.env };
  let fetchMock: jest.Mock;

  /** Build the service with a given env, after AppConfigService reads it. */
  const build = (env: Record<string, string>) => {
    process.env = { ...ORIGINAL_ENV, ...env };
    return new SmsService(new AppConfigService());
  };

  const okResponse = (body = 'OK') =>
    ({ ok: true, status: 200, text: async () => body }) as unknown as Response;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue(okResponse());
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.restoreAllMocks();
  });

  describe('console provider (default)', () => {
    it('does not call any gateway', async () => {
      const sms = build({ SMS_PROVIDER: 'console' });
      await sms.send('9876543210', 'Your OTP is 123456');
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('msg91', () => {
    const env = {
      SMS_PROVIDER: 'msg91',
      MSG91_AUTH_KEY: 'test-auth-key',
      MSG91_SENDER_ID: 'PIGMEE',
      MSG91_ROUTE: '4',
    };

    it('posts a correctly-formed transactional request', async () => {
      const sms = build(env);
      await sms.send('9876543210', 'Your Digital Pigmee OTP is 123456.');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.msg91.com/api/sendhttp.php');
      expect(init.method).toBe('POST');

      const body = new URLSearchParams(init.body as string);
      expect(body.get('authkey')).toBe('test-auth-key');
      // 10-digit Indian numbers must be country-prefixed or MSG91 drops them.
      expect(body.get('mobiles')).toBe('919876543210');
      expect(body.get('sender')).toBe('PIGMEE');
      expect(body.get('route')).toBe('4');
      expect(body.get('country')).toBe('91');
      expect(body.get('message')).toBe('Your Digital Pigmee OTP is 123456.');
    });

    it('includes the DLT template id when configured (TRAI requirement)', async () => {
      const sms = build({ ...env, MSG91_DLT_TEMPLATE_ID: '1207161234567890' });
      await sms.send('9876543210', 'hello');

      const body = new URLSearchParams(fetchMock.mock.calls[0][1].body as string);
      expect(body.get('DLT_TE_ID')).toBe('1207161234567890');
    });

    it('omits the DLT field entirely when not configured', async () => {
      const sms = build(env);
      await sms.send('9876543210', 'hello');

      const body = new URLSearchParams(fetchMock.mock.calls[0][1].body as string);
      expect(body.has('DLT_TE_ID')).toBe(false);
    });

    it('leaves an already-prefixed number untouched', async () => {
      const sms = build(env);
      await sms.send('919876543210', 'hello');

      const body = new URLSearchParams(fetchMock.mock.calls[0][1].body as string);
      expect(body.get('mobiles')).toBe('919876543210');
    });

    it('refuses to send when the auth key is missing', async () => {
      const sms = build({ SMS_PROVIDER: 'msg91', MSG91_AUTH_KEY: '' });
      await expect(sms.send('9876543210', 'hello')).rejects.toThrow(ServiceUnavailableException);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('throws rather than reporting a false success on a gateway error', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'invalid authkey',
      } as unknown as Response);

      const sms = build(env);
      await expect(sms.send('9876543210', 'hello')).rejects.toThrow(ServiceUnavailableException);
    });

    it('throws when the network call itself fails', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNRESET'));
      const sms = build(env);
      await expect(sms.send('9876543210', 'hello')).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('twilio', () => {
    const env = {
      SMS_PROVIDER: 'twilio',
      TWILIO_ACCOUNT_SID: 'ACtest123',
      TWILIO_AUTH_TOKEN: 'secret-token',
      TWILIO_FROM: '+15551234567',
    };

    it('posts to the account message endpoint with basic auth and E.164 numbers', async () => {
      const sms = build(env);
      await sms.send('9876543210', 'Your OTP is 123456');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/ACtest123/Messages.json');

      const expectedAuth = Buffer.from('ACtest123:secret-token').toString('base64');
      expect(init.headers.authorization).toBe(`Basic ${expectedAuth}`);

      const body = new URLSearchParams(init.body as string);
      expect(body.get('To')).toBe('+919876543210');
      expect(body.get('From')).toBe('+15551234567');
      expect(body.get('Body')).toBe('Your OTP is 123456');
    });

    it('preserves a number already in E.164 form', async () => {
      const sms = build(env);
      await sms.send('+447700900123', 'hello');

      const body = new URLSearchParams(fetchMock.mock.calls[0][1].body as string);
      expect(body.get('To')).toBe('+447700900123');
    });

    it('refuses to send when credentials are incomplete', async () => {
      const sms = build({ ...env, TWILIO_AUTH_TOKEN: '' });
      await expect(sms.send('9876543210', 'hello')).rejects.toThrow(ServiceUnavailableException);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('throws rather than reporting a false success on a gateway error', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'unverified number',
      } as unknown as Response);

      const sms = build(env);
      await expect(sms.send('9876543210', 'hello')).rejects.toThrow(ServiceUnavailableException);
    });
  });
});

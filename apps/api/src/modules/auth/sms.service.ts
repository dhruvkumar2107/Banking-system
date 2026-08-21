import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';

const SEND_TIMEOUT_MS = 10_000;

/**
 * SMS delivery behind a single `send(mobile, message)` interface. The provider
 * is chosen by SMS_PROVIDER:
 *   - `console` (default): logs the message — for local/dev only.
 *   - `msg91`: India-first, via the MSG91 HTTP API.
 *   - `twilio`: global, via the Twilio Messages REST API.
 * Real providers use the built-in fetch (no extra dependency). A delivery
 * failure throws so the caller can surface it rather than falsely report "sent".
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger('SMS');

  constructor(private readonly config: AppConfigService) {}

  async send(mobile: string, message: string): Promise<void> {
    const { provider } = this.config.config.sms;
    switch (provider) {
      case 'msg91':
        return this.sendViaMsg91(mobile, message);
      case 'twilio':
        return this.sendViaTwilio(mobile, message);
      case 'console':
      default:
        this.logger.log(`[console] → ${mobile}: ${message}`);
        return;
    }
  }

  /** 10-digit Indian numbers → country-prefixed forms the gateways expect. */
  private withCountryCode(mobile: string): string {
    const digits = mobile.replace(/\D/g, '');
    if (digits.length === 10) return `91${digits}`;
    return digits;
  }

  private toE164(mobile: string): string {
    if (mobile.startsWith('+')) return mobile;
    return `+${this.withCountryCode(mobile)}`;
  }

  private async postForm(url: string, body: URLSearchParams, headers: Record<string, string> = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
        body,
        signal: controller.signal,
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
      }
      return text;
    } finally {
      clearTimeout(timer);
    }
  }

  private async sendViaMsg91(mobile: string, message: string): Promise<void> {
    const { authKey, senderId, route, dltTemplateId } = this.config.config.sms.msg91;
    if (!authKey) throw new ServiceUnavailableException('SMS provider (msg91) is not configured');

    const body = new URLSearchParams({
      authkey: authKey,
      mobiles: this.withCountryCode(mobile),
      message,
      sender: senderId,
      route,
      country: '91',
    });
    if (dltTemplateId) body.set('DLT_TE_ID', dltTemplateId);

    try {
      await this.postForm('https://api.msg91.com/api/sendhttp.php', body);
      this.logger.log(`[msg91] sent to ${mobile}`);
    } catch (err) {
      this.logger.error(`[msg91] delivery failed for ${mobile}`, err as Error);
      throw new ServiceUnavailableException('Failed to send OTP SMS');
    }
  }

  private async sendViaTwilio(mobile: string, message: string): Promise<void> {
    const { accountSid, authToken, from } = this.config.config.sms.twilio;
    if (!accountSid || !authToken || !from) {
      throw new ServiceUnavailableException('SMS provider (twilio) is not configured');
    }

    const body = new URLSearchParams({ To: this.toE164(mobile), From: from, Body: message });
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    try {
      await this.postForm(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        body,
        { authorization: `Basic ${auth}` },
      );
      this.logger.log(`[twilio] sent to ${mobile}`);
    } catch (err) {
      this.logger.error(`[twilio] delivery failed for ${mobile}`, err as Error);
      throw new ServiceUnavailableException('Failed to send OTP SMS');
    }
  }
}

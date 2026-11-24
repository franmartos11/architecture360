import { describe, it, expect } from 'vitest';
import { isBotUserAgent, deviceFromUserAgent } from './user-agent';

const CHROME_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

describe('isBotUserAgent', () => {
  it.each([
    ['Googlebot', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'],
    ['bingbot', 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)'],
    ['HeadlessChrome', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.0.0 Safari/537.36'],
    ['facebookexternalhit (vista previa de links)', 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'],
    ['WhatsApp (vista previa de links)', 'WhatsApp/2.23.20.0'],
  ])('%s es bot', (_n, ua) => {
    expect(isBotUserAgent(ua)).toBe(true);
  });

  it('navegadores reales no', () => {
    expect(isBotUserAgent(CHROME_MAC)).toBe(false);
    expect(isBotUserAgent(IPHONE)).toBe(false);
    expect(isBotUserAgent(null)).toBe(false);
  });
});

describe('deviceFromUserAgent', () => {
  it('celulares', () => {
    expect(deviceFromUserAgent(IPHONE)).toBe('mobile');
    expect(deviceFromUserAgent(ANDROID)).toBe('mobile');
  });
  it('computadora o desconocido', () => {
    expect(deviceFromUserAgent(CHROME_MAC)).toBe('desktop');
    expect(deviceFromUserAgent(null)).toBe('desktop');
  });
});

import {
  isNoReplyAddress,
  parseFromAddress,
  renderNotificationEmail,
  renderTransactionalEmail,
  resolvePublicAppUrl,
} from './email-templates';

describe('email-templates', () => {
  it('parses display-name From headers', () => {
    expect(parseFromAddress('ReWorth <hello@agriflowafrica.com>')).toBe(
      'hello@agriflowafrica.com',
    );
    expect(isNoReplyAddress('noreply@agriflowafrica.com')).toBe(true);
    expect(isNoReplyAddress('ReWorth <hello@agriflowafrica.com>')).toBe(false);
  });

  it('drops localhost app URLs for deliverability', () => {
    expect(resolvePublicAppUrl('http://localhost:3000')).toBeUndefined();
    expect(resolvePublicAppUrl('https://app.reworth.ng')).toBe(
      'https://app.reworth.ng',
    );
  });

  it('renders branded html without hidden cloaking text', () => {
    const { text, html } = renderTransactionalEmail({
      preview: 'Your account was created successfully.',
      title: 'Welcome to ReWorth',
      greeting: 'Hi Ori,',
      paragraphs: ['Your ReWorth account is ready.'],
      cta: { label: 'Open ReWorth', url: 'https://app.reworth.ng' },
      appUrl: 'https://app.reworth.ng',
    });
    expect(text).toContain('Hi Ori,');
    expect(text).toContain('Open ReWorth: https://app.reworth.ng');
    expect(html).toContain('Welcome to ReWorth');
    expect(html).toContain('#0E9F6E');
    expect(html).toContain('Open ReWorth');
    expect(html).not.toContain('display:none');
    expect(html).not.toContain('mso-hide');
    expect(html).not.toContain('<script');
  });

  it('omits CTA when only localhost is provided', () => {
    const { html, text } = renderTransactionalEmail({
      title: 'Welcome to ReWorth',
      greeting: 'Hi Ori,',
      paragraphs: ['Your account is ready.'],
      cta: { label: 'Open ReWorth', url: 'http://localhost:3000' },
      appUrl: 'http://localhost:3000',
    });
    expect(html).not.toContain('localhost');
    expect(text).not.toContain('localhost');
  });

  it('renders notification emails with deep links', () => {
    const { html } = renderNotificationEmail({
      title: 'New offer',
      body: 'Someone offered NGN 50,000 on your listing.',
      deepLink: '/chats/abc',
      appUrl: 'https://app.reworth.ng',
    });
    expect(html).toContain('New offer');
    expect(html).toContain('https://app.reworth.ng/chats/abc');
  });
});

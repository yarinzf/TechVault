'use strict';

/**
 * Dev console email provider — logs emails to stdout instead of sending them.
 * Used when EMAIL_PROVIDER=console (the default in development).
 */

const DIVIDER = '─'.repeat(60);

const send = async ({ to, subject, text, html }) => {
  const preview = (text || (html || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);

  console.log(`\n📧 EMAIL\n${DIVIDER}`);
  console.log(`  To      : ${to}`);
  console.log(`  Subject : ${subject}`);
  console.log(`  Preview : ${preview}${preview.length >= 200 ? '…' : ''}`);
  console.log(DIVIDER);
};

module.exports = { send };

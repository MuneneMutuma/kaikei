// src/utils/mpesaParser.ts

export interface MpesaTransaction {
  tx_id: string;
  direction: 'in' | 'out' | 'internal' | 'unknown';
  action: string;
  amount: number;
  from: string;
  to: string;
  phone?: string;
  account?: string;
  date: string;
  time: string;
  balance: number;
  other_balance?: number; // For “has been moved” cases
  tx_cost?: number;
  source: 'mpesa';
  raw_text: string;
}

/**
 * Normalize text for easier matching
 */
const normalizeText = (text: string) =>
  text
    .replace(/\s+/g, ' ')
    .replace(/,/g, '')
    .replace(/KES|ksh|Ksh\.?/gi, 'Ksh')
    .trim();

/**
 * Parse M-Pesa transaction SMS
 */
export const parseMpesaMessage = (raw: string): MpesaTransaction | null => {
  const text = normalizeText(raw);

  // Extract TX_ID
  const tx_id = text.match(/^([A-Z0-9]{6,})\s+Confirmed/i)?.[1] || 'UNKNOWN';

  // Extract amount
  const amountMatch = text.match(/Ksh\.?\s?([\d.]+)/i);
  const amount = amountMatch ? parseFloat(amountMatch[1]) : 0;

  // Extract date and time
  const dateMatch = text.match(/on\s([\d/]+)\s+at\s([\d:]+\s?(?:AM|PM)?)/i);
  const date = dateMatch?.[1] || '';
  const time = dateMatch?.[2] || '';

  // Extract balances
  const balanceMatch = text.match(/M-?PESA balance is Ksh\.?\s?([\d.]+)/i);
  const balance = balanceMatch ? parseFloat(balanceMatch[1]) : 0;

  // Extract transaction cost
  const costMatch = text.match(/Transaction cost,?\s*Ksh\.?\s?([\d.]+)/i);
  const tx_cost = costMatch ? parseFloat(costMatch[1]) : 0;

  let direction: MpesaTransaction['direction'] = 'unknown';
  let action = '';
  let from = '';
  let to = '';
  let phone: string | undefined;
  let account: string | undefined;
  let other_balance: number | undefined;

    /** =========================
     * CASE 1: Money RECEIVED
     * ========================= */
    if (/you have received/i.test(text)) {
      direction = 'in';
      action = 'received from';

      // Capture the sender segment up to 'on' (date) or end of sentence
      // e.g. "You have received Ksh500.00 from John Doe 0712345678 on 11/09/2025..."
      const recvRegex = /you have received\s+Ksh\.?\s?[\d,]+(?:\.\d{2})?\s+from\s+(.+?)(?:\s+on\b|\s+at\b|$)/i;
      const recvMatch = text.match(recvRegex);

      if (recvMatch && recvMatch[1]) {
        let senderRaw = recvMatch[1].trim();

        // Look for phone patterns: +2547XXXXXXXX, 2547XXXXXXXX, 07XXXXXXXX, 7XXXXXXXX
        const phoneRegex = /(\+?2547\d{8}|\b0\d{9}\b|\b7\d{8}\b)/;
        const phoneMatch = senderRaw.match(phoneRegex);
        if (phoneMatch) {
          phone = phoneMatch[1];
          // remove phone from sender name text
          senderRaw = senderRaw.replace(phoneMatch[1], '').trim();
        }

        // Clean trailing punctuation/words
        senderRaw = senderRaw.replace(/[\.,;:]$/,'').trim();

        from = senderRaw || 'UNKNOWN';
      } else {
        // fallback: try looser match for 'from <X>'
        const loose = text.match(/from\s+([A-Za-z0-9\s\.\-&']+)/i);
        if (loose && loose[1]) {
          from = loose[1].trim();
        }
        // phone may still be present anywhere in text; attempt global phone match
        const globalPhone = text.match(/(\+?2547\d{8}|\b0\d{9}\b|\b7\d{8}\b)/);
        if (globalPhone) phone = globalPhone[1];
      }

      to = 'YOU';
    }


    /** =========================
     * CASE 2: Money SENT / PAID
     * ========================= */
    else if (/(sent to|paid to|transferred to)/i.test(text)) {
      direction = 'out';
      const actionMatch = text.match(/(sent to|paid to|transferred to)/i);
      action = actionMatch ? actionMatch[1].toLowerCase() : '';

      // Capture recipient text: everything after the action up to 'for account' or 'on' (date) or end
      // This handles multi-word recipients like "SAFARICOM DATA BUNDLES"
      const recipientRegex = /(sent to|paid to|transferred to)\s+(.+?)(?:\s+for account\b|\s+on\b|$)/i;
      const recipientMatch = text.match(recipientRegex);

      if (recipientMatch && recipientMatch[2]) {
        let recipientRaw = recipientMatch[2].trim();

        // Extract phone numbers in common Kenyan formats:
        // +2547XXXXXXXX, 2547XXXXXXXX, 07XXXXXXXX, 7XXXXXXXX
        const phoneRegex = /(\+?2547\d{8}|\b0\d{9}\b|\b7\d{8}\b)/;
        const phoneMatch = recipientRaw.match(phoneRegex);
        if (phoneMatch) {
          phone = phoneMatch[1];
          // remove phone from the recipient name text
          recipientRaw = recipientRaw.replace(phoneMatch[1], '').trim();
        }

        // Remove trailing punctuation that could remain after name removal
        recipientRaw = recipientRaw.replace(/[\.,;:]$/,'').trim();

        to = recipientRaw || 'UNKNOWN';
      }

      // Handle account info (multi-word) that appears after 'for account' and ends before 'on'
      const accountMatch = text.match(/for account\s+(.+?)(?:\s+on\b|$)/i);
      if (accountMatch && accountMatch[1]) {
        account = accountMatch[1].trim();
        // If account repeats the recipient short name, prefer the full account phrase
        if (to && account.toLowerCase().includes(to.toLowerCase())) {
          to = account;
        }
      }

      from = 'YOU';
    }


  /** =========================
   *  CASE 3: Internal MOVEMENT
   *  ========================= */
  else if (/has been moved/i.test(text)) {
    direction = 'internal';
    action = 'has been moved';

    const fromMatch = text.match(/moved from your ([A-Za-z\-\s]+?) account/i);
    const toMatch = text.match(/to your ([A-Za-z\-\s]+?) account/i);
    if (fromMatch) from = fromMatch[1].trim() + ' account';
    if (toMatch) to = toMatch[1].trim() + ' account';

    // Capture both balances
    const otherBalMatch = text.match(/New\s+Business balance is Ksh\.?\s?([\d.]+)/i);
    if (otherBalMatch) other_balance = parseFloat(otherBalMatch[1]);
  }

  /** =========================
   *  DEFAULT / UNKNOWN
   *  ========================= */
  else {
    direction = 'unknown';
    action = 'other';
    from = '';
    to = '';
  }

  return {
    tx_id,
    direction,
    action,
    amount,
    from,
    to,
    phone,
    account,
    date,
    time,
    balance,
    other_balance,
    tx_cost,
    source: 'mpesa',
    raw_text: raw,
  };
};

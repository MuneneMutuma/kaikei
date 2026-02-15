// src/utils/mpesaParser.ts

export interface MpesaTransaction {
  tx_id: string;
  type: 'deposit' | 'withdrawal' | 'sent' | 'received' | 'internal' | 'transfer' | 'other';
  direction: 'in' | 'out' | 'internal' | 'unknown';
  action: string;
  amount: number;
  from: string;
  to: string;
  phone?: string;
  account?: string;
  date: string;
  time: string;
  tx_cost?: number;
  source: 'mpesa';
  raw_text: string;
  excludeFromAnalytics?: boolean;
  original_tx_id?: string;
  balances: {
    mpesa?: number;
    pochi?: number;
    mshwari?: number;
  };
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

  // Handle known failure messages that don't change balances
  const failurePatterns = [
    /unable to process your request/i,                         // Another transaction taking place
    /unable to complete the transaction/i,                     // Failed transaction
    /you do not have sufficient funds/i,                       // Insufficient balance
    /insufficient funds in your/i,                             // Insufficient funds
    /transaction could not be completed/i,                     // Generic failure
    /transaction failed/i,                                     // Explicit failure notice,
    /you have entered the wrong PIN/i                  // Wrong PIN
  ];

  // If message matches any failure pattern, drop it
  if (failurePatterns.some((p) => p.test(text))) {
    return null; // Ignore failed / incomplete transactions
  }


  // Extract TX_ID
  const tx_id = text.match(/^([A-Z0-9]{6,})\s+Confirmed/i)?.[1] || 'UNKNOWN';

  // Extract amount
  const amountMatch = text.match(/Ksh\.?\s?([\d.]+)/i);
  const amount = amountMatch ? parseFloat(amountMatch[1]) : 0;

  // Extract date and time
  const dateMatch = text.match(/on\s([\d/]+)\s+at\s([\d:]+\s?(?:AM|PM)?)/i);
  const date = dateMatch?.[1] || '';
  const time = dateMatch?.[2] || '';

  // Extract transaction cost
  const costMatch = text.match(/Transaction cost,?\s*Ksh\.?\s?([\d.]+)/i);
  let tx_cost = costMatch ? parseFloat(costMatch[1]) : 0;

  let direction: MpesaTransaction['direction'] = 'unknown';
  let type: MpesaTransaction['type'] = 'other';
  let action = '';
  let from = '';
  let to = '';
  let phone: string | undefined;
  let account: string | undefined;
  let excludeFromAnalytics = false;

  // Balance dictionary
  const balances: MpesaTransaction['balances'] = {};

  /** =========================
   *  CASE 1: Internal MOVEMENT (M-PESA <-> POCHI)
   *  ========================= */
  if (/has been moved/i.test(text)) {
    direction = 'internal';
    type = 'internal';
    action = 'has been moved';
    excludeFromAnalytics = true;

    const fromMatch = text.match(/moved from your ([A-Za-z\-\s]+?) account/i);
    const toMatch = text.match(/to your ([A-Za-z\-\s]+?) account/i);

    if (fromMatch) {
      const fromRaw = fromMatch[1].trim().toLowerCase();
      from = /business/i.test(fromRaw) ? 'POCHI' : 'M-PESA';
    }

    if (toMatch) {
      const toRaw = toMatch[1].trim().toLowerCase();
      to = /business/i.test(toRaw) ? 'POCHI' : 'M-PESA';
    }

    const mpesaBalMatch = text.match(/New\s+M-?PESA balance is Ksh\.?\s?([\d.,]+)/i);
    const businessBalMatch = text.match(/New\s+Business balance is Ksh\.?\s?([\d.,]+)/i);

    if (mpesaBalMatch) balances.mpesa = parseFloat(mpesaBalMatch[1].replace(/,/g, ''));
    if (businessBalMatch) balances.pochi = parseFloat(businessBalMatch[1].replace(/,/g, ''));
  }

  /** =========================
   *  CASE 2: M-SHWARI TRANSFER
   *  ========================= */
  else if (/M-?Shwari/i.test(text) && /transferred/i.test(text)) {
    direction = 'internal';
    type = 'internal';
    action = 'mshwari transfer';
    excludeFromAnalytics = true;

    const isToMshwari = /transferred to M-?Shwari/i.test(text);
    from = isToMshwari ? 'M-PESA' : 'M-SHWARI';
    to = isToMshwari ? 'M-SHWARI' : 'M-PESA';

    const mpesaBalMatch = text.match(/M-?PESA balance is Ksh\.?\s?([\d.,]+)/i);
    const mshwariBalMatch = text.match(/(?:New\s*)?M-?Shwari(?:\s+saving\s+account)?\s+balance\s+is\s+Ksh\.?\s?([\d,]+(?:\.\d{1,2})?)/i);
    const costMatch2 = text.match(/Transaction cost Ksh\.?\s?([\d.,]+)/i);

    if (mpesaBalMatch) balances.mpesa = parseFloat(mpesaBalMatch[1].replace(/,/g, ''));
    if (mshwariBalMatch) balances.mshwari = parseFloat(mshwariBalMatch[1].replace(/,/g, ''));
    if (costMatch2) tx_cost = parseFloat(costMatch2[1].replace(/,/g, ''));
  }

  /** =========================
   * CASE 3: Money RECEIVED
   * ========================= */
  else if (/you have received/i.test(text)) {
    direction = 'in';
    type = 'received';
    action = 'received from';

    // detect if the incoming was into the business (Pochi) or personal M-PESA
    const isBusinessIncoming =
      /New\s+business balance/i.test(text) || /business account/i.test(text);

    // set 'to' to M-PESA or POCHI (instead of 'YOU')
    to = isBusinessIncoming ? 'POCHI' : 'M-PESA';

    // Capture the sender segment up to 'on' (date) or end of sentence
    const recvRegex =
      /you have received\s+Ksh\.?\s?[\d,]+(?:\.\d{2})?\s+from\s+(.+?)(?:\s+on\b|\s+at\b|$)/i;
    const recvMatch = text.match(recvRegex);

    if (recvMatch && recvMatch[1]) {
      let senderRaw = recvMatch[1].trim();

      const phoneRegex = /(\+?2547\d{8}|\b0\d{9}\b|\b7\d{8}\b)/;
      const phoneMatch = senderRaw.match(phoneRegex);
      if (phoneMatch) {
        phone = phoneMatch[1];
        senderRaw = senderRaw.replace(phoneMatch[1], '').trim();
      }
      senderRaw = senderRaw.replace(/[\.,;:]$/, '').trim();
      from = senderRaw || 'UNKNOWN';
    } else {
      const loose = text.match(/from\s+([A-Za-z0-9\s\.\-&']+)/i);
      if (loose && loose[1]) from = loose[1].trim();
      const globalPhone = text.match(/(\+?2547\d{8}|\b0\d{9}\b|\b7\d{8}\b)/);
      if (globalPhone) phone = globalPhone[1];
    }

    const businessBalMatch = text.match(/New\s+business balance is Ksh\.?\s?([\d.]+)/i);
    const personalBalMatch = text.match(/New\s+M-?PESA balance is Ksh\.?\s?([\d.]+)/i);

    if (businessBalMatch) balances.pochi = parseFloat(businessBalMatch[1]);
    if (personalBalMatch) balances.mpesa = parseFloat(personalBalMatch[1]);
  }

  /** =========================
   * CASE 4: Money SENT / PAID
   * ========================= */
  else if (/(sent to|paid to|transferred to)/i.test(text)) {
    direction = 'out';
    type = 'sent';
    const actionMatch = text.match(/(sent to|paid to|transferred to)/i);
    action = actionMatch ? actionMatch[1].toLowerCase() : '';

    const recipientRegex =
      /(sent to|paid to|transferred to)\s+(.+?)(?:\s+for account\b|\s+on\b|$)/i;
    const recipientMatch = text.match(recipientRegex);

    if (recipientMatch && recipientMatch[2]) {
      let recipientRaw = recipientMatch[2].trim();

      const phoneRegex = /(\+?2547\d{8}|\b0\d{9}\b|\b7\d{8}\b)/;
      const phoneMatch = recipientRaw.match(phoneRegex);
      if (phoneMatch) {
        phone = phoneMatch[1];
        recipientRaw = recipientRaw.replace(phoneMatch[1], '').trim();
      }

      recipientRaw = recipientRaw.replace(/[\.,;:]$/, '').trim();
      to = recipientRaw || 'UNKNOWN';
    }

    const accountMatch = text.match(/for account\s+(.+?)(?:\s+on\b|$)/i);
    if (accountMatch && accountMatch[1]) {
      account = accountMatch[1].trim();
      if (to && account.toLowerCase().includes(to.toLowerCase())) to = account;
    }

    const isBusinessSender =
      /New\s+business balance/i.test(text) ||
      /from your business account/i.test(text) ||
      /your business account/i.test(text);

    from = isBusinessSender ? 'POCHI' : 'M-PESA';

    const businessBalMatch = text.match(/New\s+business balance is Ksh\.?\s?([\d.]+)/i);
    const personalBalMatch = text.match(/New\s+M-?PESA balance is Ksh\.?\s?([\d.]+)/i);

    if (businessBalMatch) balances.pochi = parseFloat(businessBalMatch[1]);
    if (personalBalMatch) balances.mpesa = parseFloat(personalBalMatch[1]);

    // DETECT INTERNAL TRANSFER IN "SENT"
    if (to.toUpperCase().includes('POCHI') || to.toUpperCase().includes('M-SHWARI')) {
      direction = 'internal';
      type = 'transfer';
      excludeFromAnalytics = true;
    }
  }

  /** =========================
   *  CASE 5: M-PESA REVERSAL
   *  ========================= */
  else if (/Reversal of transaction (ID|no)/i.test(text)) {
    type = 'other'; // Will be handled as special case in Importer

    // "Reversal of transaction ID N8D1... has been successfully reversed..."
    const origMatch = text.match(/Reversal of transaction (?:ID|no\.?)\s+([A-Z0-9]+)/i);
    const original_tx_id = origMatch ? origMatch[1] : undefined;

    // Determine direction based on credit/debit
    // "Ksh... credited to your M-PESA" -> Money coming back -> IN (but invalidating previous OUT)
    // "Ksh... debited from your M-PESA" -> Money leaving -> OUT (invalidating previous IN)
    if (/credited/i.test(text)) direction = 'in';
    else if (/debited/i.test(text)) direction = 'out';
    else direction = 'unknown';

    // We explicitly flag this so Importer knows to look for the original
    if (original_tx_id) {
      // We attach a temporary property to the returned object
      // But MpesaTransaction interface needs to support it.
      // See interface update below.
      (balances as any)._original_tx_id = original_tx_id;
      (balances as any)._is_reversal = true;
    }

    action = 'reversal';
    excludeFromAnalytics = true; // The reversal itself is transparent

    const mpesaBalMatch = text.match(/New\s+M-?PESA balance is Ksh\.?\s?([\d.,]+)/i);
    if (mpesaBalMatch) balances.mpesa = parseFloat(mpesaBalMatch[1].replace(/,/g, ''));
  }

  /** =========================
   *  DEFAULT / UNKNOWN
   *  ========================= */
  else {
    direction = 'unknown';
    type = 'other';
    action = 'other';
    from = '';
    to = '';
  }

  const result: MpesaTransaction = {
    tx_id,
    type,
    direction,
    action,
    amount,
    from,
    to,
    phone,
    account,
    date,
    time,
    tx_cost,
    source: 'mpesa',
    raw_text: raw,
    excludeFromAnalytics,
    balances,
  };

  // Hacky insertion of original_tx_id if found (cleaner would be to update interface)
  if ((balances as any)._original_tx_id) {
    (result as any).original_tx_id = (balances as any)._original_tx_id;
  }

  return result;
};

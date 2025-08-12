import Papa from 'papaparse';
import { z } from 'zod';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import type { Transaction } from '../types';

dayjs.extend(customParseFormat);

const RowSchema = z.object({
  date: z.string(),
  amount: z.string(),
  merchant: z.string().optional(),
  note: z.string().optional(),
  category: z.string().optional(),
  currency: z.string().optional(),
});

export type CsvMapping = {
  date: string;
  amount: string;
  merchant?: string;
  note?: string;
  category?: string;
  currency?: string; // currency column name if present
  type?: string; // e.g. 'Type' with values like 'D'/'C'
  dateFormat?: string; // e.g. 'DD/MM/YYYY'
  currencyFixed?: string; // fixed currency when CSV has no currency column
  account?: string; // column name that indicates account/card
  accountFixed?: string; // fixed value to tag source (e.g., '信用卡' or '储蓄卡')
};

function inferMappingFromHeaders(headers: string[]): CsvMapping | null {
  const H = new Set(headers.map((h) => h.trim()));
  // Template A: Credit card statement (Card,Type,Amount,Details,TransactionDate,...)
  if (H.has('TransactionDate') && H.has('Amount') && H.has('Details')) {
    return {
      date: 'TransactionDate',
      amount: 'Amount',
      merchant: 'Details',
      type: H.has('Type') ? 'Type' : undefined,
      dateFormat: 'DD/MM/YYYY',
      currencyFixed: 'NZD',
      account: H.has('Card') ? 'Card' : undefined,
      accountFixed: '信用卡',
    };
  }
  // Template B: Bank transactions (Type,Details,Particulars,Code,Reference,Amount,Date,...)
  if (H.has('Date') && H.has('Amount') && H.has('Details')) {
    return {
      date: 'Date',
      amount: 'Amount',
      merchant: 'Details',
      dateFormat: 'DD/MM/YYYY',
      currencyFixed: 'NZD',
      accountFixed: '储蓄卡',
    };
  }
  return null;
}

export async function parseCsv(file: File, mapping?: CsvMapping): Promise<Transaction[]> {
  const text = await file.text();
  const { data } = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });

  const transactions: Transaction[] = [];
  const headers = data && data.length > 0 ? Object.keys(data[0]!) : [];
  let activeMapping: CsvMapping | null = mapping ?? null;
  if (!activeMapping) {
    activeMapping = inferMappingFromHeaders(headers);
  }
  // If provided mapping doesn't match headers, try infer
  if (
    activeMapping &&
    (headers.length > 0) &&
    (!headers.includes(activeMapping.date) || !headers.includes(activeMapping.amount))
  ) {
    const inferred = inferMappingFromHeaders(headers);
    if (inferred) activeMapping = inferred;
  }
  if (!activeMapping) {
    // best-effort fallback: try common names
    activeMapping = { date: 'date', amount: 'amount' } as CsvMapping;
  }

  for (const row of data) {
    if (!row) continue;
    const mapped = {
      date: row[activeMapping.date],
      amount: row[activeMapping.amount],
      merchant: activeMapping.merchant ? row[activeMapping.merchant] : undefined,
      note: activeMapping.note ? row[activeMapping.note] : undefined,
      category: activeMapping.category ? row[activeMapping.category] : undefined,
      currency: activeMapping.currency ? row[activeMapping.currency] : 'CNY',
    };

    const safeParsed = RowSchema.safeParse(mapped);
    if (!safeParsed.success) continue;

    let dateObj = dayjs('Invalid Date');
    if (safeParsed.data.date) {
      dateObj = activeMapping.dateFormat
        ? dayjs(safeParsed.data.date.trim(), activeMapping.dateFormat, true)
        : dayjs(safeParsed.data.date);
    }
    if (!dateObj.isValid()) continue;

    const normalizedAmount = Number(String(safeParsed.data.amount).replace(/[,]/g, ''));
    if (Number.isNaN(normalizedAmount)) continue;

    let signedAmount = normalizedAmount;
    if (activeMapping.type) {
      const t = String(row[activeMapping.type] ?? '').trim().toUpperCase();
      if (t === 'D') signedAmount = -Math.abs(normalizedAmount); // Debit = 支出
      else if (t === 'C') signedAmount = Math.abs(normalizedAmount); // Credit = 收入
    }

    transactions.push({
      id: `${dateObj.format('YYYYMMDD')}-${transactions.length}-${Math.random().toString(36).slice(2, 6)}`,
      date: dateObj.format('YYYY-MM-DD'),
      amount: signedAmount,
      currency: safeParsed.data.currency || activeMapping.currencyFixed || 'CNY',
      merchant: safeParsed.data.merchant?.trim(),
      category: safeParsed.data.category?.trim(),
      note:
        safeParsed.data.note?.trim() ||
        // best-effort assemble from common fields when note not mapped
        [row['Particulars'], row['Code'], row['Reference']]
          .filter((x) => typeof x === 'string' && x.trim().length > 0)
          .join(' ').trim() || undefined,
      account: (activeMapping.account && row[activeMapping.account]) || activeMapping.accountFixed,
      raw: row,
    });
  }

  return transactions;
}



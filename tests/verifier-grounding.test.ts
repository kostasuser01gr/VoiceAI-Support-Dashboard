import { describe, expect, it } from 'vitest';

import { runGroundingVerifier } from '@/lib/verifier';

type Input = Parameters<typeof runGroundingVerifier>[0];

const TRANSCRIPT = 'Please send the invoice to Bob Jones today.';
const GOOD_EMAIL = 'Subject: Invoice\n\nPlease review before sending.';

function run(overrides: Partial<Input> = {}) {
  return runGroundingVerifier({
    transcript: TRANSCRIPT,
    summary: 'Send the invoice to Bob Jones today.',
    taskList: ['Send the invoice to Bob Jones today'],
    emailDraft: GOOD_EMAIL,
    policy: 'flag' as unknown as Input['policy'],
    ...overrides,
  });
}

describe('runGroundingVerifier flags', () => {
  it('does not raise structural flags for a well-formed, grounded output', () => {
    const { report } = run();
    for (const flag of [
      'summary_empty',
      'missing_requested_task',
      'summary_low_overlap',
      'task_low_overlap',
      'task_non_actionable',
      'email_footer_missing',
      'email_subject_missing',
    ]) {
      expect(report.flags).not.toContain(flag);
    }
  });

  it('flags an empty summary and marks the report not ok', () => {
    const { report } = run({ summary: '   ' });
    expect(report.flags).toContain('summary_empty');
    expect(report.ok).toBe(false);
  });

  it('flags a missing task when the transcript contains a request', () => {
    const { report } = run({ taskList: [] });
    expect(report.flags).toContain('missing_requested_task');
  });

  it('does not flag a missing task when the transcript has no request', () => {
    const { report } = run({
      transcript: 'The invoice went to Bob Jones today.',
      summary: 'The invoice went to Bob Jones today.',
      taskList: [],
    });
    expect(report.flags).not.toContain('missing_requested_task');
  });

  it('flags summary sentences that do not overlap the transcript', () => {
    const { report } = run({ summary: 'Quarterly revenue exceeded forecasts significantly.' });
    expect(report.flags).toContain('summary_low_overlap');
  });

  it('flags ungrounded and non-actionable tasks', () => {
    const { report } = run({ taskList: ['Reconcile ledger entries quarterly'] });
    expect(report.flags).toContain('task_low_overlap');
    expect(report.flags).toContain('task_non_actionable');
  });

  it('flags missing email footer and subject', () => {
    const { report } = run({ emailDraft: 'Hello there' });
    expect(report.flags).toContain('email_footer_missing');
    expect(report.flags).toContain('email_subject_missing');
  });

  it('accepts a footer without a trailing period', () => {
    const { report } = run({ emailDraft: 'Subject: Hi\n\nPlease review before sending' });
    expect(report.flags).not.toContain('email_footer_missing');
  });

  it('flags entities that are not present in the transcript', () => {
    const { report } = run({ summary: 'Send the invoice to Carol Danvers today.' });
    expect(report.flags).toContain('entity_leakage');
    expect(report.flags.some((flag) => flag.startsWith('entity_mismatch:'))).toBe(true);
  });
});

describe('runGroundingVerifier repair policy', () => {
  it('rebuilds summary and email when everything is empty', () => {
    const { report, repaired } = run({
      transcript: 'Please send the invoice to Bob Jones today. Thanks.',
      summary: '',
      taskList: [],
      emailDraft: '',
      policy: 'repair',
    });
    expect(report.policy).toBe('repair');
    expect(report.score).toBe(75);
    expect(report.ok).toBe(false);
    expect(repaired.summary).toBe('Please send the invoice to Bob Jones today. Thanks.');
    expect(repaired.emailDraft).toContain('Subject: Transcript Follow-up');
    expect(repaired.emailDraft).toContain('Please review before sending.');
  });

  it('drops ungrounded tasks while keeping grounded ones', () => {
    const { report, repaired } = run({
      taskList: ['Send the invoice to Bob Jones today', 'Reconcile ledger entries quarterly'],
      policy: 'repair',
    });
    expect(repaired.taskList).toEqual(['Send the invoice to Bob Jones today']);
    expect(report.score).toBeGreaterThanOrEqual(75);
    expect(report.ok).toBe(true);
  });

  it('prefixes grounded but non-actionable tasks', () => {
    const { repaired } = run({
      taskList: ['Invoice Bob Jones today'],
      policy: 'repair',
    });
    expect(repaired.taskList).toEqual(['Follow up: Invoice Bob Jones today']);
  });

  it('does not modify output when the policy is not repair', () => {
    const { repaired } = run({ emailDraft: 'Hello', summary: '' });
    expect(repaired.emailDraft).toBe('Hello');
    expect(repaired.summary).toBe('');
  });
});

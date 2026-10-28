import { describe, expect, it } from 'vitest';
import { edgeView, classifyEdge } from '../domain/edge';
import { fmtDistance, fmtEdge, fmtMoney, fmtPct, fmtRoi } from '../domain/format';
import { MINUS } from '../domain/odds';

describe('number formatting', () => {
  it('formats percentages per the style guide', () => {
    expect(fmtPct(0.24)).toBe('24%');
    expect(fmtPct(0.064)).toBe('6.4%');
    expect(fmtPct(0.004)).toBe('<1%');
    expect(fmtPct(null)).toBe('—');
  });
  it('formats edge with sign, one decimal and a true minus', () => {
    expect(fmtEdge(7.31)).toBe('+7.3');
    expect(fmtEdge(-2.94)).toBe(`${MINUS}2.9`);
    expect(fmtEdge(-0.04)).toBe('0.0');
    expect(fmtEdge(null)).toBe('—');
  });
  it('formats money and ROI', () => {
    expect(fmtMoney(1234.5)).toBe('$1,234.50');
    expect(fmtMoney(-48.8)).toBe(`${MINUS}$48.80`);
    expect(fmtMoney(12, { signed: true })).toBe('+$12.00');
    expect(fmtRoi(-0.102)).toBe(`${MINUS}10.2%`);
  });
  it('writes distances in US notation', () => {
    expect(fmtDistance('6f', 6)).toBe('6f');
    expect(fmtDistance('8f', 8)).toBe('1m');
    expect(fmtDistance('8.5f', 8.5)).toBe('1 1/16m');
    expect(fmtDistance('10f', 10)).toBe('1 1/4m');
    expect(fmtDistance('5.5f', 5.5)).toBe('5 1/2f');
    expect(fmtDistance('350y', null)).toBe('350y');
  });
});

describe('edge encoding', () => {
  it('classifies by thresholds', () => {
    expect(classifyEdge(2)).toBe('over');
    expect(classifyEdge(1.5)).toBe('slight-over');
    expect(classifyEdge(0.9)).toBe('close');
    expect(classifyEdge(-1.2)).toBe('slight-under');
    expect(classifyEdge(-2)).toBe('under');
  });
  it('flags only a backend value overlay on live odds with evidence', () => {
    const v = edgeView({ pts: 7.9, value: true, evidence: 'strong', priceSource: 'live', expReturn: 0.34 })!;
    expect(v.flagged).toBe(true);
    expect(v.glyph).toBe('▲');
    expect(v.speech).toBe('overlay, plus 7.9 points');
  });
  it('never flags without the value flag', () => {
    const v = edgeView({ pts: 4.1, value: false, evidence: 'strong', priceSource: 'live', expReturn: 0.05 })!;
    expect(v.flagged).toBe(false);
    expect(v.glyph).toBe('△');
  });
  it('calls positive points without a positive return "short of fair"', () => {
    const v = edgeView({ pts: 1.83, value: false, evidence: 'strong', priceSource: 'live', expReturn: -0.04 })!;
    expect(v.cls).toBe('short');
    expect(v.glyph).toBe('≈');
    expect(v.tone).toBe('muted');
    expect(v.label).toBe('model higher, still short of fair');
  });
  it('drops the filled flag when value flags are off', () => {
    expect(edgeView({ pts: 7.9, value: true, evidence: 'strong', priceSource: 'live', expReturn: 0.34, flags: false })!.flagged).toBe(false);
  });
  it('mutes morning-line edges with no glyph', () => {
    const v = edgeView({ pts: 4.13, value: false, evidence: 'strong', priceSource: 'morning_line' })!;
    expect(v.ml).toBe(true);
    expect(v.glyph).toBe('');
    expect(v.tone).toBe('muted');
  });
  it('hollows stale or thin-evidence edges', () => {
    expect(edgeView({ pts: 5, value: true, evidence: 'strong', priceSource: 'live', stale: true, expReturn: 0.2 })!.glyph).toBe('△');
    const thin = edgeView({ pts: -3, evidence: 'thin', priceSource: 'live' })!;
    expect(thin.glyph).toBe('▽');
    expect(thin.tone).toBe('muted');
    expect(thin.label).toBe('underlay, low confidence');
  });
});

import { describe, expect, it } from 'vitest';
import { decimalToWire, exactFraction, fmtOdds, MINUS, oddsSpeech, parseOddsInput, toAmerican, toteFraction } from '../domain/odds';

describe('odds formatting', () => {
  it('uses the source label verbatim in fractional mode', () => {
    expect(fmtOdds(5.5, 'fractional', { raw: '9-2' })).toBe('9-2');
    expect(fmtOdds(3.5, 'fractional', { raw: '5/2' })).toBe('5-2');
  });
  it('converts decimals to exact US fractions', () => {
    expect(exactFraction(3.5)).toBe('5-2');
    expect(exactFraction(2.8)).toBe('9-5');
    expect(exactFraction(3.4)).toBe('12-5');
    expect(exactFraction(2)).toBe('1-1');
    expect(exactFraction(22)).toBe('21-1');
  });
  it('rounds fair odds to the tote ladder', () => {
    expect(toteFraction(7.86)).toBe('7-1');
    expect(toteFraction(3.996)).toBe('3-1');
    expect(toteFraction(4.2)).toBe('3-1');
    expect(toteFraction(1.15)).toBe('1-9');
    expect(toteFraction(1.52)).toBe('1-2');
    expect(fmtOdds(80.1, 'fractional', { round: 'tote' })).toBe('79-1');
  });
  it('formats decimal and American with a true minus', () => {
    expect(fmtOdds(3.5, 'decimal')).toBe('3.50');
    expect(toAmerican(3.5)).toBe('+250');
    expect(toAmerican(2)).toBe('+100');
    expect(toAmerican(1.5)).toBe(`${MINUS}200`);
    expect(fmtOdds(null, 'american')).toBe('—');
  });
  it('parses what users type', () => {
    expect(parseOddsInput('5-2', 'fractional')).toBe(3.5);
    expect(parseOddsInput('9/5', 'fractional')).toBe(2.8);
    expect(parseOddsInput('12', 'fractional')).toBe(13);
    expect(parseOddsInput('3.50', 'decimal')).toBe(3.5);
    expect(parseOddsInput('+250', 'american')).toBe(3.5);
    expect(parseOddsInput('-200', 'american')).toBe(1.5);
    expect(parseOddsInput('even', 'fractional')).toBe(2);
    expect(parseOddsInput('abc', 'fractional')).toBeNull();
    expect(parseOddsInput('0-1', 'fractional')).toBeNull();
  });
  it('sends prices in a backend-parseable form', () => {
    expect(decimalToWire(3.5)).toBe('5-2');
    expect(decimalToWire(3.37)).toBe('2.37-1');
    expect(/^\d+(\.\d+)?-\d+$/.test(decimalToWire(17.25))).toBe(true);
  });
  it('speaks odds as "to"', () => {
    expect(oddsSpeech('5-2')).toBe('5 to 2');
  });
});

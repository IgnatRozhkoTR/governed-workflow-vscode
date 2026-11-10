import { describe, expect, it } from 'vitest';
import { capitalizeFirstLetter, describeError, timeAgo } from '../../webview-ui/src/lib/format';
import { RpcError } from '../../webview-ui/src/rpc/rpcClient';

describe('describeError', () => {
  it('describeError_shouldReturnMessageOnce_whenMessageEqualsCode', () => {
    expect(describeError(new RpcError('Criterion not found', 'Criterion not found', 404))).toBe('Criterion not found');
  });

  it('describeError_shouldHideSnakeCaseCode_whenMessageIsPresent', () => {
    expect(describeError(new RpcError('criterion_not_found', 'Criterion not found', 404))).toBe('Criterion not found');
  });

  it('describeError_shouldFallBackToCode_whenMessageIsEmpty', () => {
    expect(describeError(new RpcError('criterion_not_found', '', 404))).toBe('criterion_not_found');
  });

  it('describeError_shouldReturnErrorMessage_whenErrorIsNotRpcError', () => {
    expect(describeError(new Error('boom'))).toBe('boom');
  });

  it('describeError_shouldStringifyValue_whenThrownValueIsNotError', () => {
    expect(describeError('plain failure')).toBe('plain failure');
  });
});

describe('timeAgo', () => {
  const NOW = new Date('2026-11-09T12:00:00');

  it('timeAgo_shouldSayNow_whenTimestampIsInTheFuture', () => {
    expect(timeAgo('2026-11-09T12:00:37', NOW)).toBe('now');
  });

  it('timeAgo_shouldSayNow_whenTimestampIsUnderAMinuteOld', () => {
    expect(timeAgo('2026-11-09T11:59:40', NOW)).toBe('now');
  });

  it('timeAgo_shouldUseLargestUnit_whenTimestampIsOlder', () => {
    expect(timeAgo('2026-11-09T10:00:00', NOW)).toBe('2 hours ago');
  });
});

describe('capitalizeFirstLetter', () => {
  it('capitalizeFirstLetter_shouldCapitalizeOnlyTheFirstWord_whenLabelIsLowercase', () => {
    expect(capitalizeFirstLetter('false positive')).toBe('False positive');
  });

  it('capitalizeFirstLetter_shouldSkipLeadingSymbols_whenLabelStartsWithAnIcon', () => {
    expect(capitalizeFirstLetter('⚠ outdated')).toBe('⚠ Outdated');
  });

  it('capitalizeFirstLetter_shouldCapitalizeCyrillic_whenLabelIsRussian', () => {
    expect(capitalizeFirstLetter('вне области')).toBe('Вне области');
  });

  it('capitalizeFirstLetter_shouldLeaveTextUnchanged_whenItHasNoLetters', () => {
    expect(capitalizeFirstLetter('42 · —')).toBe('42 · —');
  });
});

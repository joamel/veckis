import { describe, it, expect, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';

vi.mock('@sentry/node', () => ({ captureException: vi.fn() }));
import * as Sentry from '@sentry/node';
import { aiErrorResponse, AI_UNAVAILABLE_RECIPE } from './aiError';

describe('aiErrorResponse', () => {
  it('visar aldrig Anthropics råa fel — utgiftsgränsen blir ett vänligt 503', () => {
    const err = new Anthropic.APIError(400, { type: 'error', error: { type: 'invalid_request_error', message: 'You have reached your specified API usage limits.' } }, undefined, new Headers());
    const svar = aiErrorResponse(err, AI_UNAVAILABLE_RECIPE, 'reserv');
    expect(svar).toEqual({ status: 503, error: AI_UNAVAILABLE_RECIPE });
    expect(svar.error).not.toContain('usage limits');
    expect(Sentry.captureException).toHaveBeenCalledWith(err);
  });

  it('släpper igenom våra egna, användarskrivna fel', () => {
    expect(aiErrorResponse(new Error('Instagram visar inte inlägget för oss'), AI_UNAVAILABLE_RECIPE, 'reserv'))
      .toEqual({ status: 422, error: 'Instagram visar inte inlägget för oss' });
  });

  it('använder reservtexten för okända fel', () => {
    expect(aiErrorResponse('konstigt', AI_UNAVAILABLE_RECIPE, 'reserv')).toEqual({ status: 422, error: 'reserv' });
  });
});

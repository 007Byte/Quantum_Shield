// #65: srpInit() must convert the server's 409 SRP_REREGISTRATION_REQUIRED into a
// typed ReRegistrationRequiredError so the login UI can route the user to
// re-registration instead of showing a generic "wrong password" message.

// Stable mock fns (the `mock` prefix lets the hoisted jest.mock factory reference
// them). The cached axios client indirects post/isAxiosError through these, so we
// reconfigure them per-test without resetting modules.
const mockPost = jest.fn();
const mockIsAxiosError = jest.fn();

jest.mock('axios', () => {
  const client = {
    post: (...args: unknown[]) => mockPost(...args),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
  };
  const mod = {
    create: jest.fn(() => client),
    isAxiosError: (...args: unknown[]) => mockIsAxiosError(...args),
  };
  return { __esModule: true, default: mod, ...mod };
});

import * as api from '@/services/api';

describe('#65 forced re-registration — srpInit 409 handling', () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockIsAxiosError.mockReset();
  });

  it('throws ReRegistrationRequiredError on 409 SRP_REREGISTRATION_REQUIRED', async () => {
    mockPost.mockRejectedValue({
      response: { status: 409, data: { code: 'SRP_REREGISTRATION_REQUIRED' } },
    });
    mockIsAxiosError.mockReturnValue(true);

    await expect(api.srpInit('user@example.com')).rejects.toBeInstanceOf(
      api.ReRegistrationRequiredError
    );
  });

  it('re-throws a non-reregistration error (e.g. 401) unchanged', async () => {
    const err = { response: { status: 401, data: {} } };
    mockPost.mockRejectedValue(err);
    mockIsAxiosError.mockReturnValue(true);

    await expect(api.srpInit('user@example.com')).rejects.toBe(err);
  });

  it('does NOT treat a 409 with a different code as re-registration', async () => {
    const err = { response: { status: 409, data: { code: 'SOMETHING_ELSE' } } };
    mockPost.mockRejectedValue(err);
    mockIsAxiosError.mockReturnValue(true);

    await expect(api.srpInit('user@example.com')).rejects.toBe(err);
  });

  it('returns the init params on success', async () => {
    mockPost.mockResolvedValue({ data: { salt: 'aa', B: 'bb', sessionId: 's1' } });

    await expect(api.srpInit('user@example.com')).resolves.toEqual({
      salt: 'aa',
      B: 'bb',
      sessionId: 's1',
    });
  });
});

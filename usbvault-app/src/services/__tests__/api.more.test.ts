/**
 * Additional API client tests — extends api.test.ts.
 *
 * Focus: REAL behavior of the axios-based HTTP client:
 *  - request/response shaping for vault, share, user, device endpoints
 *  - auth-header injection + request-ID generation (request interceptor)
 *  - 401 → token-refresh-then-retry, refresh failure → token clearing
 *    (response interceptor)
 *  - network-error retry with exponential backoff (response interceptor)
 *  - status-code branches (SRP 409 re-registration, validateResponse)
 *  - token refresh body shaping (native) + device-fingerprint inclusion
 *
 * Boundaries mocked: axios (network), expo-secure-store (native keychain),
 * certificatePinning (env-injected pins), auditService (storage). The file
 * under test (api.ts) is NEVER mocked.
 *
 * The api module memoizes its axios client in a module-scoped `let`, so each
 * test that needs a fresh client + fresh interceptors re-requires the module
 * via `loadFreshApi()` (jest.resetModules under the hood). This lets us capture
 * the interceptor handlers the client registered and drive them directly.
 */

const ACCESS_KEY = 'usbvault_access_token';
const REFRESH_KEY = 'usbvault_refresh_token';

interface FakeClient {
  get: jest.Mock;
  post: jest.Mock;
  delete: jest.Mock;
  callable: jest.Mock; // client(originalRequest) used by the retry path
  interceptors: {
    request: { use: jest.Mock };
    response: { use: jest.Mock };
  };
  requestHandlers: ((c: any) => any)[];
  requestErrorHandlers: ((e: any) => any)[];
  responseHandlers: ((r: any) => any)[];
  responseErrorHandlers: ((e: any) => any)[];
}

function makeFakeClient(): FakeClient {
  const requestHandlers: ((c: any) => any)[] = [];
  const requestErrorHandlers: ((e: any) => any)[] = [];
  const responseHandlers: ((r: any) => any)[] = [];
  const responseErrorHandlers: ((e: any) => any)[] = [];

  // The retry path re-invokes `client(originalRequest)`, so the client must be
  // callable. We build a jest.fn and hang the rest of the shape off it.
  const callable: any = jest.fn();
  callable.get = jest.fn();
  callable.post = jest.fn();
  callable.delete = jest.fn();
  callable.interceptors = {
    request: {
      use: jest.fn((ok: any, err: any) => {
        if (ok) requestHandlers.push(ok);
        if (err) requestErrorHandlers.push(err);
      }),
    },
    response: {
      use: jest.fn((ok: any, err: any) => {
        if (ok) responseHandlers.push(ok);
        if (err) responseErrorHandlers.push(err);
      }),
    },
  };
  callable.callable = callable;
  callable.requestHandlers = requestHandlers;
  callable.requestErrorHandlers = requestErrorHandlers;
  callable.responseHandlers = responseHandlers;
  callable.responseErrorHandlers = responseErrorHandlers;
  return callable as FakeClient;
}

interface FreshApi {
  api: typeof import('@/services/api');
  client: FakeClient;
  axios: any;
  SecureStore: any;
  auditService: { log: jest.Mock };
}

/**
 * Re-require the api module in isolation with all boundaries mocked, force the
 * memoized axios client to be created, and return the fresh module + the
 * captured fake client (with its interceptor handlers).
 */
function loadFreshApi(opts?: { pinsConfigured?: boolean }): FreshApi {
  const pinsConfigured = opts?.pinsConfigured ?? true;
  let captured!: FakeClient;
  let mod!: typeof import('@/services/api');
  let axiosMock: any;
  let secureStore: any;
  // Definitely assigned inside the synchronous isolateModules callback below;
  // the `!` tells tsc not to flag use-before-assign (it cannot see that the
  // callback runs synchronously).
  let auditMock!: { log: jest.Mock };

  jest.isolateModules(() => {
    jest.doMock('../security/certificatePinning', () => ({
      arePinsConfigured: jest.fn(() => pinsConfigured),
      initializeCertificatePinning: jest.fn(() => ({
        initialized: true,
        validationResult: { valid: true, errors: [] },
      })),
    }));
    auditMock = { log: jest.fn().mockResolvedValue(undefined) };
    jest.doMock('../auditService', () => ({ auditService: auditMock }));

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    axiosMock = require('axios');
    axiosMock.create = jest.fn(() => {
      captured = makeFakeClient();
      return captured;
    });
    axiosMock.isAxiosError = jest.fn((e: any) => !!(e && e.response));
    axiosMock.post = jest.fn();

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    secureStore = require('expo-secure-store');
    secureStore.getItemAsync = jest.fn().mockResolvedValue(null);
    secureStore.setItemAsync = jest.fn().mockResolvedValue(undefined);
    secureStore.deleteItemAsync = jest.fn().mockResolvedValue(undefined);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    mod = require('@/services/api');
    // The axios client is created lazily on first getApiClient() call, not at
    // module load. Trigger creation synchronously via a client-using call so the
    // interceptors register and `captured` is populated. deleteVault resolves
    // getApiClient() synchronously before it awaits, so axios.create runs now.
    (mod as any).deleteVault('__warmup__').catch(() => {});
    captured.get.mockResolvedValue({ data: [] });
    captured.post.mockResolvedValue({ data: {} });
    captured.delete.mockResolvedValue({ data: {} });
  });

  return {
    api: mod,
    client: captured,
    axios: axiosMock,
    SecureStore: secureStore,
    auditService: auditMock,
  };
}

describe('API Client — request/response shaping', () => {
  describe('Vault operations', () => {
    it('listVaults returns flat array response unchanged (legacy format)', async () => {
      const { api, client } = loadFreshApi();
      const vaults = [
        { id: 'v1', name: 'Personal', fileCount: 3 },
        { id: 'v2', name: 'Work', fileCount: 7 },
      ];
      client.get.mockResolvedValue({ data: vaults });

      const result = await api.listVaults();

      expect(client.get).toHaveBeenCalledWith('/vaults');
      expect(result).toEqual(vaults);
    });

    it('listVaults unwraps { vaults } envelope (paginated format)', async () => {
      const { api, client } = loadFreshApi();
      client.get.mockResolvedValue({ data: { vaults: [{ id: 'v9' }], has_more: false } });

      const result = await api.listVaults();
      expect(result).toEqual([{ id: 'v9' }]);
    });

    it('listVaults returns [] when envelope has no vaults field', async () => {
      const { api, client } = loadFreshApi();
      client.get.mockResolvedValue({ data: { has_more: false } });

      expect(await api.listVaults()).toEqual([]);
    });

    it('listVaultsPaginated sends limit + cursor params and shapes the response', async () => {
      const { api, client } = loadFreshApi();
      client.get.mockResolvedValue({
        data: { vaults: [{ id: 'v1' }], next_cursor: 'cur-2', has_more: true },
      });

      const page = await api.listVaultsPaginated('cur-1', 25);

      expect(client.get).toHaveBeenCalledWith('/vaults', {
        params: { limit: '25', cursor: 'cur-1' },
      });
      expect(page).toEqual({
        vaults: [{ id: 'v1' }],
        next_cursor: 'cur-2',
        has_more: true,
      });
    });

    it('listVaultsPaginated omits cursor when not provided and defaults has_more to false', async () => {
      const { api, client } = loadFreshApi();
      client.get.mockResolvedValue({ data: { vaults: [] } });

      const page = await api.listVaultsPaginated();

      expect(client.get).toHaveBeenCalledWith('/vaults', { params: { limit: '50' } });
      expect(page.has_more).toBe(false);
      expect(page.next_cursor).toBeUndefined();
    });

    it('createVault posts the request and returns the new vaultId', async () => {
      const { api, client } = loadFreshApi();
      client.post.mockResolvedValue({ data: { vaultId: 'vault-7f3a' } });

      const req = { name: 'Docs', encryptedMetadata: 'YmFzZTY0', wrappedMek: 'd3JhcA==' };
      const id = await api.createVault(req);

      expect(client.post).toHaveBeenCalledWith('/vaults', req);
      expect(id).toBe('vault-7f3a');
    });

    it('deleteVault issues DELETE to the vault-scoped path', async () => {
      const { api, client } = loadFreshApi();
      client.delete.mockResolvedValue({ data: {} });

      await api.deleteVault('vault-42');
      expect(client.delete).toHaveBeenCalledWith('/vaults/vault-42');
    });
  });

  describe('Blob upload/download', () => {
    it('getUploadUrl posts the request body and returns the presigned URL', async () => {
      const { api, client } = loadFreshApi();
      client.post.mockResolvedValue({
        data: { uploadUrl: 'https://s3.example/put', method: 'PUT' },
      });

      const req = { vaultId: 'v1', blobId: 'blob-1', encryptedMetadata: 'bWV0YQ==', size: 1024 };
      const res = await api.getUploadUrl(req);

      expect(client.post).toHaveBeenCalledWith('/blobs/upload-url', req);
      expect(res).toEqual({ uploadUrl: 'https://s3.example/put', method: 'PUT' });
    });

    it('confirmUpload posts blob_id and returns the server-confirmed size', async () => {
      const { api, client } = loadFreshApi();
      client.post.mockResolvedValue({ data: { confirmed: true, size: 2048 } });

      const res = await api.confirmUpload('v1', 'blob-9');

      expect(client.post).toHaveBeenCalledWith('/vaults/v1/blobs/confirm', { blob_id: 'blob-9' });
      expect(res).toEqual({ confirmed: true, size: 2048 });
    });

    it('getDownloadUrl GETs the blob download path', async () => {
      const { api, client } = loadFreshApi();
      client.get.mockResolvedValue({ data: { downloadUrl: 'https://s3.example/get' } });

      const res = await api.getDownloadUrl('v1', 'blob-2');

      expect(client.get).toHaveBeenCalledWith('/vaults/v1/blobs/blob-2/download-url');
      expect(res.downloadUrl).toBe('https://s3.example/get');
    });
  });

  describe('Share operations', () => {
    it('createShare posts the request and returns shareId', async () => {
      const { api, client } = loadFreshApi();
      client.post.mockResolvedValue({ data: { shareId: 'share-1b2c' } });

      const req = { vaultId: 'v1', blobId: 'b1', recipientId: 'u2', encryptedKey: 'c2VhbGVk' };
      const id = await api.createShare(req);

      expect(client.post).toHaveBeenCalledWith('/shares', req);
      expect(id).toBe('share-1b2c');
    });

    it('listIncomingShares unwraps the shares envelope', async () => {
      const { api, client } = loadFreshApi();
      client.get.mockResolvedValue({ data: { shares: [{ id: 's1' }, { id: 's2' }] } });

      const res = await api.listIncomingShares();
      expect(client.get).toHaveBeenCalledWith('/shares/incoming');
      expect(res).toHaveLength(2);
    });

    it('listIncomingShares returns [] when envelope lacks shares', async () => {
      const { api, client } = loadFreshApi();
      client.get.mockResolvedValue({ data: {} });

      expect(await api.listIncomingShares()).toEqual([]);
    });

    it('listOutgoingShares hits the outgoing endpoint', async () => {
      const { api, client } = loadFreshApi();
      client.get.mockResolvedValue({ data: { shares: [{ id: 'so1' }] } });

      const res = await api.listOutgoingShares();
      expect(client.get).toHaveBeenCalledWith('/shares/outgoing');
      expect(res).toHaveLength(1);
    });

    it('acceptShare / rejectShare / revokeShare hit the right verbs + paths', async () => {
      const { api, client } = loadFreshApi();
      client.post.mockResolvedValue({ data: {} });
      client.delete.mockResolvedValue({ data: {} });

      await api.acceptShare('s1');
      await api.rejectShare('s2');
      await api.revokeShare('s3');

      expect(client.post).toHaveBeenCalledWith('/shares/s1/accept');
      expect(client.post).toHaveBeenCalledWith('/shares/s2/reject');
      expect(client.delete).toHaveBeenCalledWith('/shares/s3');
    });
  });

  describe('User + account + device endpoints', () => {
    it('getUserInfo GETs the profile on native and returns the body', async () => {
      // jest.setup default Platform.OS is "ios" (native) → real request path.
      const { api, client } = loadFreshApi();
      client.get.mockResolvedValue({
        data: { id: 'u1', email: 'user@example.com', subscriptionTier: 'pro' },
      });

      const res = await api.getUserInfo();

      expect(client.get).toHaveBeenCalledWith('/user/profile');
      expect(res.subscriptionTier).toBe('pro');
    });

    it('getPublicKey decodes base64 publicKey to a Uint8Array', async () => {
      const { api, client } = loadFreshApi();
      const b64 = Buffer.from([1, 2, 3, 4]).toString('base64');
      client.get.mockResolvedValue({ data: { publicKey: b64 } });

      const key = await api.getPublicKey('user-77');

      expect(client.get).toHaveBeenCalledWith('/users/user-77/public-key');
      expect(key).toBeInstanceOf(Uint8Array);
      expect(Array.from(key)).toEqual([1, 2, 3, 4]);
    });

    it('changePassword posts old proof + new verifier', async () => {
      const { api, client } = loadFreshApi();
      client.post.mockResolvedValue({ data: {} });

      await api.changePassword('proof-hex', 'verifier-hex');
      expect(client.post).toHaveBeenCalledWith('/user/change-password', {
        oldPasswordProof: 'proof-hex',
        newPasswordVerifier: 'verifier-hex',
      });
    });

    it('deleteAccount DELETEs the account endpoint', async () => {
      const { api, client } = loadFreshApi();
      client.delete.mockResolvedValue({ data: {} });

      await api.deleteAccount();
      expect(client.delete).toHaveBeenCalledWith('/user/account');
    });

    it('registerFido2Device posts the request and returns deviceId', async () => {
      const { api, client } = loadFreshApi();
      client.post.mockResolvedValue({ data: { deviceId: 'dev-3' } });

      const id = await api.registerFido2Device({
        name: 'YubiKey',
        credentialId: 'Y3JlZA==',
        publicKey: 'cHVi',
      });
      expect(client.post).toHaveBeenCalledWith('/user/fido2-devices', expect.any(Object));
      expect(id).toBe('dev-3');
    });

    it('listFido2Devices unwraps the devices envelope and returns [] when absent', async () => {
      const { api, client } = loadFreshApi();
      client.get.mockResolvedValueOnce({ data: { devices: [{ id: 'd1' }] } });
      expect(await api.listFido2Devices()).toHaveLength(1);

      client.get.mockResolvedValueOnce({ data: {} });
      expect(await api.listFido2Devices()).toEqual([]);
    });

    it('revokeFido2Device DELETEs the device path', async () => {
      const { api, client } = loadFreshApi();
      client.delete.mockResolvedValue({ data: {} });

      await api.revokeFido2Device('dev-9');
      expect(client.delete).toHaveBeenCalledWith('/user/fido2-devices/dev-9');
    });
  });

  describe('SRP authentication', () => {
    it('srpInit posts the email and returns salt/B/sessionId', async () => {
      const { api, client } = loadFreshApi();
      client.post.mockResolvedValue({ data: { salt: 'a1b2', B: 'c3d4', sessionId: 'sess-1' } });

      const res = await api.srpInit('user@example.com');

      expect(client.post).toHaveBeenCalledWith('/auth/srp/init', { email: 'user@example.com' });
      expect(res.sessionId).toBe('sess-1');
    });

    it('srpInit maps HTTP 409 + SRP_REREGISTRATION_REQUIRED to ReRegistrationRequiredError', async () => {
      const { api, client } = loadFreshApi();
      const err: any = new Error('conflict');
      err.response = { status: 409, data: { code: api.SRP_REREGISTRATION_REQUIRED } };
      client.post.mockRejectedValue(err);

      await expect(api.srpInit('old@example.com')).rejects.toBeInstanceOf(
        api.ReRegistrationRequiredError
      );
    });

    it('srpInit rethrows a generic error unchanged (non-409)', async () => {
      const { api, client } = loadFreshApi();
      const err: any = new Error('wrong password');
      err.response = { status: 401, data: {} };
      client.post.mockRejectedValue(err);

      await expect(api.srpInit('user@example.com')).rejects.toThrow('wrong password');
    });

    it('srpVerify posts the proof and returns tokens + server proof', async () => {
      const { api, client } = loadFreshApi();
      client.post.mockResolvedValue({
        data: {
          M2: 'serverproof',
          accessToken: 'access.jwt.value',
          refreshToken: 'refresh.jwt.value',
          userId: 'u1',
          email: 'user@example.com',
        },
      });

      const res = await api.srpVerify({ sessionId: 'sess-1', A: 'aa', M1: 'bb' });

      expect(client.post).toHaveBeenCalledWith(
        '/auth/srp/verify',
        { sessionId: 'sess-1', A: 'aa', M1: 'bb' },
        expect.objectContaining({ withCredentials: expect.any(Boolean) })
      );
      expect(res.accessToken).toBe('access.jwt.value');
    });
  });

  describe('ReRegistrationRequiredError', () => {
    it('carries the SRP re-registration code and a name', () => {
      const { api } = loadFreshApi();
      const e = new api.ReRegistrationRequiredError();
      expect(e.code).toBe(api.SRP_REREGISTRATION_REQUIRED);
      expect(e.name).toBe('ReRegistrationRequiredError');
      expect(e).toBeInstanceOf(Error);
    });
  });
});

describe('API Client — request interceptor', () => {
  it('injects Authorization: Bearer <token> when a token is stored', async () => {
    const { client, SecureStore } = loadFreshApi();
    SecureStore.getItemAsync.mockResolvedValue('stored.access.token');
    const config: any = { headers: {} };

    const out = await client.requestHandlers[0](config);

    expect(out.headers.Authorization).toBe('Bearer stored.access.token');
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith(ACCESS_KEY);
  });

  it('does NOT set Authorization when no token is stored', async () => {
    const { client, SecureStore } = loadFreshApi();
    SecureStore.getItemAsync.mockResolvedValue(null);
    const config: any = { headers: {} };

    const out = await client.requestHandlers[0](config);

    expect(out.headers.Authorization).toBeUndefined();
  });

  it('always attaches a UUIDv4 X-Request-ID header', async () => {
    const { client, SecureStore } = loadFreshApi();
    SecureStore.getItemAsync.mockResolvedValue(null);
    const config: any = { headers: {} };

    const out = await client.requestHandlers[0](config);

    expect(out.headers['X-Request-ID']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  it('still proceeds (with request ID) when token retrieval throws', async () => {
    const { client, SecureStore } = loadFreshApi();
    SecureStore.getItemAsync.mockRejectedValue(new Error('keychain locked'));
    const config: any = { headers: {} };

    const out = await client.requestHandlers[0](config);

    expect(out.headers.Authorization).toBeUndefined();
    expect(out.headers['X-Request-ID']).toBeDefined();
  });

  it('rejects via the request error handler', async () => {
    const { client } = loadFreshApi();
    const boom = new Error('config error');
    await expect(client.requestErrorHandlers[0](boom)).rejects.toBe(boom);
  });
});

describe('API Client — response interceptor (retry + refresh)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('passes successful responses straight through', () => {
    const { client } = loadFreshApi();
    const resp = { status: 200, data: { ok: true } };
    expect(client.responseHandlers[0](resp)).toBe(resp);
  });

  it('retries network errors with exponential backoff then succeeds', async () => {
    const { client } = loadFreshApi();
    const errorHandler = client.responseErrorHandlers[0];
    const originalRequest: any = { headers: {} };
    const netErr: any = {
      message: 'connect ECONNREFUSED 127.0.0.1:443',
      config: originalRequest,
      response: undefined,
    };
    // Re-invoking the client (the retry) resolves successfully.
    client.callable.mockResolvedValue({ status: 200, data: 'recovered' });

    const promise = errorHandler(netErr);
    // Backoff is 1000ms for the first retry; let the setTimeout fire.
    await Promise.resolve();
    jest.advanceTimersByTime(1000);
    const result = await promise;

    expect(result).toEqual({ status: 200, data: 'recovered' });
    expect(originalRequest._retryCount).toBe(1);
    // A fresh request ID was generated for the retry.
    expect(originalRequest.headers['X-Request-ID']).toMatch(/^[0-9a-f]{8}-/);
  });

  it('does NOT retry a 4xx HTTP error (not a network error)', async () => {
    const { client } = loadFreshApi();
    const errorHandler = client.responseErrorHandlers[0];
    const httpErr: any = {
      message: 'Request failed with status code 400',
      response: { status: 400, data: {} },
      config: { headers: {} },
    };

    await expect(errorHandler(httpErr)).rejects.toBe(httpErr);
    expect(httpErr.config._retryCount).toBeUndefined();
  });

  it('on 401 refreshes the token (native body) then retries the original request', async () => {
    const { client, axios, SecureStore } = loadFreshApi();
    SecureStore.getItemAsync.mockResolvedValue('refresh.token.value');
    const errorHandler = client.responseErrorHandlers[0];
    const originalRequest: any = { headers: {}, url: '/vaults' };
    const unauthorized: any = {
      message: 'Request failed with status code 401',
      response: { status: 401 },
      config: originalRequest,
    };

    // refreshAccessToken() (native) posts to /auth/refresh via the raw axios.post.
    axios.post.mockResolvedValue({
      data: { accessToken: 'new.access', refreshToken: 'new.refresh' },
    });
    // After refresh, api(originalRequest) is the memoized client → returns success.
    client.callable.mockResolvedValue({ status: 200, data: 'after-refresh' });

    const result = await errorHandler(unauthorized);

    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/auth/refresh'),
      expect.objectContaining({
        refreshToken: 'refresh.token.value',
        deviceFingerprint: expect.any(String),
      })
    );
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(ACCESS_KEY, 'new.access');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(REFRESH_KEY, 'new.refresh');
    expect(result).toEqual({ status: 200, data: 'after-refresh' });
  });

  it('on 401 when refresh fails (no refresh token), clears tokens and rejects', async () => {
    const { client, SecureStore } = loadFreshApi();
    SecureStore.getItemAsync.mockResolvedValue(null); // no refresh token
    const errorHandler = client.responseErrorHandlers[0];
    const originalRequest: any = { headers: {} };
    const unauthorized: any = {
      message: 'Request failed with status code 401',
      response: { status: 401 },
      config: originalRequest,
    };

    await expect(errorHandler(unauthorized)).rejects.toBeDefined();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(ACCESS_KEY);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(REFRESH_KEY);
  });

  it('does not double-refresh: a 401 already marked _authRetry just rejects', async () => {
    const { client, axios } = loadFreshApi();
    const errorHandler = client.responseErrorHandlers[0];
    const unauthorized: any = {
      message: 'Request failed with status code 401',
      response: { status: 401 },
      config: { headers: {}, _authRetry: true },
    };

    await expect(errorHandler(unauthorized)).rejects.toBe(unauthorized);
    expect(axios.post).not.toHaveBeenCalled();
  });
});

describe('API Client — TLS/pin-failure interceptor', () => {
  it('registers a second response interceptor when pins are configured', () => {
    const { client } = loadFreshApi({ pinsConfigured: true });
    // request: 1 use; response: 2 uses (refresh + pin guard).
    expect(client.interceptors.response.use.mock.calls.length).toBe(2);
  });

  it('does NOT register the pin interceptor when pins are not configured', () => {
    const { client } = loadFreshApi({ pinsConfigured: false });
    expect(client.interceptors.response.use.mock.calls.length).toBe(1);
  });

  it('logs an audit event on a TLS certificate error', async () => {
    const { client, auditService } = loadFreshApi({ pinsConfigured: true });
    // The pin-failure interceptor is the SECOND response error handler registered.
    const pinErrorHandler = client.responseErrorHandlers[1];
    const tlsErr: any = {
      code: 'ERR_TLS_CERT_ALTNAME_INVALID',
      message: 'Hostname/IP does not match certificate altnames',
      config: { url: '/vaults' },
    };

    await expect(pinErrorHandler(tlsErr)).rejects.toBe(tlsErr);
    expect(auditService.log).toHaveBeenCalledWith(
      'system',
      'certificate_pin_failure',
      expect.objectContaining({ url: '/vaults' }),
      'error'
    );
  });

  it('passes non-TLS errors through the pin interceptor without auditing', async () => {
    const { client, auditService } = loadFreshApi({ pinsConfigured: true });
    const pinErrorHandler = client.responseErrorHandlers[1];
    const plainErr: any = { code: 'SOMETHING_ELSE', message: 'boom', config: {} };

    await expect(pinErrorHandler(plainErr)).rejects.toBe(plainErr);
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('passes responses through the pin success interceptor unchanged', () => {
    const { client } = loadFreshApi({ pinsConfigured: true });
    const pinSuccessHandler = client.responseHandlers[1];
    const resp = { status: 200, data: 'ok' };
    expect(pinSuccessHandler(resp)).toBe(resp);
  });
});

describe('API Client — token helpers + validateResponse', () => {
  it('getAccessToken returns the stored token', async () => {
    const { api, SecureStore } = loadFreshApi();
    SecureStore.getItemAsync.mockResolvedValue('the.access.token');
    expect(await api.getAccessToken()).toBe('the.access.token');
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith(ACCESS_KEY);
  });

  it('getAccessToken returns null when the store throws', async () => {
    const { api, SecureStore } = loadFreshApi();
    SecureStore.getItemAsync.mockRejectedValue(new Error('locked'));
    expect(await api.getAccessToken()).toBeNull();
  });

  it('clearTokens deletes both tokens on native', async () => {
    const { api, SecureStore } = loadFreshApi();
    await api.clearTokens();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(ACCESS_KEY);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(REFRESH_KEY);
  });

  describe('createAbortableRequest', () => {
    it('returns a live signal and an abort() that aborts it', () => {
      const { api } = loadFreshApi();
      const { signal, abort } = api.createAbortableRequest();
      expect(signal.aborted).toBe(false);
      abort();
      expect(signal.aborted).toBe(true);
    });
  });

  describe('validateResponse', () => {
    it('returns the data unchanged when all required fields are present + typed', () => {
      const { api } = loadFreshApi();
      const data = { id: 'v1', count: 3, ok: true };
      const out = api.validateResponse(
        data,
        [
          { key: 'id', type: 'string' },
          { key: 'count', type: 'number' },
          { key: 'ok', type: 'boolean' },
        ],
        'vault'
      );
      expect(out).toBe(data);
    });

    it('throws when the value is not an object', () => {
      const { api } = loadFreshApi();
      expect(() => api.validateResponse(null, [], 'ctx')).toThrow(/expected object/);
      expect(() => api.validateResponse('str', [], 'ctx')).toThrow(/expected object/);
    });

    it('throws when a required field is missing', () => {
      const { api } = loadFreshApi();
      expect(() =>
        api.validateResponse({ id: 'v1' }, [{ key: 'missing', type: 'string' }], 'ctx')
      ).toThrow(/Missing required field: missing/);
    });

    it('throws when a field has the wrong type', () => {
      const { api } = loadFreshApi();
      expect(() =>
        api.validateResponse({ count: 'not-a-number' }, [{ key: 'count', type: 'number' }], 'ctx')
      ).toThrow(/expected number, got string/);
    });
  });
});

/**
 * PH4-FIX: Stub for key verification service.
 * TODO: Implement key verification protocol.
 */

class KeyVerificationServiceStub {
  async verifyKey(_key: Uint8Array): Promise<boolean> {
    return true;
  }

  async generateVerificationCode(_key: Uint8Array): Promise<string> {
    return '000000';
  }
}

export const keyVerificationService = new KeyVerificationServiceStub();

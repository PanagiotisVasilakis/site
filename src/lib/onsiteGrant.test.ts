import jwt from 'jsonwebtoken';
import { isOnsiteConfirmationEnabled, readBearerToken, verifyOnsiteGrantToken } from './onsiteGrant';

const secret = 'a-secure-onsite-confirmation-secret-123456';
const bookingId = '22222222-2222-4222-8222-222222222222';
const jti = '11111111-1111-4111-8111-111111111111';

describe('onsite confirmation grants', () => {
  beforeEach(() => {
    process.env.ONSITE_CONFIRM_ENABLED = '1';
    process.env.ONSITE_CONFIRM_JWT_SECRET = secret;
  });

  afterEach(() => {
    delete process.env.ONSITE_CONFIRM_ENABLED;
    delete process.env.ONSITE_CONFIRM_JWT_SECRET;
  });

  it('requires both the feature switch and a sufficiently long secret', () => {
    expect(isOnsiteConfirmationEnabled()).toBe(true);
    process.env.ONSITE_CONFIRM_JWT_SECRET = 'short';
    expect(isOnsiteConfirmationEnabled()).toBe(false);
  });

  it('accepts only signed HS256 tokens with the expected audience and UUID claims', () => {
    const token = jwt.sign({ bookingId }, secret, {
      algorithm: 'HS256', audience: 'onsite-confirm', jwtid: jti, expiresIn: '5m',
    });
    expect(verifyOnsiteGrantToken(token)).toEqual(expect.objectContaining({ bookingId, jti }));

    const wrongAudience = jwt.sign({ bookingId }, secret, {
      algorithm: 'HS256', audience: 'another-service', jwtid: jti, expiresIn: '5m',
    });
    expect(verifyOnsiteGrantToken(wrongAudience)).toBeNull();
  });

  it('rejects malformed claims and parses strict bearer headers', () => {
    const malformed = jwt.sign({ bookingId: 'not-a-uuid' }, secret, {
      algorithm: 'HS256', audience: 'onsite-confirm', jwtid: jti, expiresIn: '5m',
    });
    expect(verifyOnsiteGrantToken(malformed)).toBeNull();
    expect(readBearerToken('Bearer signed-token')).toBe('signed-token');
    expect(readBearerToken('Basic signed-token')).toBeNull();
    expect(readBearerToken(null)).toBeNull();
  });
});

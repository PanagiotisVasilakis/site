import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { ApiErrorCode, readJsonBody } from './apiErrorHandler';

function request(body: BodyInit, contentType = 'application/json') {
  return new NextRequest('http://localhost/api/test', {
    method: 'POST',
    headers: { 'content-type': contentType },
    body,
  });
}

describe('readJsonBody', () => {
  it('parses a bounded JSON request', async () => {
    await expect(readJsonBody(request('{"ok":true}'), 64)).resolves.toEqual({ ok: true });
  });

  it('enforces the actual UTF-8 byte count', async () => {
    await expect(readJsonBody(request('"€"'), 4)).rejects.toMatchObject({
      code: ApiErrorCode.PAYLOAD_TOO_LARGE,
      statusCode: 413,
    });
  });

  it('rejects an unsupported media type', async () => {
    await expect(readJsonBody(request('{}', 'text/plain'), 64)).rejects.toMatchObject({
      code: ApiErrorCode.UNSUPPORTED_MEDIA_TYPE,
      statusCode: 415,
    });
  });
});

import { HttpException, HttpStatus } from '@nestjs/common';
import type { AccountToolError, AccountToolErrorCode } from '@relayops/contracts';

/** Deliberately generic errors prevent reference and draft enumeration across tenants. */
export class AccountToolException extends HttpException {
  constructor(readonly code: AccountToolErrorCode, status: HttpStatus) {
    const body: AccountToolError = { kind: 'error', code };
    super(body, status);
  }
}

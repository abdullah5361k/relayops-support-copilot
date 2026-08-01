import { Global, Module } from '@nestjs/common';
import { DemoSessionGuard } from './demo-session.guard';
import { DemoSessionResolver } from './demo-session.resolver';

/** Shared server-only demo-session authority for guarded and optional support reads. */
@Global()
@Module({ providers: [DemoSessionGuard, DemoSessionResolver], exports: [DemoSessionGuard, DemoSessionResolver] })
export class AuthModule {}

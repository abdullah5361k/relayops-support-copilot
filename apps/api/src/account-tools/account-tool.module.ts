import { Module } from '@nestjs/common';
import { AccountToolController } from './account-tool.controller';
import { AccountToolService } from './account-tool.service';

@Module({ controllers: [AccountToolController], providers: [AccountToolService], exports: [AccountToolService] })
export class AccountToolModule {}

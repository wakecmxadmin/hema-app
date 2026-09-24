import { Module } from '@nestjs/common';
import { IfoodApiService } from './ifood-api.service';
import { IfoodAuthService } from './ifood-auth.service';
import { IfoodCallLogService } from './ifood-call-log.service';
import { IfoodCatalogService } from './ifood-catalog.service';
import { IfoodEventsService } from './ifood-events.service';
import { IfoodSyncService } from './ifood-sync.service';
import { IfoodController } from './ifood.controller';

@Module({
  controllers: [IfoodController],
  providers: [
    IfoodCallLogService,
    IfoodAuthService,
    IfoodApiService,
    IfoodCatalogService,
    IfoodEventsService,
    IfoodSyncService,
  ],
  exports: [IfoodCatalogService],
})
export class IfoodModule {}

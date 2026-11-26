import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard, RolesGuard } from './common/auth.guards';
import { CorrelationMiddleware } from './common/correlation.middleware';
import { AdminController, AdminRequestDecisionController } from './modules/admin/admin.controller';
import { AuthController, AuthService } from './modules/auth/auth.controller';
import { HealthController } from './modules/health/health.controller';
import { RosterController } from './modules/roster/roster.controller';
import { SyncController, SyncEngineService } from './modules/sync/sync.controller';
import { TasksController } from './modules/tasks/tasks.controller';
import { TrustController } from './modules/trust/trust.controller';
import { InMemoryApiStore } from './repositories/in-memory.store';

@Module({
  imports: [JwtModule.register({})],
  controllers: [
    HealthController,
    AuthController,
    TrustController,
    SyncController,
    RosterController,
    TasksController,
    AdminController,
    AdminRequestDecisionController,
  ],
  providers: [InMemoryApiStore, AuthService, SyncEngineService, JwtAuthGuard, RolesGuard],
  exports: [InMemoryApiStore],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }
}

import { Module, type DynamicModule } from '@nestjs/common';
import type { AppConfig } from './config';
import { DatabaseService } from './database';
import { AuthController, MeController } from './auth-controller';
import { AuthService } from './auth-service';
import {
  HealthController,
  ProductsController,
  CategoriesController,
} from './controllers';

@Module({})
export class AppModule {
  static configure(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      controllers: [
        HealthController,
        ProductsController,
        CategoriesController,
        AuthController,
        MeController,
      ],
      providers: [
        {
          provide: DatabaseService,
          useFactory: () => new DatabaseService(config),
        },
        {
          provide: AuthService,
          useFactory: (database: DatabaseService) =>
            new AuthService(database, config),
          inject: [DatabaseService],
        },
      ],
    };
  }
}

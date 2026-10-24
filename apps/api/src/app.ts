import { Module, type DynamicModule } from '@nestjs/common';
import type { AppConfig } from './config';
import { DatabaseService } from './database';
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
      controllers: [HealthController, ProductsController, CategoriesController],
      providers: [
        {
          provide: DatabaseService,
          useFactory: () => new DatabaseService(config),
        },
      ],
    };
  }
}

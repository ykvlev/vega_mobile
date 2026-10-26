import { Module, type DynamicModule } from '@nestjs/common';
import type { AppConfig } from './config';
import { DatabaseService } from './database';
import { AuthController, MeController } from './auth-controller';
import { AuthService } from './auth-service';
import { AdminController } from './admin-controller';
import { ImageService } from './image-service';
import {
  ImageReleaseInterceptor,
  ImageUploadGuard,
  MediaController,
  ProductImagesController,
} from './image-controller';
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
        ProductImagesController,
        MediaController,
        AdminController,
        HealthController,
        ProductsController,
        CategoriesController,
        AuthController,
        MeController,
      ],
      providers: [
        ImageUploadGuard,
        ImageReleaseInterceptor,
        {
          provide: ImageService,
          useFactory: (database: DatabaseService) =>
            new ImageService(database, config),
          inject: [DatabaseService],
        },
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

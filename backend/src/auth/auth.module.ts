import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import type { AppConfig } from "../config/configuration";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { TokensService } from "./tokens.service";

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const jwt = config.get("jwt", { infer: true });
        return {
          secret: jwt.accessSecret,
          signOptions: { algorithm: "HS256", expiresIn: jwt.accessTtlMin * 60 },
          verifyOptions: { algorithms: ["HS256"] },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokensService],
  exports: [TokensService, AuthService],
})
export class AuthModule {}

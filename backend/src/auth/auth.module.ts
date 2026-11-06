import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import type { AppConfig } from "../config/configuration";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JWT_AUDIENCE, JWT_ISSUER, TokensService } from "./tokens.service";

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const jwt = config.get("jwt", { infer: true });
        return {
          secret: jwt.accessSecret,
          signOptions: {
            algorithm: "HS256",
            expiresIn: jwt.accessTtlMin * 60,
            issuer: JWT_ISSUER,
            audience: JWT_AUDIENCE,
          },
          verifyOptions: {
            algorithms: ["HS256"],
            issuer: JWT_ISSUER,
            audience: JWT_AUDIENCE,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokensService],
  exports: [TokensService, AuthService],
})
export class AuthModule {}

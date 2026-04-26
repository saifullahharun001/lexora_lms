import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Res,
  UseGuards
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SkipThrottle, ThrottlerGuard } from "@nestjs/throttler";

import { IdentityAccessService } from "../../application/services/identity-access.service";
import { LoginDto } from "../dto/login.dto";
import { LogoutDto } from "../dto/logout.dto";
import { RefreshTokenDto } from "../dto/refresh-token.dto";
import { RegisterDto } from "../dto/register.dto";
import { RequestPasswordResetDto } from "../dto/request-password-reset.dto";
import { ResetPasswordDto } from "../dto/reset-password.dto";
import { VerifyEmailDto } from "../dto/verify-email.dto";

type CookieResponse = {
  cookie: (name: string, value: string, options: Record<string, unknown>) => void;
  clearCookie: (name: string, options: Record<string, unknown>) => void;
  req: {
    cookies?: Record<string, string | undefined>;
  };
};

@Controller({
  path: "auth",
  version: "1"
})
@UseGuards(ThrottlerGuard)
@SkipThrottle({
  default: true,
  auth: true
})
export class AuthController {
  constructor(
    private readonly identityAccessService: IdentityAccessService,
    private readonly configService: ConfigService
  ) {}

  @Post("register")
  @SkipThrottle({
    auth: false
  })
  register(@Body() body: RegisterDto) {
    return this.identityAccessService.register(body);
  }

  @Post("login")
  @SkipThrottle({
    auth: false
  })
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) response: CookieResponse
  ) {
    const result = await this.identityAccessService.login(body);
    this.setRefreshCookie(response, result.refreshToken, result.refreshTokenExpiresAt);
    return result;
  }

  @Post("logout")
  async logout(
    @Body() body: LogoutDto,
    @Res({ passthrough: true }) response: CookieResponse
  ) {
    const refreshToken =
      body.refreshToken ??
      response.req.cookies?.[this.configService.getOrThrow<string>("auth.refreshCookieName")];
    const result = await this.identityAccessService.logout(refreshToken);
    this.clearRefreshCookie(response);
    return result;
  }

  @Post("refresh")
  @SkipThrottle({
    auth: false
  })
  async refresh(
    @Body() body: RefreshTokenDto,
    @Res({ passthrough: true }) response: CookieResponse
  ) {
    const refreshToken =
      body.refreshToken ??
      response.req.cookies?.[this.configService.getOrThrow<string>("auth.refreshCookieName")];

    if (!refreshToken) {
      throw new BadRequestException("Refresh token is required");
    }

    const result = await this.identityAccessService.refresh(refreshToken);
    this.setRefreshCookie(response, result.refreshToken, result.refreshTokenExpiresAt);
    return result;
  }

  @Post("request-password-reset")
  @SkipThrottle({
    auth: false
  })
  requestPasswordReset(@Body() body: RequestPasswordResetDto) {
    return this.identityAccessService.requestPasswordReset(body);
  }

  @Post("reset-password")
  @SkipThrottle({
    auth: false
  })
  resetPassword(@Body() body: ResetPasswordDto) {
    return this.identityAccessService.resetPassword({
      token: body.token,
      newPassword: body.newPassword
    });
  }

  @Post("verify-email")
  @SkipThrottle({
    auth: false
  })
  verifyEmail(@Body() body: VerifyEmailDto) {
    return this.identityAccessService.verifyEmail(body);
  }

  private setRefreshCookie(
    response: CookieResponse,
    refreshToken: string,
    refreshTokenExpiresAtIso: string
  ) {
    response.cookie(this.configService.getOrThrow<string>("auth.refreshCookieName"), refreshToken, {
      httpOnly: true,
      secure: this.configService.getOrThrow<boolean>("auth.refreshCookieSecure"),
      sameSite: "lax",
      domain: this.configService.getOrThrow<string>("auth.refreshCookieDomain") || undefined,
      path: "/api/v1/auth",
      expires: new Date(refreshTokenExpiresAtIso)
    });
  }

  private clearRefreshCookie(response: CookieResponse) {
    response.clearCookie(this.configService.getOrThrow<string>("auth.refreshCookieName"), {
      httpOnly: true,
      secure: this.configService.getOrThrow<boolean>("auth.refreshCookieSecure"),
      sameSite: "lax",
      domain: this.configService.getOrThrow<string>("auth.refreshCookieDomain") || undefined,
      path: "/api/v1/auth"
    });
  }
}

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

import type { PrincipalContext } from "@lexora/types";

import { RequestContextService } from "@/common/request-context/request-context.service";
import { PrincipalLoaderService } from "../services/principal-loader.service";

type AuthenticatedRequest = {
  headers?: Record<string, string | string[] | undefined>;
  principal?: PrincipalContext;
  requestContext?: unknown;
};

interface AccessTokenPayload {
  sub: string;
  did?: string;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly principalLoaderService: PrincipalLoaderService,
    private readonly requestContextService: RequestContextService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorizationHeader = request.headers?.authorization;

    if (!authorizationHeader || typeof authorizationHeader !== "string") {
      throw new UnauthorizedException("Authentication is required");
    }

    const [scheme, token] = authorizationHeader.split(" ");

    if (scheme !== "Bearer" || !token) {
      throw new UnauthorizedException("Authentication is required");
    }

    let payload: AccessTokenPayload;

    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException("Authentication is required");
    }

    const principal = await this.principalLoaderService.loadPrincipal(payload.sub);

    if (!principal) {
      throw new UnauthorizedException("Authentication is required");
    }

    request.principal = principal;
    this.requestContextService.setPrincipal(principal);
    request.requestContext = this.requestContextService.get();

    return true;
  }
}

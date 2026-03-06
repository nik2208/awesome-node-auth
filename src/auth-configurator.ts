import { Router, RequestHandler } from 'express';
import { AuthConfig } from './models/auth-config.model';
import { IUserStore } from './interfaces/user-store.interface';
import { TokenService } from './services/token.service';
import { PasswordService } from './services/password.service';
import { LocalStrategy } from './strategies/local/local.strategy';
import { GoogleStrategy } from './strategies/oauth/google.strategy';
import { GithubStrategy } from './strategies/oauth/github.strategy';
import { createAuthMiddleware } from './middleware/auth.middleware';
import { createAuthRouter, RouterOptions } from './router/auth.router';

export class AuthConfigurator {
  private readonly _tokenService: TokenService;
  private readonly _passwordService: PasswordService;

  constructor(
    private readonly config: AuthConfig,
    private readonly userStore: IUserStore,
  ) {
    this._tokenService = new TokenService();
    this._passwordService = new PasswordService();
  }

  middleware(): RequestHandler {
    return createAuthMiddleware(this.config);
  }

  router(options?: RouterOptions): Router {
    return createAuthRouter(this.userStore, this.config, options);
  }

  get tokenService(): TokenService {
    return this._tokenService;
  }

  get passwordService(): PasswordService {
    return this._passwordService;
  }

  strategy(name: 'local'): LocalStrategy;
  strategy(name: 'google'): GoogleStrategy;
  strategy(name: 'github'): GithubStrategy;
  strategy(name: string): LocalStrategy | GoogleStrategy | GithubStrategy {
    switch (name) {
      case 'local':
        return new LocalStrategy(this.userStore, this._passwordService);
      case 'google':
        throw new Error('GoogleStrategy is abstract - extend it and pass via RouterOptions');
      case 'github':
        throw new Error('GithubStrategy is abstract - extend it and pass via RouterOptions');
      default:
        throw new Error(`Unknown strategy: ${name}`);
    }
  }
}

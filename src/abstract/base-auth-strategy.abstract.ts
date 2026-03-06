import { AuthConfig } from '../models/auth-config.model';
import { BaseUser } from '../models/user.model';

export abstract class BaseAuthStrategy<TInput = unknown, TUser = BaseUser> {
  abstract name: string;
  abstract authenticate(input: TInput, config: AuthConfig): Promise<TUser>;
}

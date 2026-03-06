import { AuthConfig } from '../models/auth-config.model';

export interface IAuthStrategy<TInput = unknown, TOutput = unknown> {
  name: string;
  authenticate(input: TInput, config: AuthConfig): Promise<TOutput>;
}

/**
 * MongoDbUserStore — example IUserStore implementation using the official
 * `mongodb` Node.js driver.
 *
 * Installation:
 *   npm install mongodb
 *
 * Usage:
 *   import { MongoClient } from 'mongodb';
 *   import { MongoDbUserStore, MongoDbLinkedAccountsStore, MongoDbSettingsStore } from './mongodb-user-store.example';
 *
 *   const client = new MongoClient(process.env.MONGODB_URI!);
 *   await client.connect();
 *   const db = client.db('myapp');
 *
 *   const userStore = new MongoDbUserStore(db);
 *   const linkedAccountsStore = new MongoDbLinkedAccountsStore(db);
 *   const settingsStore = new MongoDbSettingsStore(db);
 *   // Creates indexes automatically on first call to init().
 *   await userStore.init();
 *   await linkedAccountsStore.init();
 *
 * NOTE: This file is intentionally NOT compiled by tsconfig.json (it lives in
 * examples/, which is excluded). Treat it as reference documentation.
 *
 * To use it copy it into your own project, install mongodb, and adapt the
 * collection schema to your needs.
 *
 * Also exports:
 *  - MongoDbLinkedAccountsStore — ILinkedAccountsStore for flexible OAuth account linking
 *  - MongoDbSettingsStore       — ISettingsStore for global auth settings (admin panel)
 *
 * Mongoose alternative
 * --------------------
 * If you prefer Mongoose, model the document schema after the `DbUserDoc`
 * interface below and adapt the method bodies to use your Mongoose model
 * (e.g. `UserModel.findOne({ email })` instead of
 * `this.col.findOne({ email })`).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { IUserStore, BaseUser, ILinkedAccountsStore, LinkedAccount, ISettingsStore, AuthSettings } from '../src/index';

// ---- MongoDB document shape -----------------------------------------------

interface DbUserDoc {
  _id: string;        // stored as a plain string UUID (not ObjectId)
  email: string;
  password?: string | null;
  role?: string | null;
  refreshToken?: string | null;
  refreshTokenExpiry?: Date | null;
  resetToken?: string | null;
  resetTokenExpiry?: Date | null;
  totpSecret?: string | null;
  isTotpEnabled?: boolean;
  magicLinkToken?: string | null;
  magicLinkTokenExpiry?: Date | null;
  smsCode?: string | null;
  smsCodeExpiry?: Date | null;
  phoneNumber?: string | null;
  loginProvider?: string | null;
  providerAccountId?: string | null;
  isEmailVerified?: boolean;
  emailVerificationToken?: string | null;
  emailVerificationTokenExpiry?: Date | null;
  emailVerificationDeadline?: Date | null;
  require2FA?: boolean;
  pendingEmail?: string | null;
  emailChangeToken?: string | null;
  emailChangeTokenExpiry?: Date | null;
  accountLinkToken?: string | null;
  accountLinkTokenExpiry?: Date | null;
  accountLinkPendingEmail?: string | null;
  accountLinkPendingProvider?: string | null;
  lastLogin?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

// ---- Mapper ---------------------------------------------------------------

function toBaseUser(doc: DbUserDoc): BaseUser {
  return {
    id: doc._id,
    email: doc.email,
    password: doc.password ?? undefined,
    role: doc.role ?? undefined,
    refreshToken: doc.refreshToken ?? null,
    refreshTokenExpiry: doc.refreshTokenExpiry ?? null,
    resetToken: doc.resetToken ?? null,
    resetTokenExpiry: doc.resetTokenExpiry ?? null,
    totpSecret: doc.totpSecret ?? null,
    isTotpEnabled: doc.isTotpEnabled ?? false,
    magicLinkToken: doc.magicLinkToken ?? null,
    magicLinkTokenExpiry: doc.magicLinkTokenExpiry ?? null,
    smsCode: doc.smsCode ?? null,
    smsCodeExpiry: doc.smsCodeExpiry ?? null,
    phoneNumber: doc.phoneNumber ?? null,
    loginProvider: doc.loginProvider ?? null,
    providerAccountId: doc.providerAccountId ?? null,
    isEmailVerified: doc.isEmailVerified ?? false,
    emailVerificationToken: doc.emailVerificationToken ?? null,
    emailVerificationTokenExpiry: doc.emailVerificationTokenExpiry ?? null,
    emailVerificationDeadline: doc.emailVerificationDeadline ?? null,
    require2FA: doc.require2FA ?? false,
    pendingEmail: doc.pendingEmail ?? null,
    emailChangeToken: doc.emailChangeToken ?? null,
    emailChangeTokenExpiry: doc.emailChangeTokenExpiry ?? null,
    accountLinkToken: doc.accountLinkToken ?? null,
    accountLinkTokenExpiry: doc.accountLinkTokenExpiry ?? null,
    accountLinkPendingEmail: doc.accountLinkPendingEmail ?? null,
    accountLinkPendingProvider: doc.accountLinkPendingProvider ?? null,
    lastLogin: doc.lastLogin ?? null,
  };
}

// ---- Store ----------------------------------------------------------------

export class MongoDbUserStore implements IUserStore {
  private col: any; // mongodb Collection<DbUserDoc>

  /**
   * @param db  A `mongodb` Db instance obtained from `MongoClient.db()`.
   * @param collectionName  Name of the MongoDB collection (default: 'users').
   */
  constructor(private readonly db: any, collectionName = 'users') {
    this.col = this.db.collection(collectionName);
  }

  // ---- Setup ---------------------------------------------------------------

  /**
   * Creates unique indexes for `email`, `resetToken`, `magicLinkToken`,
   * `emailVerificationToken`, `emailChangeToken`, `accountLinkToken`,
   * and a compound index for OAuth provider lookup.
   * Call once at application start.
   */
  async init(): Promise<void> {
    await this.col.createIndex({ email: 1 }, { unique: true });
    await this.col.createIndex({ resetToken: 1 }, { sparse: true });
    await this.col.createIndex({ magicLinkToken: 1 }, { sparse: true });
    await this.col.createIndex({ emailVerificationToken: 1 }, { sparse: true });
    await this.col.createIndex({ emailChangeToken: 1 }, { sparse: true });
    await this.col.createIndex({ accountLinkToken: 1 }, { sparse: true });
    await this.col.createIndex({ loginProvider: 1, providerAccountId: 1 }, { sparse: true });
  }

  // ---- Core CRUD -----------------------------------------------------------

  async findByEmail(email: string): Promise<BaseUser | null> {
    const doc: DbUserDoc | null = await this.col.findOne({ email });
    return doc ? toBaseUser(doc) : null;
  }

  async findById(id: string): Promise<BaseUser | null> {
    const doc: DbUserDoc | null = await this.col.findOne({ _id: id });
    return doc ? toBaseUser(doc) : null;
  }

  async create(data: Partial<BaseUser>): Promise<BaseUser> {
    const _id = data.id ?? crypto.randomUUID();
    const now = new Date();
    const doc: DbUserDoc = {
      _id,
      email: data.email ?? '',
      password: data.password ?? null,
      role: data.role ?? 'user',
      isTotpEnabled: false,
      loginProvider: data.loginProvider ?? null,
      providerAccountId: data.providerAccountId ?? null,
      isEmailVerified: data.isEmailVerified ?? false,
      emailVerificationDeadline: data.emailVerificationDeadline ?? null,
      createdAt: now,
      updatedAt: now,
    };
    await this.col.insertOne(doc);
    return (await this.findById(_id))!;
  }

  // ---- Token updates -------------------------------------------------------

  async updateRefreshToken(userId: string, token: string | null, expiry: Date | null): Promise<void> {
    await this.col.updateOne(
      { _id: userId },
      { $set: { refreshToken: token, refreshTokenExpiry: expiry, updatedAt: new Date() } },
    );
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.col.updateOne(
      { _id: userId },
      { $set: { lastLogin: new Date(), updatedAt: new Date() } },
    );
  }

  async updateResetToken(userId: string, token: string | null, expiry: Date | null): Promise<void> {
    await this.col.updateOne(
      { _id: userId },
      { $set: { resetToken: token, resetTokenExpiry: expiry, updatedAt: new Date() } },
    );
  }

  async updatePassword(userId: string, hashedPassword: string): Promise<void> {
    await this.col.updateOne(
      { _id: userId },
      { $set: { password: hashedPassword, updatedAt: new Date() } },
    );
  }

  async updateTotpSecret(userId: string, secret: string | null): Promise<void> {
    await this.col.updateOne(
      { _id: userId },
      { $set: { totpSecret: secret, isTotpEnabled: secret !== null, updatedAt: new Date() } },
    );
  }

  async updateMagicLinkToken(userId: string, token: string | null, expiry: Date | null): Promise<void> {
    await this.col.updateOne(
      { _id: userId },
      { $set: { magicLinkToken: token, magicLinkTokenExpiry: expiry, updatedAt: new Date() } },
    );
  }

  async updateSmsCode(userId: string, code: string | null, expiry: Date | null): Promise<void> {
    await this.col.updateOne(
      { _id: userId },
      { $set: { smsCode: code, smsCodeExpiry: expiry, updatedAt: new Date() } },
    );
  }

  // ---- Optional look-ups (required for reset-password & magic-link) --------

  async findByResetToken(token: string): Promise<BaseUser | null> {
    const doc: DbUserDoc | null = await this.col.findOne({ resetToken: token });
    return doc ? toBaseUser(doc) : null;
  }

  async findByMagicLinkToken(token: string): Promise<BaseUser | null> {
    const doc: DbUserDoc | null = await this.col.findOne({ magicLinkToken: token });
    return doc ? toBaseUser(doc) : null;
  }

  // ---- Email verification --------------------------------------------------

  async updateEmailVerificationToken(userId: string, token: string | null, expiry: Date | null): Promise<void> {
    await this.col.updateOne(
      { _id: userId },
      { $set: { emailVerificationToken: token, emailVerificationTokenExpiry: expiry, updatedAt: new Date() } },
    );
  }

  async updateEmailVerified(userId: string, isVerified: boolean): Promise<void> {
    await this.col.updateOne(
      { _id: userId },
      { $set: { isEmailVerified: isVerified, updatedAt: new Date() } },
    );
  }

  async findByEmailVerificationToken(token: string): Promise<BaseUser | null> {
    const doc: DbUserDoc | null = await this.col.findOne({ emailVerificationToken: token });
    return doc ? toBaseUser(doc) : null;
  }

  // ---- Change email --------------------------------------------------------

  async updateEmailChangeToken(userId: string, pendingEmail: string | null, token: string | null, expiry: Date | null): Promise<void> {
    await this.col.updateOne(
      { _id: userId },
      { $set: { pendingEmail, emailChangeToken: token, emailChangeTokenExpiry: expiry, updatedAt: new Date() } },
    );
  }

  async updateEmail(userId: string, newEmail: string): Promise<void> {
    await this.col.updateOne(
      { _id: userId },
      { $set: { email: newEmail, pendingEmail: null, emailChangeToken: null, emailChangeTokenExpiry: null, updatedAt: new Date() } },
    );
  }

  async findByEmailChangeToken(token: string): Promise<BaseUser | null> {
    const doc: DbUserDoc | null = await this.col.findOne({ emailChangeToken: token });
    return doc ? toBaseUser(doc) : null;
  }

  // ---- OAuth provider lookup -----------------------------------------------

  async findByProviderAccount(provider: string, providerAccountId: string): Promise<BaseUser | null> {
    const doc: DbUserDoc | null = await this.col.findOne({ loginProvider: provider, providerAccountId });
    return doc ? toBaseUser(doc) : null;
  }

  // ---- Account linking -----------------------------------------------------

  async updateAccountLinkToken(
    userId: string,
    pendingEmail: string | null,
    pendingProvider: string | null,
    token: string | null,
    expiry: Date | null,
  ): Promise<void> {
    await this.col.updateOne(
      { _id: userId },
      { $set: { accountLinkPendingEmail: pendingEmail, accountLinkPendingProvider: pendingProvider, accountLinkToken: token, accountLinkTokenExpiry: expiry, updatedAt: new Date() } },
    );
  }

  async findByAccountLinkToken(token: string): Promise<BaseUser | null> {
    const doc: DbUserDoc | null = await this.col.findOne({ accountLinkToken: token });
    return doc ? toBaseUser(doc) : null;
  }

  // ---- 2FA policy ----------------------------------------------------------

  async updateRequire2FA(userId: string, required: boolean): Promise<void> {
    await this.col.updateOne(
      { _id: userId },
      { $set: { require2FA: required, updatedAt: new Date() } },
    );
  }

  // ---- Admin listing -------------------------------------------------------

  async listUsers(limit: number, offset: number): Promise<BaseUser[]> {
    const docs: DbUserDoc[] = await this.col.find({}).skip(offset).limit(limit).toArray();
    return docs.map(toBaseUser);
  }

  async deleteUser(userId: string): Promise<void> {
    await this.col.deleteOne({ _id: userId });
  }
}

// ---------------------------------------------------------------------------
// MongoDbLinkedAccountsStore
// ---------------------------------------------------------------------------

/**
 * MongoDB ILinkedAccountsStore — stores linked OAuth accounts per user.
 *
 * Enables the following endpoints when passed to createAuthRouter:
 *   GET  /auth/linked-accounts
 *   DELETE /auth/linked-accounts/:provider/:providerAccountId
 *   POST /auth/link-request  (requires updateAccountLinkToken on IUserStore)
 *   POST /auth/link-verify   (requires findByAccountLinkToken on IUserStore)
 */
export class MongoDbLinkedAccountsStore implements ILinkedAccountsStore {
  private col: any; // mongodb Collection

  constructor(private readonly db: any, collectionName = 'linked_accounts') {
    this.col = this.db.collection(collectionName);
  }

  /** Call once at application start to create indexes. */
  async init(): Promise<void> {
    await this.col.createIndex({ userId: 1 });
    await this.col.createIndex({ userId: 1, provider: 1, providerAccountId: 1 }, { unique: true });
  }

  async getLinkedAccounts(userId: string): Promise<LinkedAccount[]> {
    const docs: any[] = await this.col.find({ userId }).toArray();
    return docs.map(d => ({
      provider: d.provider,
      providerAccountId: d.providerAccountId,
      email: d.email ?? undefined,
      name: d.name ?? undefined,
      picture: d.picture ?? undefined,
      linkedAt: d.linkedAt ?? undefined,
    }));
  }

  async linkAccount(userId: string, account: LinkedAccount): Promise<void> {
    await this.col.replaceOne(
      { userId, provider: account.provider, providerAccountId: account.providerAccountId },
      { userId, ...account },
      { upsert: true },
    );
  }

  async unlinkAccount(userId: string, provider: string, providerAccountId: string): Promise<void> {
    await this.col.deleteOne({ userId, provider, providerAccountId });
  }

  async findUserByProviderAccount(provider: string, providerAccountId: string): Promise<{ userId: string } | null> {
    const doc: any = await this.col.findOne({ provider, providerAccountId });
    return doc ? { userId: doc.userId } : null;
  }
}

// ---------------------------------------------------------------------------
// MongoDbSettingsStore
// ---------------------------------------------------------------------------

/**
 * MongoDB ISettingsStore — persists global auth settings for the admin
 * Control panel (email verification policy, mandatory 2FA toggle, etc.).
 */
export class MongoDbSettingsStore implements ISettingsStore {
  private col: any; // mongodb Collection

  constructor(private readonly db: any, collectionName = 'auth_settings') {
    this.col = this.db.collection(collectionName);
  }

  async getSettings(): Promise<AuthSettings> {
    const doc: any = await this.col.findOne({ _id: 'global' });
    if (!doc) return {};
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _id, ...settings } = doc;
    return settings as AuthSettings;
  }

  async updateSettings(updates: Partial<AuthSettings>): Promise<void> {
    await this.col.updateOne(
      { _id: 'global' },
      { $set: updates },
      { upsert: true },
    );
  }
}

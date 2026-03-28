import { safeStorage } from 'electron';
import baseLog from 'electron-log/main';
import Store from 'electron-store';

const log = baseLog.scope('Storage');

export class Storage {
  static #instance: Storage;
  private isEncryptionAvailable: boolean;
  public store: Store;

  /**
   * The Singleton's constructor should always be private to prevent direct
   * construction calls with the `new` operator.
   */
  private constructor() {
    this.store = new Store();

    if (safeStorage.isEncryptionAvailable()) {
      log.info('Safe Storage is available');
      this.isEncryptionAvailable = true;
    } else {
      log.warn('Safe Storage is not available');
      this.isEncryptionAvailable = false;
    }
  }

  public static get instance(): Storage {
    if (!Storage.#instance) {
      Storage.#instance = new Storage();
    }

    return Storage.#instance;
  }

  public static init(): void {
    void Storage.instance;
  }

  public secureWrite(key: string, value: string): void {
    const data = this.encrypt(value);
    this.store.set(key, data);
  }

  public secureRead(key: string): string | null {
    const data = this.store.get(key);

    if (!data) return null;

    try {
      return this.decrypt(data);
    } catch (err) {
      log.warn(`Failed to decrypt key "${key}", clearing stale data:`, err);
      this.store.delete(key);
      return null;
    }
  }

  public write(key: string, value: string): void {
    return this.store.set(key, value);
  }

  public read(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  public encrypt(value: string): string {
    if (this.isEncryptionAvailable) {
      return safeStorage.encryptString(value).toString('base64');
    } else {
      // TODO(sal): Implement fallback encryption
      return Buffer.from(value).toString('base64');
    }
  }

  public decrypt(value: string): string {
    if (this.isEncryptionAvailable) {
      return safeStorage.decryptString(Buffer.from(value, 'base64'));
    } else {
      // TODO(sal): Implement fallback decryption
      return Buffer.from(value, 'base64').toString('utf8');
    }
  }
}

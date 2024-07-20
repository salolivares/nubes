import { safeStorage } from 'electron';
import fs from 'fs';
import Store from 'electron-store';

interface Config {
  [key: string]: string;
}

export class Storage {
  static #instance: Storage;
  isEncryptionAvailable: boolean;
  store: Store;

  /**
   * The Singleton's constructor should always be private to prevent direct
   * construction calls with the `new` operator.
   */
  private constructor() {
    this.store = new Store();

    if (safeStorage.isEncryptionAvailable()) {
      console.log('Safe Storage is available');
      this.isEncryptionAvailable = true;
    } else {
      console.log('Safe Storage is not available');
      this.isEncryptionAvailable = false;
    }
  }

  /**
   * The static getter that controls access to the singleton instance.
   *
   * This implementation allows you to extend the Singleton class while
   * keeping just one instance of each subclass around.
   */
  public static get instance(): Storage {
    if (!Storage.#instance) {
      Storage.#instance = new Storage();
    }

    return Storage.#instance;
  }

  public secureWrite(key: string, value: string): void {
    const data = this.encrypt(value);
    this.store.set(key, data);
  }

  public secureRead(key: string): string | null {
    const data = this.store.get(key);

    if (!data) return null;

    return this.decrypt(data);
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

import { CONFIG_FILE } from '@common';
import { app, safeStorage } from 'electron';
import path from 'path';
import fs from 'fs';

interface Config {
  [key: string]: string;
}

export class Storage {
  static #instance: Storage;
  configPath: string;
  isEncryptionAvailable: boolean;

  /**
   * The Singleton's constructor should always be private to prevent direct
   * construction calls with the `new` operator.
   */
  private constructor() {
    this.configPath = path.join(app.getPath('userData'), CONFIG_FILE);

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

  public secureSave(key: string, value: string): void {
    let data = null;
    if (this.isEncryptionAvailable) {
      data = safeStorage.encryptString(value).toString('base64');
    } else {
      data = this.encrypt(value);
    }

    const config = this.readConfigFile();
    config[key] = data;
    fs.writeFileSync(this.configPath, JSON.stringify(config));
  }

  public secureRead(key: string): string | null {
    const config = this.readConfigFile();

    if (!config[key]) return null;

    let value = null;
    if (this.isEncryptionAvailable) {
      value = safeStorage.decryptString(Buffer.from(config[key], 'base64'));
    } else {
      value = this.decrypt(config[key]);
    }

    return value;
  }

  public write(key: string, value: string): void {
    const config = this.readConfigFile();
    config[key] = value;
    fs.writeFileSync(this.configPath, JSON.stringify(config));
  }

  public read(key: string): string | null {
    const config = this.readConfigFile();
    return config[key] || null;
  }

  private readConfigFile(): Config {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Failed to read config file:', error);
    }
    return {};
  }

  private encrypt(value: string): string {
    // TODO(sal): Implement fallback encryption
    return Buffer.from(value).toString('base64');
  }

  private decrypt(value: string): string {
    // TODO(sal): Implement fallback decryption
    return Buffer.from(value, 'base64').toString('utf8');
  }
}

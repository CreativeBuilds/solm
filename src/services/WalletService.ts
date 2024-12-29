import { Keypair, PublicKey } from '@solana/web3.js';
import { encrypt, decrypt } from '../utils/encryption';
import * as fs from 'fs/promises';
import * as path from 'path';
import bs58 from 'bs58';

export interface WalletInfo {
  publicKey: string;
  encryptedPrivateKey: string;
  name?: string;
  tags?: string[];
}

export class WalletService {
  private readonly accountsDir = '.accounts';
  private password: string | null = null;

  constructor() {
    this.ensureAccountsDir();
  }

  private async ensureAccountsDir() {
    try {
      await fs.mkdir(this.accountsDir, { recursive: true });
    } catch (error) {
      console.error('Error creating accounts directory:', error);
      throw error;
    }
  }

  public setPassword(password: string) {
    this.password = password;
  }

  public async generateWallet(name?: string): Promise<WalletInfo> {
    if (!this.password) {
      throw new Error('Password not set');
    }

    const keypair = Keypair.generate();
    const walletInfo: WalletInfo = {
      publicKey: keypair.publicKey.toString(),
      encryptedPrivateKey: encrypt(bs58.encode(keypair.secretKey), this.password),
      name,
    };

    await this.saveWallet(walletInfo);
    return walletInfo;
  }

  public async importWallet(secretKey: Uint8Array, name?: string): Promise<WalletInfo> {
    if (!this.password) {
      throw new Error('Password not set');
    }

    const keypair = Keypair.fromSecretKey(secretKey);
    const walletInfo: WalletInfo = {
      publicKey: keypair.publicKey.toString(),
      encryptedPrivateKey: encrypt(bs58.encode(keypair.secretKey), this.password),
      name,
    };

    await this.saveWallet(walletInfo);
    return walletInfo;
  }

  public async getWallet(publicKey: string): Promise<WalletInfo> {
    const walletPath = path.join(this.accountsDir, `${publicKey}.json`);
    try {
      const data = await fs.readFile(walletPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      throw new Error(`Wallet not found: ${publicKey}`);
    }
  }

  public async listWallets(): Promise<WalletInfo[]> {
    try {
      const files = await fs.readdir(this.accountsDir);
      const wallets = await Promise.all(
        files
          .filter(file => file.endsWith('.json'))
          .map(async file => {
            const data = await fs.readFile(path.join(this.accountsDir, file), 'utf-8');
            return JSON.parse(data);
          })
      );
      return wallets;
    } catch (error) {
      console.error('Error listing wallets:', error);
      return [];
    }
  }

  public async getKeypair(publicKey: string): Promise<Keypair> {
    if (!this.password) {
      throw new Error('Password not set');
    }

    const walletInfo = await this.getWallet(publicKey);
    const privateKeyBytes = bs58.decode(decrypt(walletInfo.encryptedPrivateKey, this.password));
    return Keypair.fromSecretKey(privateKeyBytes);
  }

  private async saveWallet(walletInfo: WalletInfo): Promise<void> {
    const walletPath = path.join(this.accountsDir, `${walletInfo.publicKey}.json`);
    await fs.writeFile(walletPath, JSON.stringify(walletInfo, null, 2));
  }
} 
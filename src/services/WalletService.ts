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
  // Add a salt per wallet for additional security
  salt: string;
}

export class WalletService {
  private readonly accountsDir = '.accounts';
  private passwordCache: Map<string, string> = new Map();

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

  private generateSalt(): string {
    return bs58.encode(Buffer.from(Array.from({ length: 32 }, () => Math.floor(Math.random() * 256))));
  }

  public setPasswordForWallet(publicKey: string, password: string) {
    this.passwordCache.set(publicKey, password);
  }

  public clearPasswordForWallet(publicKey: string) {
    this.passwordCache.delete(publicKey);
  }

  public async generateWallet(password: string, name?: string, tags?: string[]): Promise<WalletInfo> {
    const keypair = Keypair.generate();
    const salt = this.generateSalt();
    const walletInfo: WalletInfo = {
      publicKey: keypair.publicKey.toString(),
      encryptedPrivateKey: encrypt(bs58.encode(keypair.secretKey), password + salt),
      name,
      salt,
      tags: tags ? tags.map(t => t.trim().toLowerCase()) : [],
    };

    await this.saveWallet(walletInfo);
    return walletInfo;
  }

  public async importWallet(secretKey: Uint8Array, password: string, name?: string, tags?: string[]): Promise<WalletInfo> {
    const keypair = Keypair.fromSecretKey(secretKey);
    const salt = this.generateSalt();
    const walletInfo: WalletInfo = {
      publicKey: keypair.publicKey.toString(),
      encryptedPrivateKey: encrypt(bs58.encode(keypair.secretKey), password + salt),
      name,
      salt,
      tags: tags ? tags.map(t => t.trim().toLowerCase()) : [],
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

  public async listWallets(filterTags?: string[]): Promise<Omit<WalletInfo, 'encryptedPrivateKey' | 'salt'>[]> {
    try {
      const files = await fs.readdir(this.accountsDir);
      const wallets = await Promise.all(
        files
          .filter(file => file.endsWith('.json'))
          .map(async file => {
            const data = await fs.readFile(path.join(this.accountsDir, file), 'utf-8');
            const wallet = JSON.parse(data);
            // Only return public information
            return {
              publicKey: wallet.publicKey,
              name: wallet.name,
              tags: wallet.tags || [],
            };
          })
      );

      // Filter by tags if specified
      if (filterTags && filterTags.length > 0) {
        const requiredTags = new Set(filterTags.map(t => t.trim().toLowerCase()));
        return wallets.filter(wallet => 
          wallet.tags.some((tag: string) => requiredTags.has(tag.toLowerCase()))
        );
      }

      return wallets;
    } catch (error) {
      console.error('Error listing wallets:', error);
      return [];
    }
  }

  public async getKeypair(publicKey: string): Promise<Keypair> {
    const walletInfo = await this.getWallet(publicKey);
    const password = this.passwordCache.get(publicKey);
    
    if (!password) {
      throw new Error('Password not set for this wallet. Please unlock it first.');
    }

    try {
      const privateKeyBytes = bs58.decode(decrypt(walletInfo.encryptedPrivateKey, password + walletInfo.salt));
      return Keypair.fromSecretKey(privateKeyBytes);
    } catch (error) {
      throw new Error('Invalid password for wallet');
    }
  }

  private async saveWallet(walletInfo: WalletInfo): Promise<void> {
    const walletPath = path.join(this.accountsDir, `${walletInfo.publicKey}.json`);
    await fs.writeFile(walletPath, JSON.stringify(walletInfo, null, 2));
  }

  public async addTags(publicKey: string, tags: string[]): Promise<WalletInfo> {
    const wallet = await this.getWallet(publicKey);
    const uniqueTags = new Set(wallet.tags || []);
    tags.forEach(tag => uniqueTags.add(tag.trim().toLowerCase()));
    wallet.tags = Array.from(uniqueTags);
    await this.saveWallet(wallet);
    return wallet;
  }

  public async removeTags(publicKey: string, tags: string[]): Promise<WalletInfo> {
    const wallet = await this.getWallet(publicKey);
    if (!wallet.tags) return wallet;

    if (tags.includes('*')) {
      wallet.tags = [];
    } else {
      const tagsToRemove = new Set(tags.map(t => t.trim().toLowerCase()));
      wallet.tags = wallet.tags.filter(tag => !tagsToRemove.has(tag));
    }
    
    await this.saveWallet(wallet);
    return wallet;
  }
} 
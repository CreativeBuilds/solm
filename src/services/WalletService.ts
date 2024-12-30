import { Keypair } from '@solana/web3.js';
import { promises as fs } from 'fs';
import * as path from 'path';
import { encrypt, decrypt } from '../utils/encryption';
import bs58 from 'bs58';
import { randomBytes } from 'crypto';

export interface WalletInfo {
  publicKey: string;
  name?: string;
  tags?: string[];
  salt: string;
  index: number;
  encryptedPrivateKey: string;
  version?: number; // For migration support
}

export interface WalletListInfo {
  publicKey: string;
  name?: string;
  tags?: string[];
  index: number;
}

export class WalletService {
  private accountsDir: string;
  private passwordCache: Map<string, string>;
  private readonly CURRENT_VERSION = 1;

  constructor(accountsDir: string = '.accounts') {
    this.accountsDir = accountsDir;
    this.passwordCache = new Map();
  }

  private generateSalt(): string {
    return randomBytes(16).toString('hex');
  }

  private async validateSeedPhrase(seedPhrase: string): Promise<boolean> {
    try {
      // Attempt to decode and create a keypair from the seed phrase
      const decoded = bs58.decode(seedPhrase);
      if (decoded.length !== 64) {
        throw new Error('Invalid seed length');
      }
      Keypair.fromSecretKey(decoded);
      return true;
    } catch (error) {
      throw new Error('Invalid seed phrase format. Please provide a valid base58 encoded private key.');
    }
  }

  private async getNextIndex(): Promise<number> {
    try {
      const wallets = await this.listWallets();
      if (wallets.length === 0) return 0;
      
      // Find the highest index
      const maxIndex = Math.max(...wallets.map(w => w.index));
      return maxIndex + 1;
    } catch (error) {
      return 0;
    }
  }

  private async validateIndex(index: number): Promise<void> {
    const wallets = await this.listWallets();
    if (wallets.some(w => w.index === index)) {
      throw new Error(`Index ${index} is already in use. Please reindex wallets.`);
    }
  }

  /**
   * Reindex all wallets sequentially
   * @param onProgress Optional callback for progress updates
   * @returns Promise<void>
   */
  public async reindexWallets(onProgress?: (current: number, total: number) => void): Promise<void> {
    try {
      // Get all wallet files first
      const files = await fs.readdir(this.accountsDir);
      const jsonFiles = files.filter(file => file.endsWith('.json'));
      const total = jsonFiles.length;

      if (total === 0) {
        return;
      }

      // Read all wallet files in parallel
      const wallets = await Promise.all(
        jsonFiles.map(async (file, index) => {
          const content = await fs.readFile(path.join(this.accountsDir, file), 'utf-8');
          const wallet: WalletInfo = JSON.parse(content);
          onProgress?.(index + 1, total);
          return wallet;
        })
      );

      // Sort wallets by creation time (using public key as a proxy since it's unique)
      wallets.sort((a, b) => a.publicKey.localeCompare(b.publicKey));

      // Update indices and save in parallel
      await Promise.all(
        wallets.map(async (wallet, index) => {
          wallet.index = index;
          wallet.version = this.CURRENT_VERSION;
          await this.saveWallet(wallet);
          onProgress?.(index + 1, total);
        })
      );
    } catch (error) {
      console.error('Error during reindexing:', error);
      throw error;
    }
  }

  /**
   * Migrate a wallet to the latest version
   * @param wallet WalletInfo to migrate
   * @returns Promise<WalletInfo>
   */
  private async migrateWallet(wallet: WalletInfo): Promise<WalletInfo> {
    if (!wallet.version) {
      // Migrate from pre-versioned wallet
      wallet.version = 1;
      if (wallet.index === undefined) {
        wallet.index = await this.getNextIndex();
      }
      await this.saveWallet(wallet);
    }
    return wallet;
  }

  public async generateWallet(name: string | undefined, password: string, tags?: string[]): Promise<WalletListInfo> {
    const keypair = Keypair.generate();
    const salt = this.generateSalt();
    const index = await this.getNextIndex();
    
    // Validate index before proceeding
    await this.validateIndex(index);
    
    const walletInfo: WalletInfo = {
      publicKey: keypair.publicKey.toString(),
      name,
      salt,
      tags: tags ? tags.map(t => t.trim().toLowerCase()) : [],
      index,
      encryptedPrivateKey: await encrypt(
        bs58.encode(keypair.secretKey),
        password + salt
      ),
      version: this.CURRENT_VERSION
    };

    // Ensure accounts directory exists
    await fs.mkdir(this.accountsDir, { recursive: true });

    // Save wallet info
    await fs.writeFile(
      path.join(this.accountsDir, `${keypair.publicKey.toString()}.json`),
      JSON.stringify(walletInfo, null, 2)
    );

    // Cache the password
    this.passwordCache.set(walletInfo.publicKey, password);

    // Return public info only
    return {
      publicKey: walletInfo.publicKey,
      name: walletInfo.name,
      tags: walletInfo.tags,
      index: walletInfo.index
    };
  }

  public async importWallet(name: string | undefined, password: string, seedPhrase: string, tags?: string[]): Promise<WalletListInfo> {
    // Validate seed phrase before proceeding
    await this.validateSeedPhrase(seedPhrase);
    
    const keypair = Keypair.fromSecretKey(bs58.decode(seedPhrase));
    const salt = this.generateSalt();
    const index = await this.getNextIndex();
    
    // Validate index before proceeding
    await this.validateIndex(index);
    
    const walletInfo: WalletInfo = {
      publicKey: keypair.publicKey.toString(),
      name,
      salt,
      tags: tags ? tags.map(t => t.trim().toLowerCase()) : [],
      index,
      encryptedPrivateKey: await encrypt(seedPhrase, password + salt),
      version: this.CURRENT_VERSION
    };

    await fs.mkdir(this.accountsDir, { recursive: true });
    await fs.writeFile(
      path.join(this.accountsDir, `${keypair.publicKey.toString()}.json`),
      JSON.stringify(walletInfo, null, 2)
    );

    this.passwordCache.set(walletInfo.publicKey, password);

    return {
      publicKey: walletInfo.publicKey,
      name: walletInfo.name,
      tags: walletInfo.tags,
      index: walletInfo.index
    };
  }

  public async listWallets(filterTags?: string[]): Promise<WalletListInfo[]> {
    try {
      await fs.mkdir(this.accountsDir, { recursive: true });
      const files = await fs.readdir(this.accountsDir);
      
      const wallets = await Promise.all(
        files
          .filter(file => file.endsWith('.json'))
          .map(async file => {
            const content = await fs.readFile(path.join(this.accountsDir, file), 'utf-8');
            let wallet: WalletInfo = JSON.parse(content);
            
            // Migrate wallet if needed
            wallet = await this.migrateWallet(wallet);
            
            return {
              publicKey: wallet.publicKey,
              name: wallet.name,
              tags: wallet.tags || [],
              index: wallet.index
            };
          })
      );

      if (filterTags && filterTags.length > 0) {
        return wallets.filter(wallet => 
          filterTags.every(tag => wallet.tags?.includes(tag.toLowerCase()))
        );
      }

      // Sort by index
      return wallets.sort((a, b) => a.index - b.index);
    } catch (error) {
      console.error('Error listing wallets:', error);
      return [];
    }
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

  private async saveWallet(walletInfo: WalletInfo): Promise<void> {
    const walletPath = path.join(this.accountsDir, `${walletInfo.publicKey}.json`);
    await fs.writeFile(walletPath, JSON.stringify(walletInfo, null, 2));
  }

  public async renameWallet(publicKey: string, newName: string | undefined): Promise<WalletInfo> {
    const wallet = await this.getWallet(publicKey);
    wallet.name = newName;
    await this.saveWallet(wallet);
    return wallet;
  }
} 
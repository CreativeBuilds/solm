import {
  Connection,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  Keypair,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  createTransferInstruction,
  getOrCreateAssociatedTokenAccount,
  getAccount,
  getAssociatedTokenAddress,
} from '@solana/spl-token';
import { AccountLayout } from '@solana/spl-token';
import { ParsedAccountData } from '@solana/web3.js';

export interface TokenBalance {
  mint: string;
  balance: number;
  decimals: number;
  uiAmount: number;  // Amount formatted with decimals
}

export interface WalletBalance {
  solBalance: number;
  tokens: TokenBalance[];
}

export interface DepositAddressInfo {
  address: string;
  exists: boolean;
  requiredRent: number;
}

export class TokenService {
  private connection: Connection;
  private endpoint: string;

  constructor(endpoint: string = 'https://api.mainnet-beta.solana.com') {
    this.endpoint = endpoint;
    this.connection = new Connection(endpoint, 'confirmed');
  }

  public getEndpoint(): string {
    return this.endpoint;
  }

  async getTokenBalance(walletAddress: string, tokenMint: string): Promise<number> {
    try {
      const walletPubkey = new PublicKey(walletAddress);
      const mintPubkey = new PublicKey(tokenMint);

      const tokenAccount = await getOrCreateAssociatedTokenAccount(
        this.connection,
        Keypair.generate(), // This is just a temporary keypair for query
        mintPubkey,
        walletPubkey
      );

      const account = await getAccount(this.connection, tokenAccount.address);
      return Number(account.amount);
    } catch (error) {
      console.error('Error getting token balance:', error);
      return 0;
    }
  }

  async transfer(
    fromWallet: Keypair,
    toAddress: string,
    tokenMint: string,
    amount: number
  ): Promise<string> {
    try {
      const mintPubkey = new PublicKey(tokenMint);
      const destinationPubkey = new PublicKey(toAddress);

      // Get or create the source token account
      const sourceTokenAccount = await getOrCreateAssociatedTokenAccount(
        this.connection,
        fromWallet, // payer for any account creation
        mintPubkey,
        fromWallet.publicKey
      );

      // Check if destination token account exists before creation
      const destinationATA = await getAssociatedTokenAddress(
        mintPubkey,
        destinationPubkey
      );
      
      const destinationAccountBefore = await this.connection.getAccountInfo(destinationATA);

      // Get or create the destination token account
      // Note: fromWallet is the payer for creating the recipient's token account if needed
      const destinationTokenAccount = await getOrCreateAssociatedTokenAccount(
        this.connection,
        fromWallet, // payer for account creation (sender pays the rent)
        mintPubkey,
        destinationPubkey,
      );

      console.log(`Using source token account: ${sourceTokenAccount.address.toString()}`);
      console.log(`Using destination token account: ${destinationTokenAccount.address.toString()}`);
      
      // If the account didn't exist before but exists now, it was just created
      if (!destinationAccountBefore) {
        console.log('Created new Associated Token Account for recipient');
      }

      // Create transfer instruction
      const transferInstruction = createTransferInstruction(
        sourceTokenAccount.address,
        destinationTokenAccount.address,
        fromWallet.publicKey,
        amount,
        [],
        TOKEN_PROGRAM_ID
      );

      // Create and send transaction
      const transaction = new Transaction().add(transferInstruction);
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [fromWallet]
      );

      return signature;
    } catch (error) {
      console.error('Error transferring tokens:', error);
      throw error;
    }
  }

  async getTokenAccounts(walletAddress: string): Promise<TokenBalance[]> {
    try {
      const walletPubkey = new PublicKey(walletAddress);
      const accounts = await this.connection.getParsedTokenAccountsByOwner(walletPubkey, {
        programId: TOKEN_PROGRAM_ID,
      });

      return accounts.value.map(account => {
        const info = account.account.data.parsed.info;
        const decimals = info.tokenAmount.decimals;
        const rawBalance = Number(info.tokenAmount.amount);
        return {
          mint: info.mint,
          balance: rawBalance,
          decimals,
          uiAmount: rawBalance / Math.pow(10, decimals)
        };
      });
    } catch (error) {
      console.error('Error getting token accounts:', error);
      return [];
    }
  }

  public async getWalletBalances(walletAddresses: string[]): Promise<Map<string, WalletBalance>> {
    const balances = new Map<string, WalletBalance>();
    
    try {
      // Get all SOL balances in one request
      const publicKeys = walletAddresses.map(addr => new PublicKey(addr));
      const solBalances = await this.connection.getMultipleAccountsInfo(publicKeys);
      
      // Get all token accounts for these wallets in one request
      const tokenAccounts = await this.connection.getProgramAccounts(
        TOKEN_PROGRAM_ID,
        {
          filters: [
            {
              memcmp: {
                offset: 32, // Owner offset in token account data
                bytes: publicKeys.map(pk => pk.toBase58()).join(','),
              },
            },
            {
              dataSize: 165, // Size of token account data
            },
          ],
        }
      );

      // Process SOL balances
      solBalances.forEach((account, index) => {
        const address = walletAddresses[index];
        balances.set(address, {
          solBalance: (account?.lamports || 0) / LAMPORTS_PER_SOL,
          tokens: []
        });
      });

      // Process token accounts
      for (const account of tokenAccounts) {
        const tokenAccountInfo = AccountLayout.decode(account.account.data);
        const tokenBalance = Number(tokenAccountInfo.amount);
        const tokenMint = new PublicKey(tokenAccountInfo.mint).toString();
        const owner = new PublicKey(tokenAccountInfo.owner).toString();
        
        // Get token decimals (we might want to cache this in the future)
        const mintInfo = await this.connection.getParsedAccountInfo(new PublicKey(tokenMint));
        const decimals = (mintInfo.value?.data as ParsedAccountData)?.parsed?.info?.decimals || 0;
        
        const walletBalance = balances.get(owner);
        if (walletBalance) {
          walletBalance.tokens.push({
            mint: tokenMint,
            balance: tokenBalance,
            decimals,
            uiAmount: tokenBalance / Math.pow(10, decimals)
          });
        }
      }

      return balances;
    } catch (error) {
      console.error('Error fetching balances:', error);
      throw error;
    }
  }

  async getDepositAddress(walletAddress: string, tokenMint: string): Promise<DepositAddressInfo> {
    try {
      const walletPubkey = new PublicKey(walletAddress);
      const mintPubkey = new PublicKey(tokenMint);

      // Get the associated token account address
      const ata = await getAssociatedTokenAddress(
        mintPubkey,
        walletPubkey
      );

      // Check if the account exists
      const account = await this.connection.getAccountInfo(ata);
      const exists = account !== null;

      return {
        address: ata.toString(),
        exists,
        requiredRent: exists ? 0 : await this.connection.getMinimumBalanceForRentExemption(165) // 165 is the size of a token account
      };
    } catch (error) {
      console.error('Error getting deposit address:', error);
      throw error;
    }
  }
} 
import {
  Connection,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  Keypair,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  createTransferInstruction,
  getOrCreateAssociatedTokenAccount,
  getAccount,
} from '@solana/spl-token';

export class TokenService {
  private connection: Connection;

  constructor(endpoint: string = 'https://api.mainnet-beta.solana.com') {
    this.connection = new Connection(endpoint, 'confirmed');
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

      // Get the token accounts for both wallets
      const sourceTokenAccount = await getOrCreateAssociatedTokenAccount(
        this.connection,
        fromWallet,
        mintPubkey,
        fromWallet.publicKey
      );

      const destinationTokenAccount = await getOrCreateAssociatedTokenAccount(
        this.connection,
        fromWallet,
        mintPubkey,
        destinationPubkey
      );

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

  async getTokenAccounts(walletAddress: string): Promise<Array<{ mint: string; balance: number }>> {
    try {
      const walletPubkey = new PublicKey(walletAddress);
      const accounts = await this.connection.getParsedTokenAccountsByOwner(walletPubkey, {
        programId: TOKEN_PROGRAM_ID,
      });

      return accounts.value.map(account => ({
        mint: account.account.data.parsed.info.mint,
        balance: Number(account.account.data.parsed.info.tokenAmount.amount),
      }));
    } catch (error) {
      console.error('Error getting token accounts:', error);
      return [];
    }
  }
} 
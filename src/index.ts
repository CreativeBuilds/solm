#!/usr/bin/env NODE_NO_WARNINGS=1 bun
import { Command } from 'commander';
import inquirer from 'inquirer';
import { WalletService } from './services/WalletService';
import { TokenService } from './services/TokenService';
import bs58 from 'bs58';
import {
  Connection,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
  PublicKey,
} from '@solana/web3.js';

const program = new Command();
const walletService = new WalletService();
const tokenService = new TokenService();

interface PasswordPrompt {
  password: string;
}

interface NewPasswordPrompt {
  password: string;
  confirmPassword: string;
}

async function promptPassword(): Promise<string> {
  const { password } = await inquirer.prompt<PasswordPrompt>({
    type: 'password',
    name: 'password',
    message: 'Enter your password to unlock wallets:',
    validate: (input: string) => input.length >= 8 || 'Password must be at least 8 characters',
  });
  return password;
}

async function promptNewPassword(walletName?: string): Promise<string> {
  const message = walletName 
    ? `Create a password for wallet "${walletName}":`
    : 'Create a password for the wallet:';

  const firstPrompt = await inquirer.prompt<PasswordPrompt>({
    type: 'password',
    name: 'password',
    message,
    validate: (input: string) => input.length >= 8 || 'Password must be at least 8 characters',
  });
  
  const password = firstPrompt.password;
  
  const confirmPrompt = await inquirer.prompt<PasswordPrompt>({
    type: 'password',
    name: 'password',
    message: 'Confirm your password:',
  });

  if (confirmPrompt.password !== password) {
    console.error('\nPasswords do not match. Please try again.');
    process.exit(1);
  }

  return password;
}

async function promptWalletPassword(walletName?: string): Promise<string> {
  const message = walletName 
    ? `Enter password for wallet "${walletName}":`
    : 'Enter wallet password:';

  const { password } = await inquirer.prompt<PasswordPrompt>({
    type: 'password',
    name: 'password',
    message,
    validate: (input: string) => input.length >= 8 || 'Password must be at least 8 characters',
  });
  return password;
}

program
  .name('solm')
  .description('CLI tool for managing multiple Solana wallets and SPL tokens')
  .version('1.0.0');

// Create a wallet command group
const walletCommand = program
  .command('wallet')
  .description('Wallet management commands');

walletCommand
  .command('generate')
  .description('Generate a new wallet')
  .option('-n, --name <name>', 'Name for the wallet')
  .action(async (options) => {
    const password = await promptNewPassword(options.name);
    const wallet = await walletService.generateWallet(password, options.name);
    console.log('Wallet generated successfully:');
    console.log(`Public Key: ${wallet.publicKey}`);
    if (wallet.name) {
      console.log(`Name: ${wallet.name}`);
    }
  });

walletCommand
  .command('import-seed')
  .description('Import a wallet from seed phrase')
  .option('-n, --name <name>', 'Name for the wallet')
  .action(async (options) => {
    const { seedPhrase } = await inquirer.prompt([
      {
        type: 'password',
        name: 'seedPhrase',
        message: 'Enter your seed phrase:',
      },
    ]);

    const password = await promptNewPassword(options.name);

    try {
      const secretKey = bs58.decode(seedPhrase);
      const wallet = await walletService.importWallet(secretKey, password, options.name);
      console.log('Wallet imported successfully:');
      console.log(`Public Key: ${wallet.publicKey}`);
      if (wallet.name) {
        console.log(`Name: ${wallet.name}`);
      }
    } catch (error) {
      console.error('Error importing wallet:', error);
    }
  });

walletCommand
  .command('list')
  .description('List all wallets')
  .action(async () => {
    const wallets = await walletService.listWallets();
    console.log('Your wallets:');
    wallets.forEach(wallet => {
      console.log(`\nPublic Key: ${wallet.publicKey}`);
      if (wallet.name) {
        console.log(`Name: ${wallet.name}`);
      }
    });
  });

program
  .command('send')
  .description('Send SPL tokens')
  .requiredOption('--from <address>', 'Sender wallet address')
  .requiredOption('--to <address>', 'Recipient wallet address')
  .requiredOption('--amount <amount>', 'Amount to send')
  .requiredOption('--token <address>', 'Token mint address')
  .action(async (options) => {
    try {
      const fromWallet = await walletService.getWallet(options.from);
      const password = await promptWalletPassword(fromWallet.name);
      walletService.setPasswordForWallet(options.from, password);

      const fromKeypair = await walletService.getKeypair(options.from);
      const signature = await tokenService.transfer(
        fromKeypair,
        options.to,
        options.token,
        parseInt(options.amount)
      );

      // Clear the password from memory after use
      walletService.clearPasswordForWallet(options.from);
      
      console.log('Transaction successful!');
      console.log(`Signature: ${signature}`);
    } catch (error) {
      console.error('Error sending tokens:', error);
    }
  });

// Create a balance command group
const balanceCommand = program
  .command('balance')
  .description('Balance management commands');

balanceCommand
  .command('list')
  .description('List balances for all wallets')
  .option('--token <address>', 'Token mint address')
  .action(async (options) => {
    try {
      const wallets = await walletService.listWallets();
      
      if (wallets.length === 0) {
        console.log('No wallets found. Use `solm wallet generate` to create one.');
        return;
      }

      console.log('Fetching balances for all wallets...');
      const walletAddresses = wallets.map(w => w.publicKey);
      const balances = await tokenService.getWalletBalances(walletAddresses);
      
      console.log('\nWallet Balances:');
      wallets.forEach(wallet => {
        const balance = balances.get(wallet.publicKey);
        if (balance) {
          console.log(`\nWallet: ${wallet.name || wallet.publicKey}`);
          console.log(`SOL Balance: ${balance.solBalance.toFixed(4)} SOL`);
          
          if (balance.tokens.length === 0) {
            console.log('No token accounts found');
          } else {
            console.log('Token Accounts:');
            balance.tokens.forEach(token => {
              console.log(`  Mint: ${token.mint}`);
              console.log(`  Balance: ${token.balance}`);
            });
          }
        }
      });
    } catch (error) {
      console.error('Error getting balances:', error);
    }
  });

balanceCommand
  .command('get <address>')
  .description('Get balance for a specific wallet')
  .option('--token <address>', 'Token mint address')
  .action(async (address, options) => {
    try {
      if (options.token) {
        const balance = await tokenService.getTokenBalance(address, options.token);
        console.log(`Token Balance: ${balance}`);
      } else {
        const balances = await tokenService.getWalletBalances([address]);
        const balance = balances.get(address);
        
        if (balance) {
          console.log(`SOL Balance: ${balance.solBalance.toFixed(4)} SOL`);
          
          if (balance.tokens.length === 0) {
            console.log('No token accounts found');
          } else {
            console.log('\nToken Accounts:');
            balance.tokens.forEach(token => {
              console.log(`Mint: ${token.mint}`);
              console.log(`Balance: ${token.balance}`);
            });
          }
        }
      }
    } catch (error) {
      console.error('Error getting balance:', error);
    }
  });

program
  .command('spread')
  .description('Spread SOL or SPL tokens from one wallet to multiple wallets, generating new ones if needed')
  .requiredOption('--from <address>', 'Source wallet address')
  .requiredOption('--amount <amount>', 'Amount to spread in total')
  .requiredOption('--count <number>', 'Number of wallets to spread to')
  .option('--token <address>', 'Token mint address (if spreading SPL tokens)')
  .option('--prefix <string>', 'Name prefix for generated wallets', 'wallet')
  .action(async (options) => {
    try {
      const sourceWallet = await walletService.getWallet(options.from);
      const password = await promptWalletPassword(sourceWallet.name);
      walletService.setPasswordForWallet(options.from, password);

      const totalAmount = parseFloat(options.amount);
      const targetCount = parseInt(options.count);
      const isSPLTransfer = !!options.token;
      
      // Get existing wallets excluding source wallet
      const existingWallets = (await walletService.listWallets())
        .filter(w => w.publicKey !== sourceWallet.publicKey);
      
      // Calculate how many new wallets we need
      const walletsNeeded = Math.max(0, targetCount - existingWallets.length);
      const totalWalletsAfterGeneration = existingWallets.length + walletsNeeded;
      
      // Calculate amount per wallet based on total recipients (excluding source)
      const amountPerWallet = totalAmount / totalWalletsAfterGeneration;

      // Check minimum amounts
      if (isSPLTransfer) {
        console.log(`\nSpreading ${totalAmount} tokens of ${options.token} across ${totalWalletsAfterGeneration} wallets (${amountPerWallet} tokens each)`);
      } else {
        if (amountPerWallet * LAMPORTS_PER_SOL < 0.001 * LAMPORTS_PER_SOL) {
          console.error('Amount per wallet is too small. Minimum is 0.001 SOL');
          return;
        }
        console.log(`\nSpreading ${totalAmount} SOL across ${totalWalletsAfterGeneration} wallets (${amountPerWallet} SOL each)`);
      }
      console.log(`Source wallet: ${sourceWallet.name || sourceWallet.publicKey}`);
      
      // Generate new wallets if needed
      if (walletsNeeded > 0) {
        console.log(`\nGenerating ${walletsNeeded} new wallets...`);
        const walletPassword = await promptNewPassword('new wallets');
        
        for (let i = 0; i < walletsNeeded; i++) {
          const walletName = `${options.prefix}-${existingWallets.length + i + 1}`;
          await walletService.generateWallet(walletPassword, walletName);
          process.stdout.write('.');
        }
        console.log('\nNew wallets generated successfully!');
      }

      // Get updated list of wallets (excluding source)
      const destinationWallets = (await walletService.listWallets())
        .filter(w => w.publicKey !== sourceWallet.publicKey);
      
      const sourceKeypair = await walletService.getKeypair(options.from);
      const connection = new Connection(tokenService.getEndpoint(), 'confirmed');
      
      // Process in batches of 10 to avoid rate limits
      const batchSize = 10;
      console.log('\nSending to wallets...');

      for (let i = 0; i < destinationWallets.length; i += batchSize) {
        const batch = destinationWallets.slice(i, Math.min(i + batchSize, destinationWallets.length));
        const transferPromises = batch.map(async (wallet) => {
          try {
            if (isSPLTransfer) {
              // For SPL tokens, use the TokenService transfer method
              const signature = await tokenService.transfer(
                sourceKeypair,
                wallet.publicKey,
                options.token,
                Math.floor(amountPerWallet)
              );
              return { wallet, success: true, signature, isSPL: true };
            } else {
              // For SOL, use SystemProgram transfer
              const transaction = new Transaction().add(
                SystemProgram.transfer({
                  fromPubkey: sourceKeypair.publicKey,
                  toPubkey: new PublicKey(wallet.publicKey),
                  lamports: Math.floor(amountPerWallet * LAMPORTS_PER_SOL),
                })
              );

              const signature = await connection.sendTransaction(transaction, [sourceKeypair]);
              await connection.confirmTransaction(signature);
              return { wallet, success: true, signature, isSPL: false };
            }
          } catch (error) {
            return { wallet, success: false, error, isSPL: isSPLTransfer };
          }
        });

        const results = await Promise.all(transferPromises);
        
        // Log results for this batch
        results.forEach(result => {
          if (result.success) {
            const amount = result.isSPL ? amountPerWallet : `${amountPerWallet} SOL`;
            console.log(`✓ Sent ${amount} to ${result.wallet.name || result.wallet.publicKey}`);
          } else {
            console.error(`✗ Failed to send to ${result.wallet.name || result.wallet.publicKey}: ${result.error}`);
          }
        });
      }

      // Clear the password from memory
      walletService.clearPasswordForWallet(options.from);
      
      console.log('\nSpread operation completed!');
    } catch (error) {
      console.error('Error spreading tokens:', error);
    }
  });

program.parse(); 
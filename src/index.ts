#!/usr/bin/env bun
import { Command } from 'commander';
import inquirer from 'inquirer';
import { WalletService } from './services/WalletService';
import { TokenService } from './services/TokenService';
import bs58 from 'bs58';

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

async function promptNewPassword(): Promise<string> {
  let password = '';
  
  // First prompt for the password
  const firstPrompt = await inquirer.prompt<PasswordPrompt>({
    type: 'password',
    name: 'password',
    message: 'Create a password to encrypt your wallets:',
    validate: (input: string) => input.length >= 8 || 'Password must be at least 8 characters',
  });
  
  password = firstPrompt.password;
  
  // Then prompt for confirmation
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

program
  .name('solm')
  .description('CLI tool for managing multiple Solana wallets and SPL tokens')
  .version('1.0.0');

program
  .command('init')
  .description('Initialize the wallet manager with a password')
  .option('-p, --password <password>', 'Password to encrypt your wallets')
  .action(async (options) => {
    try {
      const password = options.password || await promptNewPassword();
      if (options.password && options.password.length < 8) {
        console.error('Password must be at least 8 characters');
        process.exit(1);
      }
      walletService.setPassword(password);
      console.log('Password set successfully. You can now start managing wallets.');
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error:', error.message);
      } else {
        console.error('An unknown error occurred');
      }
      process.exit(1);
    }
  });

// Create a wallet command group
const walletCommand = program
  .command('wallet')
  .description('Wallet management commands');

walletCommand
  .command('generate')
  .description('Generate a new wallet')
  .option('-n, --name <name>', 'Name for the wallet')
  .action(async (options) => {
    const password = await promptPassword();
    walletService.setPassword(password);
    
    const wallet = await walletService.generateWallet(options.name);
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

    const password = await promptPassword();
    walletService.setPassword(password);

    try {
      const secretKey = bs58.decode(seedPhrase);
      const wallet = await walletService.importWallet(secretKey, options.name);
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
    const password = await promptPassword();
    walletService.setPassword(password);

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
    const password = await promptPassword();
    walletService.setPassword(password);

    try {
      const fromKeypair = await walletService.getKeypair(options.from);
      const signature = await tokenService.transfer(
        fromKeypair,
        options.to,
        options.token,
        parseInt(options.amount)
      );
      console.log('Transaction successful!');
      console.log(`Signature: ${signature}`);
    } catch (error) {
      console.error('Error sending tokens:', error);
    }
  });

program
  .command('balance')
  .description('Get wallet balance')
  .argument('<address>', 'Wallet address')
  .option('--token <address>', 'Token mint address')
  .action(async (address, options) => {
    try {
      if (options.token) {
        const balance = await tokenService.getTokenBalance(address, options.token);
        console.log(`Token Balance: ${balance}`);
      } else {
        const accounts = await tokenService.getTokenAccounts(address);
        console.log('Token Balances:');
        accounts.forEach(account => {
          console.log(`\nMint: ${account.mint}`);
          console.log(`Balance: ${account.balance}`);
        });
      }
    } catch (error) {
      console.error('Error getting balance:', error);
    }
  });

program.parse(); 
#!/usr/bin/env NODE_NO_WARNINGS=1 bun
import { Command } from 'commander';
import inquirer from 'inquirer';
import { WalletService } from './services/WalletService';
import { TokenService } from './services/TokenService';

const program = new Command();
const walletService = new WalletService();
const tokenService = new TokenService();

interface PasswordPrompt {
  password: string;
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
  .alias('w')
  .description('Wallet management commands');

walletCommand
  .command('generate')
  .description('Generate a new Solana wallet')
  .option('-n, --name <name>', 'Optional name for the wallet')
  .addHelpText('after', `
Examples:
  $ solm wallet generate                    # Generate a wallet with auto-generated name
  $ solm wallet generate -n "my-wallet"     # Generate a wallet named "my-wallet"
  `);

walletCommand
  .command('import-seed')
  .description('Import a wallet from base58 encoded seed phrase')
  .option('-n, --name <name>', 'Optional name for the wallet')
  .addHelpText('after', `
Examples:
  $ solm wallet import-seed                 # Import wallet and prompt for seed phrase
  $ solm wallet import-seed -n "imported"   # Import wallet with name "imported"
  `);

// Add helper function for parsing tags
function parseTags(tagString?: string): string[] | undefined {
  if (!tagString) return undefined;
  return tagString.split(',')
    .map((t: string) => t.trim())
    .filter((t: string) => t);
}

walletCommand
  .command('tag')
  .description('Add tags to a wallet')
  .requiredOption('--wallet <address>', 'Wallet address to tag')
  .requiredOption('--tags <tags>', 'Comma-separated list of tags')
  .action(async (options) => {
    try {
      const tags = parseTags(options.tags);
      if (!tags || tags.length === 0) {
        console.error('No valid tags provided');
        return;
      }
      const wallet = await walletService.addTags(options.wallet, tags);
      console.log(`\nTags added to wallet ${wallet.name || wallet.publicKey}:`);
      console.log(wallet.tags?.join(', ') || 'No tags');
    } catch (error: any) {
      console.error('Error adding tags:', error?.message || error);
    }
  });

walletCommand
  .command('untag')
  .description('Remove tags from a wallet')
  .requiredOption('--wallet <address>', 'Wallet address')
  .requiredOption('--tags <tags>', 'Comma-separated list of tags to remove')
  .action(async (options) => {
    try {
      const tags = parseTags(options.tags);
      if (!tags || tags.length === 0) {
        console.error('No valid tags provided');
        return;
      }
      const wallet = await walletService.removeTags(options.wallet, tags);
      console.log(`\nRemaining tags for wallet ${wallet.name || wallet.publicKey}:`);
      console.log(wallet.tags?.join(', ') || 'No tags');
    } catch (error: any) {
      console.error('Error removing tags:', error?.message || error);
    }
  });

walletCommand
  .command('list')
  .alias('ls')
  .description('List all managed wallets')
  .option('--tags <tags>', 'Filter by comma-separated tags (e.g., "hot,trading")')
  .action(async (options) => {
    try {
      const filterTags = parseTags(options.tags);
      const wallets = await walletService.listWallets(filterTags);
      console.log('Your wallets:');
      wallets.forEach(wallet => {
        console.log(`\nPublic Key: ${wallet.publicKey}`);
        if (wallet.name) {
          console.log(`Name: ${wallet.name}`);
        }
        if (wallet.tags && wallet.tags.length > 0) {
          console.log(`Tags: ${wallet.tags.join(', ')}`);
        }
      });
    } catch (error: any) {
      console.error('Error listing wallets:', error?.message || error);
    }
  });

program
  .command('send')
  .description('Send SOL or SPL tokens to another wallet')
  .requiredOption('--from <address>', 'Source wallet address')
  .requiredOption('--to <address>', 'Recipient wallet address')
  .requiredOption('--amount <number>', 'Amount to send')
  .requiredOption('--token <address>', 'Token mint address')
  .addHelpText('after', `
Examples:
  # Send SPL tokens
  $ solm send --from <WALLET> --to <RECIPIENT> --amount 100 --token <MINT>

Note:
  - Amount is in token units (e.g., 1.0 = 1 token)
  - Token account will be auto-created for recipient if needed
  `);

// Create a balance command group
const balanceCommand = program
  .command('balance')
  .alias('b')
  .description('Balance checking commands');

balanceCommand
  .command('list')
  .alias('ls')
  .description('List balances for all wallets')
  .option('--token <address>', 'Filter by specific token mint address')
  .option('--tags <tags>', 'Filter by comma-separated tags (e.g., "hot,trading")')
  .action(async (options) => {
    try {
      const filterTags = parseTags(options.tags);
      const wallets = await walletService.listWallets(filterTags);
      
      if (wallets.length === 0) {
        console.log('No wallets found matching the specified tags.');
        return;
      }

      console.log('Fetching balances for wallets...');
      const walletAddresses = wallets.map(w => w.publicKey);
      const balances = await tokenService.getWalletBalances(walletAddresses);
      
      console.log('\nWallet Balances:');
      wallets.forEach(wallet => {
        const balance = balances.get(wallet.publicKey);
        if (balance) {
          console.log(`\nWallet: ${wallet.name || wallet.publicKey}`);
          if (wallet.tags && wallet.tags.length > 0) {
            console.log(`Tags: ${wallet.tags.join(', ')}`);
          }
          console.log(`SOL Balance: ${balance.solBalance.toFixed(4)} SOL`);
          
          if (balance.tokens.length === 0) {
            console.log('No token accounts found');
          } else {
            console.log('Token Accounts:');
            balance.tokens.forEach(token => {
              console.log(`  Mint: ${token.mint}`);
              console.log(`  Balance: ${token.uiAmount.toFixed(token.decimals)} (${token.decimals} decimals)`);
            });
          }
        }
      });
    } catch (error: any) {
      console.error('Error getting balances:', error?.message || error);
    }
  });

balanceCommand
  .command('get <address>')
  .description('Get balance for a specific wallet')
  .option('--token <address>', 'Filter by specific token mint address')
  .addHelpText('after', `
Examples:
  $ solm balance get <WALLET>               # Show SOL and token balances for wallet
  $ solm balance get <WALLET> --token <MINT># Show specific token balance for wallet
  `);

program
  .command('deposit')
  .description('Get deposit address for receiving tokens')
  .requiredOption('--wallet <address>', 'Wallet address to receive tokens')
  .requiredOption('--token <address>', 'Token mint address')
  .addHelpText('after', `
Examples:
  $ solm deposit --wallet <WALLET> --token <MINT>

Note:
  - Shows the Associated Token Account (ATA) address for receiving tokens
  - Indicates if account needs to be created and required rent
  `);

program
  .command('spread')
  .description('Spread SOL or SPL tokens across multiple wallets')
  .requiredOption('--from <address>', 'Source wallet address')
  .requiredOption('--amount <number>', 'Total amount to spread')
  .requiredOption('--count <number>', 'Number of destination wallets')
  .option('--token <address>', 'Token mint address (if spreading SPL tokens)')
  .option('--prefix <string>', 'Name prefix for generated wallets', 'wallet')
  .option('--variance <number>', 'Distribution variance factor (0-1)', '0')
  .option('--tags <tags>', 'Comma-separated tags to apply to new wallets')
  .addHelpText('after', `
Examples:
  # Spread SOL evenly
  $ solm spread --from <WALLET> --amount 10 --count 5

  # Spread tokens with variance and tags
  $ solm spread --from <WALLET> --amount 1000 --count 100 --token <MINT> --variance 0.5 --tags "batch1,test"

  # Spread with custom wallet naming and tags
  $ solm spread --from <WALLET> --amount 10 --count 5 --prefix "test-wallet" --tags "test,automated"

Notes:
  - If count exceeds existing wallets, new ones will be generated
  - Variance of 0 means equal distribution
  - Variance of 1 means high randomization
  - Minimum SOL amount per wallet is 0.001
  - Token accounts are auto-created for recipients
  - Tags will be applied to newly generated wallets only
  `);

program.addHelpText('after', `
Environment Variables:
  NODE_NO_WARNINGS=1     Suppress Node.js warnings

Examples:
  # Generate a new wallet
  $ solm wallet generate -n "my-wallet"

  # Check balances
  $ solm balance list

  # Send tokens
  $ solm send --from <WALLET> --to <RECIPIENT> --amount 100 --token <MINT>

  # Spread tokens
  $ solm spread --from <WALLET> --amount 1000 --count 100 --token <MINT>

For more info, run any command with the --help flag:
  $ solm wallet --help
  $ solm balance --help
  $ solm send --help
  $ solm spread --help
`);

program.parse(); 
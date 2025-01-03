#!/usr/bin/env NODE_NO_WARNINGS=1 bun
import { Command } from 'commander';
import inquirer from 'inquirer';
import { WalletService } from './services/WalletService';
import { TokenService } from './services/TokenService';
import chalk from 'chalk';
import Table from 'cli-table3';
import path from 'path';

const program = new Command();

// Formatting helpers
const formatAmount = (amount: number, decimals: number = 4) => amount.toFixed(decimals);
const formatSOL = (amount: number) => `${formatAmount(amount)} ${chalk.yellow('SOL')}`;
const formatAddress = (address: string) => chalk.cyan(address);
const formatName = (name: string) => chalk.green(name);
const formatTags = (tags: string[]) => tags.map(tag => chalk.magenta(tag)).join(', ');
const formatSuccess = (text: string) => chalk.green('✓ ') + text;
const formatError = (text: string) => chalk.red('✗ ') + text;
const formatHeader = (text: string) => chalk.bold.blue(text);

function createTable(head: string[]) {
  return new Table({
    head: head.map(h => chalk.bold.blue(h)),
    chars: {
      'top': '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
      'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
      'left': '│', 'left-mid': '├', 'mid': '─', 'mid-mid': '┼',
      'right': '│', 'right-mid': '┤', 'middle': '│'
    }
  });
}

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

program
  .name('solm')
  .description('CLI tool for managing multiple Solana wallets and SPL tokens')
  .version('1.0.0')
  .option('-p, --path <path>', 'Custom path for wallet storage')
  .hook('preAction', (thisCommand) => {
    // Get the path from command line or environment
    const customPath = thisCommand.opts().path;
    
    // Create new service instances with the resolved path
    global.walletService = new WalletService(customPath);
    global.tokenService = new TokenService();
  });

// Add type declaration for global services
declare global {
  var walletService: WalletService;
  var tokenService: TokenService;
}

// Create a wallet command group
const walletCommand = program
  .command('wallet')
  .alias('w')
  .description('Wallet management commands');

walletCommand
  .command('generate')
  .description('Generate a new Solana wallet')
  .option('-n, --name <name>', 'Optional name for the wallet')
  .action(async (options) => {
    try {
      const name = options.name || undefined;
      
      // Validate name availability first
      if (name) {
        const wallets = await walletService.listWallets();
        const nameExists = wallets.some(w => w.name && w.name.toLowerCase() === name.toLowerCase());
        if (nameExists) {
          console.error(formatError(`A wallet with the name "${name}" already exists`));
          console.log(chalk.gray('\nTip: Choose a different name or use the wallet list command to see existing wallets'));
          process.exit(1);
        }
      }
      
      const password = await promptNewPassword(name);
      const wallet = await walletService.generateWallet(name, password);
      
      console.log(formatHeader('\nWallet Generated'));
      console.log(`${chalk.bold('Public Key:')}  ${formatAddress(wallet.publicKey)}`);
      if (wallet.name) {
        console.log(`${chalk.bold('Name:')}       ${formatName(wallet.name)}`);
      }
      if (wallet.tags?.length) {
        console.log(`${chalk.bold('Tags:')}       ${formatTags(wallet.tags)}`);
      }
      console.log(`${chalk.bold('Storage:')}    ${chalk.gray(path.join(walletService.getBasePath(), 'accounts'))}`);
      console.log(formatSuccess('\nWallet has been encrypted and saved'));
    } catch (error: any) {
      console.error(formatError('Error generating wallet:'), error?.message || error);
    }
  })
  .addHelpText('after', `
${formatHeader('Examples:')}
  ${chalk.gray('$')} ${chalk.green('solm')} wallet generate                    ${chalk.gray('# Generate a wallet with auto-generated name')}
  ${chalk.gray('$')} ${chalk.green('solm')} wallet generate -n "my-wallet"     ${chalk.gray('# Generate a wallet named "my-wallet"')}
  `);

walletCommand
  .command('import-seed')
  .description('Import a wallet from base58 encoded seed phrase')
  .option('-n, --name <name>', 'Optional name for the wallet')
  .action(async (options) => {
    try {
      const name = options.name || undefined;
      
      // Validate name availability first
      if (name) {
        const wallets = await walletService.listWallets();
        const nameExists = wallets.some(w => w.name && w.name.toLowerCase() === name.toLowerCase());
        if (nameExists) {
          console.error(formatError(`A wallet with the name "${name}" already exists`));
          console.log(chalk.gray('\nTip: Choose a different name or use the wallet list command to see existing wallets'));
          process.exit(1);
        }
      }
      
      // Prompt for seed phrase
      const { seedPhrase } = await inquirer.prompt({
        type: 'password',
        name: 'seedPhrase',
        message: 'Enter the base58 encoded seed phrase:',
        validate: (input: string) => input.length > 0 || 'Seed phrase is required',
      });

      // Prompt for encryption password
      const password = await promptNewPassword(name);
      
      // Import the wallet
      const wallet = await walletService.importWallet(name, password, seedPhrase);
      
      console.log(formatHeader('\nWallet Imported'));
      console.log(`${chalk.bold('Public Key:')}  ${formatAddress(wallet.publicKey)}`);
      if (wallet.name) {
        console.log(`${chalk.bold('Name:')}       ${formatName(wallet.name)}`);
      }
      if (wallet.tags?.length) {
        console.log(`${chalk.bold('Tags:')}       ${formatTags(wallet.tags)}`);
      }
      console.log(`${chalk.bold('Storage:')}    ${chalk.gray(path.join(walletService.getBasePath(), 'accounts'))}`);
      console.log(formatSuccess('\nWallet has been encrypted and saved'));
    } catch (error: any) {
      console.error(formatError('Error importing wallet:'), error?.message || error);
    }
  })
  .addHelpText('after', `
${formatHeader('Examples:')}
  ${chalk.gray('$')} ${chalk.green('solm')} wallet import-seed                 ${chalk.gray('# Import wallet and prompt for seed phrase')}
  ${chalk.gray('$')} ${chalk.green('solm')} wallet import-seed -n "imported"   ${chalk.gray('# Import wallet with name "imported"')}
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
        console.error(formatError('No valid tags provided'));
        return;
      }
      const wallet = await walletService.addTags(options.wallet, tags);
      console.log(formatSuccess(`\nTags added to wallet ${formatName(wallet.name || '')} ${formatAddress(wallet.publicKey)}`));
      console.log(formatTags(wallet.tags || []));
    } catch (error: any) {
      console.error(formatError('Error adding tags:'), error?.message || error);
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
        console.error(formatError('No valid tags provided'));
        return;
      }
      const wallet = await walletService.removeTags(options.wallet, tags);
      console.log(formatSuccess(`\nRemaining tags for wallet ${formatName(wallet.name || '')} ${formatAddress(wallet.publicKey)}`));
      console.log(wallet.tags?.length ? formatTags(wallet.tags) : 'No tags');
    } catch (error: any) {
      console.error(formatError('Error removing tags:'), error?.message || error);
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
      
      if (wallets.length === 0) {
        console.log(formatError('No wallets found.'));
        return;
      }

      console.log(formatHeader('\nWallet List'));
      const table = createTable(['#', 'Public Key', 'Name', 'Tags']);
      
      wallets.forEach(wallet => {
        table.push([
          chalk.yellow(wallet.index.toString()),
          formatAddress(wallet.publicKey),
          wallet.name ? formatName(wallet.name) : '',
          wallet.tags?.length ? formatTags(wallet.tags) : ''
        ]);
      });

      console.log(table.toString());
    } catch (error: any) {
      console.error(formatError('Error listing wallets:'), error?.message || error);
    }
  });

walletCommand
  .command('reindex')
  .description('Reindex all wallets sequentially')
  .action(async () => {
    try {
      console.log(chalk.bold('\nReindexing wallets...'));
      
      let lastProgress = 0;
      await walletService.reindexWallets((current, total) => {
        // Update progress every 10%
        const progress = Math.floor((current / total) * 100);
        if (progress >= lastProgress + 10) {
          process.stdout.write(`${chalk.yellow('→')} Progress: ${progress}%\r`);
          lastProgress = progress;
        }
      });
      
      // Clear the progress line
      process.stdout.write('\r' + ' '.repeat(50) + '\r');
      
      // Show the reindexed wallets
      const wallets = await walletService.listWallets();
      
      console.log(formatHeader('\nWallets Reindexed'));
      const table = createTable(['#', 'Public Key', 'Name', 'Tags']);
      
      wallets.forEach(wallet => {
        table.push([
          chalk.yellow(wallet.index.toString()),
          formatAddress(wallet.publicKey),
          wallet.name ? formatName(wallet.name) : '',
          wallet.tags?.length ? formatTags(wallet.tags) : ''
        ]);
      });

      console.log(table.toString());
      console.log(formatSuccess(`\nAll wallets have been reindexed successfully (${wallets.length} total)`));
    } catch (error: any) {
      console.error(formatError('Error reindexing wallets:'), error?.message || error);
    }
  })
  .addHelpText('after', `
${formatHeader('Examples:')}
  ${chalk.gray('$')} ${chalk.green('solm')} wallet reindex     ${chalk.gray('# Reindex all wallets sequentially')}

${formatHeader('Note:')}
  ${chalk.gray('•')} This command will reassign indices to all wallets based on their creation order
  ${chalk.gray('•')} Use this to fix any index conflicts or missing indices
  `);

walletCommand
  .command('name')
  .description('Set or clear the name of a wallet')
  .requiredOption('--wallet <address>', 'Wallet address to rename')
  .option('-n, --name <name>', 'New name for the wallet (omit to clear the name)')
  .action(async (options) => {
    try {
      const wallet = await walletService.renameWallet(options.wallet, options.name);
      
      console.log(formatHeader('\nWallet Renamed'));
      const table = createTable(['Field', 'Value']);
      
      table.push(
        ['Public Key', formatAddress(wallet.publicKey)],
        ['Name', wallet.name ? formatName(wallet.name) : chalk.gray('(none)')],
        ['Tags', wallet.tags?.length ? formatTags(wallet.tags) : chalk.gray('(none)')]
      );

      console.log(table.toString());
      console.log(formatSuccess('\nWallet name has been updated'));
    } catch (error: any) {
      console.error(formatError('Error renaming wallet:'), error?.message || error);
    }
  })
  .addHelpText('after', `
${formatHeader('Examples:')}
  ${chalk.gray('$')} ${chalk.green('solm')} wallet name --wallet <ADDRESS> -n "hot-wallet"    ${chalk.gray('# Set wallet name')}
  ${chalk.gray('$')} ${chalk.green('solm')} wallet name --wallet <ADDRESS>                    ${chalk.gray('# Clear wallet name')}
  `);

program
  .command('send')
  .description('Send SOL or SPL tokens to another wallet')
  .requiredOption('--from <address>', 'Source wallet address')
  .requiredOption('--to <address>', 'Recipient wallet address')
  .requiredOption('--amount <number>', 'Amount to send')
  .requiredOption('--token <address>', 'Token mint address')
  .addHelpText('after', `
${formatHeader('Examples:')}
  ${chalk.bold('# Send SPL tokens')}
  ${chalk.gray('$')} ${chalk.green('solm')} send --from <WALLET> --to <RECIPIENT> --amount 100 --token <MINT>

${formatHeader('Note:')}
  ${chalk.gray('•')} Amount is in token units (e.g., 1.0 = 1 token)
  ${chalk.gray('•')} Token account will be auto-created for recipient if needed
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
        console.log(formatError('No wallets found matching the specified tags.'));
        return;
      }

      console.log(chalk.bold('\nFetching balances...'));
      const walletAddresses = wallets.map(w => w.publicKey);
      const balances = await tokenService.getWalletBalances(walletAddresses);
      
      console.log(formatHeader('\nWallet Balances'));
      const table = createTable(['#', 'Wallet', 'SOL Balance', 'Token Balances']);
      
      wallets.forEach(wallet => {
        const balance = balances.get(wallet.publicKey);
        if (balance) {
          const walletInfo = [
            formatAddress(wallet.publicKey),
            wallet.name ? `\n${formatName(wallet.name)}` : '',
            wallet.tags?.length ? `\n${formatTags(wallet.tags)}` : ''
          ].filter(Boolean).join('');

          if (balance.tokens.length === 0) {
            table.push([
              chalk.yellow(wallet.index.toString()),
              walletInfo,
              formatSOL(balance.solBalance),
              'No tokens'
            ]);
          } else {
            // For wallets with tokens, create rows with empty cells for wallet and SOL balance
            balance.tokens.forEach((token, index) => {
              if (index === 0) {
                // First token row includes wallet info and SOL balance
                table.push([
                  chalk.yellow(wallet.index.toString()),
                  walletInfo,
                  formatSOL(balance.solBalance),
                  `${formatAmount(token.uiAmount, token.decimals)} (${formatAddress(token.mint)})`
                ]);
              } else {
                // Subsequent token rows have empty cells for wallet and SOL balance
                table.push([
                  '',
                  '',
                  '',
                  `${formatAmount(token.uiAmount, token.decimals)} (${formatAddress(token.mint)})`
                ]);
              }
            });
          }
        }
      });

      console.log(table.toString());
    } catch (error: any) {
      console.error(formatError('Error getting balances:'), error?.message || error);
    }
  });

balanceCommand
  .command('get <address>')
  .description('Get balance for a specific wallet')
  .option('--token <address>', 'Filter by specific token mint address')
  .action(async (address, options) => {
    try {
      const wallet = await walletService.getWallet(address);
      const balance = await tokenService.getWalletBalances([address]);
      const walletBalance = balance.get(address);

      if (!walletBalance) {
        console.error(formatError('No balance information found'));
        return;
      }

      console.log(formatHeader('\nWallet Balance'));
      const table = createTable(['Asset', 'Balance']);
      
      // Add SOL balance
      table.push(['SOL', formatSOL(walletBalance.solBalance)]);
      
      // Add token balances
      walletBalance.tokens.forEach(token => {
        table.push([
          formatAddress(token.mint),
          formatAmount(token.uiAmount, token.decimals)
        ]);
      });

      console.log(table.toString());
    } catch (error: any) {
      console.error(formatError('Error getting balance:'), error?.message || error);
    }
  });

program
  .command('deposit')
  .description('Get deposit address for receiving tokens')
  .requiredOption('--wallet <address>', 'Wallet address to receive tokens')
  .requiredOption('--token <address>', 'Token mint address')
  .action(async (options) => {
    try {
      const info = await tokenService.getDepositAddress(options.wallet, options.token);
      
      console.log(formatHeader('\nDeposit Information'));
      const table = createTable(['Field', 'Value']);
      
      table.push(
        ['Deposit Address', formatAddress(info.address)],
        ['Account Exists', info.exists ? chalk.green('Yes') : chalk.yellow('No')],
        ['Required Rent', info.exists ? chalk.green('Already funded') : formatSOL(info.requiredRent)]
      );

      console.log(table.toString());
    } catch (error: any) {
      console.error(formatError('Error getting deposit address:'), error?.message || error);
    }
  });

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
${formatHeader('Examples:')}
  ${chalk.bold('# Spread SOL evenly')}
  ${chalk.gray('$')} ${chalk.green('solm')} spread --from <WALLET> --amount 10 --count 5

  ${chalk.bold('# Spread tokens with variance and tags')}
  ${chalk.gray('$')} ${chalk.green('solm')} spread --from <WALLET> --amount 1000 --count 100 --token <MINT> --variance 0.5 --tags "batch1,test"

  ${chalk.bold('# Spread with custom wallet naming and tags')}
  ${chalk.gray('$')} ${chalk.green('solm')} spread --from <WALLET> --amount 10 --count 5 --prefix "test-wallet" --tags "test,automated"

${formatHeader('Notes:')}
  ${chalk.gray('•')} If count exceeds existing wallets, new ones will be generated
  ${chalk.gray('•')} Variance of 0 means equal distribution
  ${chalk.gray('•')} Variance of 1 means high randomization
  ${chalk.gray('•')} Minimum SOL amount per wallet is 0.001
  ${chalk.gray('•')} Token accounts are auto-created for recipients
  ${chalk.gray('•')} Tags will be applied to newly generated wallets only
  `);

program.addHelpText('after', `
${formatHeader('Environment Variables:')}
  ${chalk.cyan('NODE_NO_WARNINGS=1')}     ${chalk.gray('Suppress Node.js warnings')}
  ${chalk.cyan('SOLM_PATH')}              ${chalk.gray('Custom path for wallet storage')}

${formatHeader('Storage Location:')}
  ${chalk.gray('•')} Default: ${chalk.yellow(WalletService.getDefaultPath())}
  ${chalk.gray('•')} Override with ${chalk.cyan('SOLM_PATH')} environment variable
  ${chalk.gray('•')} Override with ${chalk.cyan('--path')} option

${formatHeader('Examples:')}
  ${chalk.bold('# Generate a new wallet')}
  ${chalk.gray('$')} ${chalk.green('solm')} wallet generate -n "my-wallet"

  ${chalk.bold('# Check balances')}
  ${chalk.gray('$')} ${chalk.green('solm')} balance list

  ${chalk.bold('# Send tokens')}
  ${chalk.gray('$')} ${chalk.green('solm')} send --from <WALLET> --to <RECIPIENT> --amount 100 --token <MINT>

  ${chalk.bold('# Spread tokens')}
  ${chalk.gray('$')} ${chalk.green('solm')} spread --from <WALLET> --amount 1000 --count 100 --token <MINT>

  ${chalk.bold('# Use custom storage path')}
  ${chalk.gray('$')} ${chalk.green('solm')} --path ~/my-wallets wallet list

${formatHeader('For more info:')}
Run any command with the ${chalk.yellow('--help')} flag
  ${chalk.gray('$')} ${chalk.green('solm')} wallet --help
  ${chalk.gray('$')} ${chalk.green('solm')} balance --help
  ${chalk.gray('$')} ${chalk.green('solm')} send --help
  ${chalk.gray('$')} ${chalk.green('solm')} spread --help
`);

program.parse(); 
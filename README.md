# Solana Wallet CLI

A command-line tool for managing multiple Solana wallets and SPL tokens. This tool allows you to easily manage multiple wallets, send tokens between them, and interact with external accounts.

## Features

- Generate multiple wallets from a seed phrase or import from file
- Secure storage of wallet information with password encryption
- Send and receive SPL tokens between wallets
- Manage multiple wallets simultaneously
- Import/Export wallet configurations
- Support for external wallet interactions

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/solm.git
cd solm

# Install dependencies
bun install

# Build the project
bun run build

# Create a symlink to use the CLI globally
bun link
```

## Usage

```bash
# First time setup - this will prompt for a password to encrypt your wallet files
solm init

# Generate a new wallet
solm wallet generate

# Import wallet from seed phrase
solm wallet import-seed

# Send SPL tokens
solm send --from <WALLET_ADDRESS> --to <RECIPIENT_ADDRESS> --amount <AMOUNT> --token <TOKEN_ADDRESS>

# List all wallets
solm wallet list

# Get balance commands
solm balance <WALLET_ADDRESS>  # Get balance for a specific wallet
solm balance list             # List balances for all wallets
solm balance list --token <TOKEN_ADDRESS>  # List balances for a specific token
```

## Security

- All wallet information is stored encrypted in the `.accounts` directory
- Password is required to decrypt wallet information on startup
- Never share your seed phrases or private keys
- The password is never stored, only used for encryption/decryption

## Development

```bash
# Run tests
bun test

# Build the project
bun run build

# Run in development mode
bun run dev
```

## License

MIT 
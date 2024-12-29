# Solana Wallet Splitter CLI

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
git clone https://github.com/yourusername/solana-splitter.git
cd solana-splitter

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
solana-splitter init

# Generate a new wallet
solana-splitter wallet generate

# Import wallet from seed phrase
solana-splitter wallet import-seed

# Send SPL tokens
solana-splitter send --from <WALLET_ADDRESS> --to <RECIPIENT_ADDRESS> --amount <AMOUNT> --token <TOKEN_ADDRESS>

# List all wallets
solana-splitter wallet list

# Get wallet balance
solana-splitter balance <WALLET_ADDRESS>
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
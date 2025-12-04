# ASI Wallet SDK

A TypeScript-based wallet SDK for the ASI Chain ecosystem, providing secure key management, RPC client integration, and wallet functionality for blockchain applications.

## Overview

The ASI Wallet SDK is a lightweight, modular library designed to simplify wallet integration and key management for ASI Chain applications. It includes built-in support for local key management, RPC communication, and extensible wallet components.

## Features

- **Key Management**: Secure local key management with `LocalKeyManager` component
- **RPC Client**: Integrated RPC client for blockchain communication
- **Type-Safe**: Full TypeScript support with comprehensive type definitions
- **Modular Architecture**: Clean separation of concerns with distinct components for different functionalities
- **Error Handling**: Robust error handling with custom error types
- **Development Playground**: Included React-based playground for testing and development

## Project Structure

```
asi-chain-wallet-sdk/
├── src/                          # Main SDK source code
│   ├── components/              # Core wallet components
│   │   ├── client/             # Client component
│   │   ├── keyManager/         # Key management interface
│   │   ├── localKeyManager/    # Local key implementation
│   │   └── rpcClient/          # RPC client component
│   ├── errors/                 # Custom error definitions
│   ├── types/                  # TypeScript type definitions
│   └── index.ts                # SDK entry point
├── playground/                  # React development environment
│   ├── src/                    # Playground React components
│   │   └── components/         # React UI components
│   ├── package.json            # Playground dependencies
│   ├── vite.config.ts          # Vite configuration
│   └── index.html              # HTML entry point
├── dist/                        # Compiled output (generated)
├── package.json                 # SDK dependencies and scripts
├── tsconfig.build.json         # TypeScript build configuration
└── README.md                   # This file
```

## Installation

```bash
npm install asi-wallet-sdk
```

## Quick Start

```typescript
import { /* components */ } from 'asi-wallet-sdk';

// Your wallet integration code here
```

## Development

### Setup

Install dependencies for SDK:

```bash
npm install
```

Switch 
cd playground
npm install
cd ..
```

### Build

Build the SDK:

```bash
npm run build
```

### Development Mode

Watch mode for SDK changes:

```bash
npm run dev
```

### Playground

Start the development playground (React + Vite):

```bash
cd playground
npm run dev
```

The playground provides a local testing environment for developing and testing wallet functionality.

Build the playground:

```bash
cd playground
npm run build
```

## Project Details

- **Language**: TypeScript
- **Module System**: ESM (ES Modules)
- **Build Target**: ES2020
- **Main Entry**: `src/index.ts`
- **Distribution**: `dist/` (JavaScript + Type Definitions)

## Components

### Client
Core client component for wallet operations.

### Key Manager
Interface for key management operations.

### Local Key Manager
Reference implementation for local key storage and management.

### RPC Client
Client for interacting with ASI Chain RPC endpoints.

## License

MIT

## Contributing

Contributions are welcome! Please ensure all code is properly typed and follows the project's TypeScript configuration.

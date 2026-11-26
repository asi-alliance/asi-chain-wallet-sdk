<div align="center">

# ASI Chain: Wallet SDK

[![Status](https://img.shields.io/badge/Status-BETA-FFA500?style=for-the-badge)](https://github.com/asi-alliance/asi-chain-wallet-sdk)
[![License](https://img.shields.io/badge/License-Apache_2.0-green?style=for-the-badge)](LICENSE)
[![Docs](https://img.shields.io/badge/Docs-Available-C4F0C1?style=for-the-badge)](https://docs.asichain.io)
</br>
![npm](https://img.shields.io/npm/v/@asichain/asi-wallet-sdk?label=asi-wallet-sdk&color=blue)

<h3>TypeScript SDK for wallet management and blockchain interaction on ASI Chain</h3>

Part of the [**Artificial Superintelligence Alliance**](https://superintelligence.io) ecosystem

_Uniting Fetch.ai, SingularityNET, and CUDOS_

</div>

---

## Table of Contents

1. [Overview](#overview)
2. [Key Features](#key-features)
3. [Installation](#installation)
4. [Quick Start](#quick-start)
5. [Architecture](#architecture)
6. [Project Structure](#project-structure)
7. [Documentation](#documentation)
8. [Security](#security)
9. [Development](#development)
10. [License](#license)

---

## Overview

ASI Chain Wallet SDK is a modular TypeScript library designed to simplify wallet integration and key management for [ASI Chain](https://github.com/asi-alliance/asi-chain) applications. It is organized around a high-level [`Client`](docs/DOMAINS.md) facade that manages multi-account HD wallets, secure encrypted storage, multi-network access, and reservation-aware transfers, while keeping secret material behind a strict signing boundary.

---

## Key Features

- **Client Facade** - Single entry point for wallet lifecycle, networks, balances, and transfers via [Client](docs/DOMAINS.md)
- **Multi-Account HD Wallets** - Private-key and BIP-39/BIP-44 HD wallets with on-demand account derivation via [Wallet](docs/DOMAINS.md) and [Account](docs/DOMAINS.md)
- **Separate Open and Unlocked States** - Wallets are loaded into memory independently of the signing session that holds the decrypted secret, via [Client](docs/DOMAINS.md#open-vs-unlocked) and [SigningSession](docs/DOMAINS.md)
- **Event Subscriptions** - Typed, isolated listeners attachable at any time through `client.getEventBus()`, including a single `networksChanged` event that carries the whole network list and selection, via [ClientEventBus](docs/SERVICES.md)
- **Duplicate Protection** - Wallets and accounts are matched on non-reversible key fingerprints, so re-importing the same secret is refused even while everything is locked; an HD wallet is identified by its mnemonic together with its root HD path, via [KeyFingerprintService](docs/SERVICES.md)
- **Encrypted Wallet Keyfiles** - Password-protected export and import of a whole wallet, with a preview that reports which accounts are new before anything is written, via [Client](docs/DOMAINS.md#keyfile-export--import)
- **Versioned Storage with Migrations** - Persisted data carries a schema version; incompatible or interrupted state is refused up front instead of being silently rewritten, via [StorageMigrationRunner](docs/SERVICES.md)
- **Secure Key Handling** - PBKDF2 + AES-GCM encryption with key zeroization and a no-raw-export signing boundary via [CryptoService](docs/SERVICES.md) and [Signer](docs/DOMAINS.md)
- **Cross-Environment Storage** - IndexedDB (browser) and node-persist (Node.js) behind a shared table abstraction via [storage layer](docs/DOMAINS.md)
- **Pending-Transaction Reservations** - Persistent, reservation-aware available balance with deploy-status polling; a reservation is stored before its deploy is sent and is released on failure only when the node explicitly refused the deploy, via [ReservationAdapter](docs/DOMAINS.md)
- **External Reservation Management** - Deploys submitted outside the SDK can lock funds too: reservations can be added, updated, and removed directly, with validation and concurrency guards, via [Client](docs/DOMAINS.md#external-reservations)
- **Detached Deploy Signing** - `signDeploy` builds and signs a deploy and returns the signed envelope for callers that submit it themselves, via [Client](docs/DOMAINS.md)
- **Explicit Account Targeting** - No active-account state: every call names its wallet and account, so concurrent operations on one wallet cannot sign for the wrong account, via [Client](docs/DOMAINS.md#no-active-account)
- **Typed Failures** - Decryption, storage, and node errors carry a machine-readable code and structured fields instead of an assembled message string, via [CustomError](docs/DOMAINS.md#customerror-srcdomainscustomerrorindexts)
- **Multi-Network Access** - Runtime network switching over validator, read-only, and GraphQL indexer clients via [ApiClientManager](docs/DOMAINS.md)
- **Per-Network Node Profiles** - Legacy Scala and new Rust f1r3node request contracts behind one interface, including the uint256 deploy signing of the Rust node API, via [NodeApiAdapter](docs/DOMAINS.md)
- **Per-Network Token Precision** - Each network declares its native token decimals (8 by default, up to 18), and balances, transfers, reservations, and conversions follow the precision of their network, via [Network](docs/DOMAINS.md#network-srcdomainsnetworkindexts)
- **Exact Wide Amounts** - Amounts, balances, and phlo prices up to `2^256 - 1` are handled as `bigint` and exact decimal strings, never rounded through `Number`, via [amount conversion](docs/UTILS.md#amount-conversion)
- **Node Minimum Phlo Price** - Deploys and transfers are signed and reserved with the minimum phlo price the node of the selected network reports, read once per network, and a lower explicit price is refused before signing, via [NetworkSession](docs/DOMAINS.md#networksession-srcdomainsnetworksessionindexts)
- **Transaction History** - Indexed transfer history through a GraphQL anti-corruption layer via [AccountDataService](docs/SERVICES.md)

---

## Installation

```bash
npm install @asichain/asi-wallet-sdk
```

For Node.js applications, use a supported LTS line (22.x, 24.x or 26.x).
The package provides both ESM and CommonJS entry points.

---

## Quick Start

### Create the Client

The [`Client`](docs/DOMAINS.md) is the single entry point. Provide a per-network
configuration and (optionally) a default network.

```typescript
import {
    Client,
    NodeApiProfile,
    type TNetworksConfig,
} from "@asichain/asi-wallet-sdk";

const networksConfig: TNetworksConfig = {
    DevNet: {
        ValidatorURL: "http://validator-node:40403",
        ReadOnlyURL: "http://observer-node:40403",
        IndexerURL: "http://indexer-node:8080",
        nodeApiProfile: NodeApiProfile.SCALA,
    },
    Dev: {
        ValidatorURL: "",
        ReadOnlyURL: "",
        IndexerURL: "",
        nodeApiProfile: NodeApiProfile.RUST,
        nativeTokenDecimals: 18, // optional, defaults to 8
    },
    MainNet: {
        ValidatorURL: "",
        ReadOnlyURL: "",
        IndexerURL: "",
        nodeApiProfile: NodeApiProfile.SCALA,
    },
    TestNet: {
        ValidatorURL: "",
        ReadOnlyURL: "",
        IndexerURL: "",
        nodeApiProfile: NodeApiProfile.RUST,
        nativeTokenDecimals: 18,
    },
};

const client = await Client.create({
    networksConfig,
    defaultNetwork: "DevNet",
});
```

`Client.create` also brings storage up to date. Persisted data carries a schema
version, and startup refuses to touch anything it cannot safely handle: data
written by a newer SDK build, a malformed migration chain, or a migration that a
previous run left unfinished. Those rejections are `StorageSchemaError`s carrying
an `isStorageIntact` flag, which tells you whether the data on disk is still
readable (update the SDK) or needs restoring from an export.

`nodeApiProfile` is required on every network. It selects which f1r3node
implementation the SDK talks to — `SCALA` for the legacy node, `RUST` for the new
one — and that choice drives the HTTP request shape, the endpoint a given call
targets, and which Rholang vault contract the built-in terms address. There is no
default: an omitted or unknown profile throws at `Client.create`, because guessing
it would silently send legacy-shaped requests to a new node. Custom networks added
at runtime through `client.addNetwork` must supply it too. The `RUST` profile
targets the Rust node API with uint256 deploy signing (node #881 and later);
older Rust nodes are not supported.

`nativeTokenDecimals` is the precision of the network's native token: 1 ASI is
`10^nativeTokenDecimals` atomic units. It is optional, an integer from `0` to
`18`, and defaults to `8`; the SDK takes it from the config and does not ask the
node. Every network record the SDK returns has it set, so read it as
`client.getCurrentNetwork().config.nativeTokenDecimals`.

### Create Wallets

```typescript
import { MnemonicStrength } from "@asichain/asi-wallet-sdk";

// HD (mnemonic) wallet
const mnemonic = client.generateMnemonic(MnemonicStrength.TWELVE_WORDS);
const hdWallet = await client.createHDWallet(
    { mnemonic, accountName: "Account 1" },
    "wallet-password",
);

// Private-key wallet
const privateKey = client.generatePrivateKey();
const pkWallet = await client.createPrivateKeyWallet(
    { privateKey, accountName: "Imported" },
    "wallet-password",
);

// Derive another account on the HD wallet
const { account } = await client.deriveAccount(
    hdWallet.getId(),
    "Account 2",
    "wallet-password",
);
console.log("New address:", account.getAddress());
```

See [Client](docs/DOMAINS.md), [Wallet](docs/DOMAINS.md), and [Account](docs/DOMAINS.md) for the full API reference.

Creating a wallet whose secret is already stored throws `DuplicateWalletError`,
and one whose key already belongs to a stored account throws
`DuplicateAccountError`. Both carry the ids of the existing owner, and both work
while every wallet is closed, because the match runs on a key fingerprint rather
than on decrypted material.

For HD wallets "the same secret" means the same mnemonic **on the same root HD
path** (`m/44'/coin'/account'/change`). The same mnemonic on another root path
derives different keys and is a different wallet. Wallets stored by `v2.0.0` and
earlier are still recognized, and their fingerprint is upgraded the first time
they are opened (see [Open vs unlocked](docs/DOMAINS.md#open-vs-unlocked)).

### Open, Unlock, and Close Wallets

A wallet being **open** (present in memory) and a wallet being **unlocked** (able
to sign without a password) are two different states.

```typescript
// Load a stored wallet into memory. With the default session policy it comes
// back already unlocked.
const wallet = await client.openWallet(signerId, "wallet-password");

client.isWalletOpen(wallet.getId()); // true
client.isWalletUnlocked(wallet.getId()); // true

// End the signing session, keep the wallet open
client.lockWallet(wallet.getId());

// Start a new session on the wallet that is already open
await client.unlockWallet(wallet.getId(), "wallet-password");

// Drop it from memory; storage is untouched
client.closeWallet(wallet.getId());

// Delete it from storage for good
await client.removeWallet(wallet.getId());
```

Sessions are fixed-duration: they auto-lock `autoLockMs` after unlock (15 min by
default) and are not extended by activity. Signing after expiry without a
password throws `WalletLockedError` with an HTTP-style status `403`, so a UI can
treat it like an expired token and re-prompt. A non-positive `autoLockMs`
switches the client to a password on every signature; it never means "no
timeout". See [Open vs unlocked](docs/DOMAINS.md#open-vs-unlocked).

`removeWallet` and `clearPersistence` are exclusive: while one of them runs, new
operations are refused with `OperationsSuspendedError` (`409`), and operations
already in flight are waited for before storage is touched. `clearPersistence`
also invalidates them first, so a wallet that was still being opened, created,
or imported is discarded and that call rejects with
`WalletOperationCancelledError`.

If loading a wallet succeeds but its setup fails (for example its reservations
cannot be restored), the wallet is taken out of the client again. A failed
`openWallet` can be retried as is. A failed create or import has already stored
the wallet, so repeating it throws `DuplicateWalletError`; open the stored wallet
with `openWallet(signerId, password)` instead.

### Export and Import a Wallet Keyfile

A wallet keyfile is the password-protected backup of a whole wallet: its secret
plus its account list, both encrypted.

```typescript
// Export (returns an object; serialize it however you like)
const keyfile = await client.exportWalletKeyfile(wallet.getId(), "wallet-password");

// Import: look before you write
const preview = await client.previewWalletKeyfileImport(keyfile, "wallet-password");

if (preview.existingSignerId) {
    // The secret is already stored - add only the accounts that are new
    const newIndexes = preview.accounts
        .filter((account) => account.status === "new")
        .map((account) => account.index!);

    await client.importKeyfileAccounts(keyfile, "wallet-password", {
        accountIndexes: newIndexes,
    });
} else {
    // Unknown secret - create the wallet
    await client.importWalletKeyfile(keyfile, "wallet-password");
}
```

`previewWalletKeyfileImport` writes nothing. It decrypts the keyfile, derives
every account it declares, and reports each one as `"new"` or
`"already-imported"`, so a UI can show what an import would actually do and let
the user choose. `source` accepts either the object or its JSON string.

A keyfile is matched to a stored wallet by its secret and, for HD wallets, its
root HD path, so accounts are never merged into a wallet that would derive other
keys. The decrypted account list is validated before anything is derived: at
most `MAX_KEYFILE_ACCOUNTS` (1000) accounts, non-blank names of at most
`MAX_KEYFILE_ACCOUNT_NAME_LENGTH` (128) characters, and HD indexes within the
BIP-32 range. The SDK does not apply these limits when an account is created or
renamed, so keep account names within them if the wallet is meant to be exported.

Note that `getExportedAccountData` is a different thing: a public, passwordless
descriptor of one account (name, address, index). It carries no key material and
cannot restore anything. See [keyfile export & import](docs/DOMAINS.md#keyfile-export--import).

### Subscribe to Events

`client.getEventBus()` returns a typed `on` / `off` source. Unlike the
constructor-time `eventDispatcher`, subscriptions can be added and removed at any
point in the client's life, and `on` hands back its own unsubscribe.

```typescript
import { ClientEvent } from "@asichain/asi-wallet-sdk";

const unsubscribe = client
    .getEventBus()
    .on(ClientEvent.WALLETS_CHANGED, (wallets) => {
        render(wallets);
    });

// later
unsubscribe();
```

Listeners are isolated: one that throws or rejects never breaks the emit loop or
the SDK operation behind it. Route those failures somewhere visible with the
`onListenerError` option on `Client.create`.

| Event | Payload | When |
| --- | --- | --- |
| `walletsChanged` | `Wallet[]` | a wallet was opened, closed, created, imported, or removed |
| `accountsChanged` | `walletId, Account[]` | accounts of an open wallet changed |
| `networksChanged` | `INetworksState` (`{ networks, selectedNetwork }`) | a network was added, updated, removed, or selected |
| `networkChanged` | `INetworkRecord` | deprecated, use `networksChanged` |
| `reservationsChanged` | `TReservationsByWallet` | a reservation was added, replaced, removed, confirmed, or expired |
| `networkBusyChanged` | `networkId, isBusy` | an operation started or finished on a network |
| `walletLocked` | `walletId` | a signing session ended (manual lock or auto-lock) |
| `walletFingerprintUpgraded` | `walletId` | a wallet stored by `v2.0.0` or earlier got its fingerprint upgraded on open; transitional, removed in the next major |

`client.getNetworksState()` returns the same `INetworksState` synchronously, so
a UI can render the network list once at start-up and then follow
`networksChanged`. Network writes are atomic: a failed storage write changes
nothing and emits nothing.

### Check Balance and Transfer

```typescript
// The SDK keeps no active account: every call names its target account
const [account] = hdWallet.getAccounts();

// Total and reservation-aware available balance
const balance = await client.getBalance(account.getAddress());
const available = await client.getAvailableBalance(
    hdWallet.getId(),
    account.getId(),
);
console.log("Balance:", client.toDisplayAmount(balance));

// Transfer tokens (amount in atomic units of the current network)
const reserved = await client.transfer(
    {
        walletId: hdWallet.getId(),
        accountId: account.getId(),
        to: recipientAddress,
        amount: client.toExactAtomicAmount("10"), // 10 ASI
    },
    "wallet-password",
);
console.log("Deploy id:", reserved.deployId);

// Follow the deploy until the node confirms it
const unsubscribe = reserved.subscribe({
    onStatus: (status) => console.log("Status:", status.status),
    onConfirmed: () => console.log("Confirmed"),
});
```

`transfer` and `deploy` store the reservation **before** they send the deploy,
and `deployId` is the deploy signature, known before the node answers. What
happens to the locked funds depends on how the submission ends:

- the node acknowledged the same deploy id, or answered HTTP `409`
  `duplicate_deploy`: the reservation is kept and the deploy is watched;
- `DeploySubmissionRejectedError`: the node refused the deploy, the reservation
  is released. A refusal the SDK recognizes by the node's error code is one of
  the typed `DeployRefusalError` subclasses (`DeployAdmissionRefusedError`,
  `DeployRefusedError`, `DeployQueueRefusedError`), which carry `deployId`,
  `retryable` and `retryAfterMs`; any other HTTP `4xx` stays a plain
  `DeploySubmissionRejectedError`. In both cases `reason` is the node's
  `message` when the response body carries one;
- `DeploySubmissionUnknownError` (`502`, code `API_REQUEST_FAILED`, extends
  `ApiRequestError`): the outcome is unknown (dropped connection, timeout, an
  unrecognized server error, or an acknowledgement without the expected deploy
  id). It carries `deployId`, and the reservation is kept until the deploy is
  confirmed, gets a verdict or the reservation expires;
- `DomainClosedError` (`410`): the wallet was closed before the deploy was sent,
  nothing reached the node and the reservation is released.

The SDK never resends a refused deploy on its own. When `retryable` is `true`,
the caller may try again after `retryAfterMs` (when the node sent one) with a
new `transfer` or `deploy`, which signs a new deploy.

While the deploy is watched, a `Rejected`, `Expired` or `Failed` verdict ends
the watch with `DeployVerdictError` (passed to `onVerdict`, then `onError`) and
releases the reservation. A watch timeout (`DeployTimeoutError`) keeps the
reservation until it expires, because the deploy may still land. Both
`DeploySubmissionRejectedError` and `DeploySubmissionUnknownError` extend
`ApiRequestError`, so existing `ApiRequestError` handling keeps working. See
[Client](docs/DOMAINS.md#client-srcdomainsclientindexts) and
[CustomError](docs/DOMAINS.md#customerror-srcdomainscustomerrorindexts).

A balance read that cannot be trusted now throws `BalanceUnavailableError`
(status `502`) carrying the address and a reason, instead of resolving to `0n`.
A node that is unreachable, a vault that reports an error, and an account with no
funds are three different outcomes, so handle the error rather than reading a
falsy balance as "empty".

Amounts are atomic `bigint` values in the precision of the current network.
`client.toExactAtomicAmount(string)` converts user input exactly: extra
fractional zeros are accepted, and a nonzero digit beyond the network's decimals
is rejected; `client.toDisplayAmount`
formats back. Both read the decimals of the network selected at the time of the
call. `client.toAtomicAmount` still works but is deprecated: it accepts numbers
and truncates excess digits.

A transfer reserves `amount` plus the transfer gas reserve of the current
network: `GasFee.MAX` on `SCALA`, the signed budget `phloLimit * phloPrice` on
`RUST`. Use `client.getTransferGasReserve()` for a "Max" button or a
confirmation total, so the UI shows exactly what the SDK will lock.

Without an explicit `phloPrice`, `transfer`, `deploy` and `signDeploy` sign the
minimum phlo price of the current network's node (`minPhloPrice` from the
validator's `GET /api/status`). The SDK reads it on the first operation after a
network is selected and keeps it until the network is switched; a failed read is
not kept and the operation falls back to `DEFAULT_PHLO_PRICE`. An explicit
`phloPrice` below that minimum is rejected before anything is signed or
reserved. `await client.getMinPhloPrice()` returns the minimum and reads it if
needed; `getTransferGasReserve()` is synchronous and uses the minimum already
read, so call `getMinPhloPrice()` first when a network has just been selected.
On TestNet the minimum is `100000000000`, so the default deploy budget and the
transfer gas reserve are `500000 * 10^11` atomic units (0.05 ASI).

See [Client](docs/DOMAINS.md) for the full API reference. For amount conversions, see [functions utilities](docs/UTILS.md#amount-conversion).

### Reserve Funds for a Deploy You Submit Yourself

`transfer` and `deploy` reserve funds on their own. When the deploy is submitted
outside the SDK — a hardware signer, a relayer, another app on the same vault —
the reservation can be created directly so the available balance and the pending
history stay correct.

```typescript
const request = {
    walletId: hdWallet.getId(),
    accountId: account.getId(),
    kind: "transfer" as const,
    deployId, // the deploy you submitted yourself
    to: recipientAddress,
    amount: client.toExactAtomicAmount("10"),
    gasCost: client.toExactAtomicAmount("0.1"),
    pendingAmount: client.toExactAtomicAmount("10.1"), // must cover amount + gasCost
};

const reservation = await client.addTransactionReservation(
    request,
    "wallet-password",
);

// Correct it while it is still pending, keeping the same reservation id
await client.updateTransactionReservation(reservation.id, {
    ...request,
    amount: client.toExactAtomicAmount("12"),
    pendingAmount: client.toExactAtomicAmount("12.1"),
});

// Or release the funds early
await client.removeTransactionReservation(hdWallet.getId(), reservation.id);
```

`pendingAmount` is the total to lock and must cover `amount + gasCost`; a
reservation that does not is rejected rather than under-locking the balance. The
whole available balance may be reserved. A reservation still expires on its own
after `RESERVATION_EXPIRATION_TIME` and is released when the deploy is confirmed,
so these calls are a correction channel, not a lifecycle to manage by hand.

Concurrent actions on the same account, deploy, or reservation are refused with
`ReservationActionInProgressError` (status `409`) rather than interleaved. See
[External reservations](docs/DOMAINS.md#external-reservations).

### Sign a Deploy Without Submitting It

When the submission is yours but the signature is not, `signDeploy` stops after
signing and hands back the signed envelope. Nothing is sent to the node and no
reservation is created, so pair it with `addTransactionReservation` to lock the
funds locally.

```typescript
const signed = await client.signDeploy(
    {
        walletId: hdWallet.getId(),
        accountId: account.getId(),
        term: rholangTerm,
        phloLimit: 500_000, // optional, defaults from config
        phloPrice: await client.getMinPhloPrice(), // optional, the node minimum is also the default; a number, decimal string, or bigint not below it
        shardId: "root", // optional, defaults to "root"
    },
    "wallet-password", // omit while a signing session is active
);

// { data, deployer, signature, sigAlgorithm } - submit it yourself
await submitToNode(signed);
```

`validAfterBlockNumber` and `timestamp` are filled in by the SDK from the current
chain head, so the call still needs the network. The payload is validated before
anything is signed: a blank term, a non-positive or unsafe `phloLimit`, a
`phloPrice` below 1 or above the bound of the profile (`Number.MAX_SAFE_INTEGER`
on `SCALA`, `2^256 - 1` on `RUST`), a `phloPrice` below the node minimum, a
`phloLimit * phloPrice` above `2^256 - 1`, or a blank `shardId` are rejected.

The signed bytes follow the node API profile of the current network: on `RUST`
the price is signed as a 32-byte uint256 field and `signed.data.phloPrice` is a
decimal string, on `SCALA` it is an int64 field and a number. Submit a signed
deploy to a node of the profile it was signed for, and do not switch networks
between signing and submitting. `client.deploy` accepts the same `phloPrice`
and `shardId` options.

---

## Architecture

### SDK Components

```
┌──────────────────────────────────────────────────────────────────┐
│                        Application                               │
└──────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     ASI Wallet SDK                                  │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    Client (facade)                            │  │
│  │  Wallet & account lifecycle • networks • balances • transfers │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                      Domains                                  │  │
│  │  • Wallet / Account    - Multi-account HD & PK wallets        │  │
│  │  • Signer (HD / PK)    - No-raw-export signing boundary       │  │
│  │  • SigningSession      - Fixed-window in-memory secret        │  │
│  │  • LifecycleGuard      - Invalidate + drain in-flight work    │  │
│  │  • Asset               - Token representation                 │  │
│  │  • ReservationAdapter  - Pending-transaction reservations     │  │
│  │  • ApiClientManager    - Per-network transport clients        │  │
│  │  • ApiServiceRegistry  - Service composition root             │  │
│  │  • Storage repositories- Signers / Accounts / Reservations    │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                  Services / Managers                          │  │
│  │  • WalletManager / AccountManager - In-memory ownership       │  │
│  │  • StorageManager      - Persistence orchestration            │  │
│  │  • ClientEventBus      - Typed client event subscriptions     │  │
│  │  • WalletOperationGuard- Duplicate & concurrency guards       │  │
│  │  • ReservationOperationGuard - Per-network reservation locks  │  │
│  │  • StorageBootstrap / StorageMigrationRunner (schema)         │  │
│  │  • ExportKeyfileService / ImportKeyfileService                │  │
│  │  • DeployService / BlockService / AccountDataService          │  │
│  │  • AssetsService / TransactionService / DeployStatusPoller    │  │
│  │  • CryptoService / KeysManager / KeyDerivation / Mnemonic     │  │
│  │  • KeyFingerprintService - Non-reversible key identity        │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    Storage backends                           │  │
│  │  • BrowserStorage (IndexedDB) • NodeStorage (node-persist)    │  │
│  │    selected automatically by environment                      │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    Utils / Config                             │  │
│  │  • codec / constants / validators / functions / polyfills     │  │
│  │  • decorators / guards / fabrics                              │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    ASI Chain Network                                │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │  Validator   │  │  Observer    │  │  Indexer     │               │
│  │    Node      │  │    Node      │  │  (GraphQL)   │               │
│  │  (Deploys)   │  │  (Queries)   │  │  (History)   │               │
│  └──────────────┘  └──────────────┘  └──────────────┘               │
└─────────────────────────────────────────────────────────────────────┘
```

### Cryptographic Flow

- **Key Generation**: secp256k1 elliptic curve keypairs via [KeysManager](docs/SERVICES.md)
- **Address Derivation**: keccak256 hash → blake2b checksum → Base58 encoding with [chain prefix](src/utils/constants)
- **Encryption**: PBKDF2 (100,000 iterations) → AES-GCM via [CryptoService](docs/SERVICES.md)
- **Mnemonic**: BIP-39 standard (12/24 words) via [MnemonicService](docs/SERVICES.md)
- **Derivation Path**: BIP-44 via [KeyDerivationService](docs/SERVICES.md)

---

## Project Structure

```
asi-chain-wallet-sdk/
├── src/                        # SDK source code
│   ├── config/                # Runtime defaults and constants
│   ├── domains/               # Domain models & transport (→ docs/DOMAINS.md)
│   ├── services/              # Managers & business logic (→ docs/SERVICES.md)
│   ├── fabrics/               # Factories: signer, storage, client, reservations (→ docs/UTILS.md)
│   ├── utils/                 # Utilities & guards (→ docs/UTILS.md)
│   └── index.ts              # Main export
│
├── playground/                # React demo app (→ docs/PLAYGROUND.md)
│   ├── src/
│   │   ├── sdk-react-kit/    # SDK ↔ React integration layer (hooks, context)
│   │   ├── components/       # UI components
│   │   ├── pages/            # Wallets, TxHistory, Networks, Deploy, DeployUtils, Reservations
│   │   └── router/           # Client-side routing
│   └── package.json
│
├── tests/
│   ├── unit/                  # node:test suites by area (wallet-flow, network-flow, reservation-flow, ...)
│   └── security/              # key and secret handling suites
│
├── scripts/security/          # test runners and the secret-log scan used by the gate
│
├── docs/                      # API reference
│   ├── DOMAINS.md            # Domain models & transport
│   ├── SERVICES.md           # Managers & services
│   ├── UTILS.md              # Utilities & config
│   └── PLAYGROUND.md         # Playground components
│
├── package.json              # SDK dependencies
├── tsconfig.build.json       # TypeScript config
└── README.md                 # This file
```

---

## Documentation

### SDK Reference

| Document                                 | Description                                                                                                                                        |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| [docs/DOMAINS.md](docs/DOMAINS.md)       | Domain models & transport (`Client`, `Wallet`, `Account`, `Signer`, `ReservationAdapter`, `ApiClientManager`, `NetworkSession`, `NodeApiAdapter`, storage repositories, and types) |
| [docs/SERVICES.md](docs/SERVICES.md)     | Managers & services (`WalletManager`, `AccountManager`, `StorageManager`, `DeployService`, `AssetsService`, `TransactionService`, `CryptoService`) |
| [docs/UTILS.md](docs/UTILS.md)           | Utilities & config (`codec`, `constants`, `validators`, `functions`, `guards`, `decorators`, `fabrics`, `polyfills`)                               |
| [docs/PLAYGROUND.md](docs/PLAYGROUND.md) | Playground components, the `sdk-react-kit` integration layer, and usage examples                                                                   |

### Related Resources

| Resource                | Link                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| ASI Chain Documentation | https://docs.asichain.io                                                                         |
| ASI Chain Node          | [github.com/asi-alliance/asi-chain](https://github.com/asi-alliance/asi-chain)                   |
| ASI Chain Wallet        | [github.com/asi-alliance/asi-chain-wallet](https://github.com/asi-alliance/asi-chain-wallet)     |
| ASI Chain Explorer      | [github.com/asi-alliance/asi-chain-explorer](https://github.com/asi-alliance/asi-chain-explorer) |
| ASI Chain Faucet        | [github.com/asi-alliance/asi-chain-faucet](https://github.com/asi-alliance/asi-chain-faucet)     |

---

## Security

| Document                                         | Description                                                                |
| ------------------------------------------------ | -------------------------------------------------------------------------- |
| [SECURITY.md](SECURITY.md)                       | Vulnerability reporting policy, disclosure process, and supported versions |
| [THREAT_MODEL.md](THREAT_MODEL.md)               | Threat assumptions, trust boundaries, adversary model, and mitigations     |
| [SECURITY_INVARIANTS.md](SECURITY_INVARIANTS.md) | Non-negotiable key/storage/signing/documentation security guarantees       |
| [CRYPTO_PROFILE.md](CRYPTO_PROFILE.md)           | Versioned crypto parameters, key-handling profile, and migration notes     |

---

## Development

### Prerequisites

Use Node.js 26 LTS and its bundled npm for SDK development and the Playground.
If you use nvm, run `nvm install` and `nvm use` from the repository root.
The CI gate and release build read the same version from [`.nvmrc`](.nvmrc).

### Setup

```bash
# Install SDK dependencies
npm ci

# Build the SDK
npm run build

# Watch mode for development
npm run dev

# Run the release gate locally: build, unit tests, security tests,
# secret-log scan, and a production-dependency audit
npm run gate
```

The gate was `npm run security:gate` and covered security checks only; it now
also runs `npm run test:unit`, so the same command CI runs is the one that has to
pass locally. The GitHub workflow is `.github/workflows/gate.yml`.

### Testing

Tests use the built-in `node:test` runner through `tsx`, so the TypeScript path
aliases (`@domains/...`, `@services/...`) work without a build.

```bash
npm run test:unit      # every *.test.ts under tests/unit
npm run test:security  # every *.test.ts under tests/security
```

Running only some files or some tests:

```bash
npx tsx --test --test-concurrency=1 --test-timeout=60000 tests/unit/wallet-flow/wallet-keyfile.test.ts
npx tsx --test --test-concurrency=1 --test-timeout=60000 --test-name-pattern="legacy" tests/unit/wallet-flow/wallet-keyfile.test.ts
```

- `--test-concurrency=1` is required. Test files share the storage singletons and
  write into `.tmp/<suite>`, so files running in parallel interfere.
- `--test-timeout` is recommended for manual runs. A test that fails before it
  closes its `Client` can keep the process alive (open pollers and timers).
- `npm run test:unit` removes `.tmp/` and `.persist-test/` before and after the
  run; `npm run test:security` and a direct `npx tsx` run do not, so delete them
  yourself between runs.

Where tests go:

- `tests/unit/<area>/` for behavior: `wallet-flow`, `network-flow`,
  `reservation-flow`, `deploy-flow`, `storage`, `transactions-history`. Add a
  case to an existing file of the area (or a row to an existing table-driven
  test) before creating a new file.
- `tests/security/` only for key and secret handling: key derivation and
  management, the signing session, `SecretsProvider`, keyfile crypto.
- Flows that talk to a node use the local fake node in
  `tests/unit/reservation-flow/fakeNode.ts`. It can accept, refuse (`4xx`),
  fail (`5xx`), or drop a submission, and `holdSubmitResponse()` pauses one so a
  test can act while the deploy is in flight.

### Backward Compatibility

When a public API has to change before the next major release, keep the old
behavior working:

- **Replaced API** — mark the old member with a JSDoc `@deprecated` tag that
  names the replacement, and keep it fully functional until the next major. Example:
  `ClientEvent.NETWORK_CHANGED` and `onNetworkChanged` are deprecated in favour of
  `NETWORKS_CHANGED` / `onNetworksChanged`, and are still emitted.
- **Lenient behavior** — when a method should reject input but cannot yet
  without breaking callers, keep it lenient and mark the place with
  `TODO(next-major)` (see below).

### `TODO(next-major)` Markers

New code is written without comments: names, types, and structure carry the
meaning. There are two exceptions, JSDoc `@deprecated` tags and
`TODO(next-major)` markers. (A few older comments remain, such as the
`TODO(Issue #173)` block in `Client` that keeps a disabled method until its
ticket is resolved; they are not a pattern for new code.) A `TODO(next-major)`
marker records a change that belongs to the next major release and cannot ship
earlier without breaking someone:

```ts
// TODO(next-major): Validate the security config in Client.create and
// throw on a non-positive autoLockMs instead of mapping it to every-signature.
```

Rules:

- Write the marker at the exact place that has to change, and describe the
  target behavior, not the history: what the major release must do.
- Use `TODO(next-major, Issue #N)` when a ticket already exists.
- Mark every piece of a change that has to go together, and name the anchor:
  `// TODO(next-major): Remove together with LegacyFingerprintService.`
- Tests that pin the lenient behavior are part of the change; they are
  rewritten in the same major ticket.
- `@deprecated` is for an old API kept next to its replacement;
  `TODO(next-major)` is for behavior inside an API that stays.

Open marker groups as of 2.1.0:

| Group | Where | Major release change |
| --- | --- | --- |
| Legacy HD fingerprints | `LegacyFingerprintService`, `KeyFingerprintService.fromMnemonic`, `WalletUniquenessService`, `WalletManager.persist`, `Wallet.restore`, `Client.openWallet`, `ClientEvent.WALLET_FINGERPRINT_UPGRADED`, `onWalletFingerprintUpgraded` | remove the legacy lookup, the upgrade on open, and the transitional event |
| Non-positive `autoLockMs` | `Client` constructor, `SigningSession.hold` | validate the policy and throw instead of silently disabling the session; both must change together |

### Before a Major Release

Minor and patch releases keep the public API backward compatible, so some
behavior that should become a hard error is kept lenient until the next major
release. Every such place is marked in the source with `TODO(next-major)`.

Before cutting a major release:

1. List all markers: `grep -rn "TODO(next-major)" src`.
2. Open a ticket for each marker and implement the breaking change it
   describes before the release.
3. Remove the marker once its ticket is done, and list the change in the
   release notes as breaking.
4. Remove the members marked `@deprecated` and list those removals as breaking
   too.

### Playground

The [playground](playground) provides a React-based demo application for testing SDK functionality.
It depends on the SDK as `"asi-wallet-sdk": "file:.."`, which resolves to the
built `dist/` of this repository, so build the SDK first and rebuild it after
every SDK change:

```bash
npm run build

cd playground
npm install

# Create .env file with per-network endpoints, e.g.:
# VITE_DEFAULT_NETWORK=DevNet
# VITE_DEVNET_VALIDATOR_URL=...
# VITE_DEVNET_READONLY_URL=...
# VITE_DEVNET_INDEXER_URL=...
# VITE_DEVNET_NODE_API_PROFILE=scala
# VITE_DEV_NODE_API_PROFILE=rust
# VITE_DEV_NATIVE_TOKEN_DECIMALS=18   # optional per network, defaults to 8

npm run dev
```

Playground available at `http://localhost:3000`. Browser storage is per origin,
so wallets created in the playground survive an SDK rebuild as long as it runs on
the same address. See [docs/PLAYGROUND.md](docs/PLAYGROUND.md) for component details.

### Dependencies

**SDK** ([package.json](package.json)):

| Package                                                          | Version | Purpose                                   |
| ---------------------------------------------------------------- | ------- | ----------------------------------------- |
| [axios](https://github.com/axios/axios)                          | 1.13.2  | HTTP client for node communication        |
| [bip32](https://github.com/bitcoinjs/bip32)                      | 4.0.0   | BIP-32 hierarchical deterministic wallets |
| [bip39](https://github.com/bitcoinjs/bip39)                      | 3.1.0   | BIP-39 mnemonic generation                |
| [blakejs](https://github.com/dcposch/blakejs)                    | 1.2.1   | BLAKE2b hashing for addresses             |
| [bs58](https://github.com/cryptocoinjs/bs58)                     | 6.0.0   | Base58 encoding                           |
| [@noble/hashes](https://github.com/paulmillr/noble-hashes)       | 1.6.0   | Cryptographic hash helpers                |
| [@noble/secp256k1](https://github.com/paulmillr/noble-secp256k1) | 1.7.0   | secp256k1 key generation and signing      |
| [js-sha3](https://github.com/nicknisi/js-sha3)                   | 0.9.3   | keccak256 hashing                         |
| [node-persist](https://github.com/simonlast/node-persist)        | 4.0.4   | Node.js storage backend                   |
| [buffer](https://github.com/feross/buffer)                       | 6.0.3   | Browser Buffer compatibility              |

**Playground** ([playground/package.json](playground/package.json)):

| Package                    | Version | Purpose                   |
| -------------------------- | ------- | ------------------------- |
| [react](https://react.dev) | 18.2.0  | UI framework              |
| [vite](https://vite.dev)   | 7.2.6   | Build tool and dev server |

---

## License

This project is licensed under the Apache 2.0 License. See [LICENSE](LICENSE) file for details.

---

ASI Alliance founding members: Fetch.ai, SingularityNET, and CUDOS

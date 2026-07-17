# Playground Reference

This document summarizes the example React playground in `playground/src`. The
playground consumes the SDK through a small integration layer (`sdk-react-kit`)
and is split into routed pages (Wallets, Transaction History).

The SDK is imported as `asi-wallet-sdk` (a `file:..` dependency in the
playground's `package.json`). Network endpoints come from Vite env vars (`.env`).

---

## Entry (`playground/src/index.tsx`)

Mounts `Application` into `#root` inside a `BrowserRouter` via
`react-dom/client`'s `createRoot`, and imports the global theme
(`theme/commonStyles.css`).

---

## sdk-react-kit (`playground/src/sdk-react-kit`)

The bridge between the SDK `Client` and React. This is the recommended place to
look when integrating the SDK into your own app.

### useSdk (`hooks/useSdk.ts`)

The core hook. Creates a `Client` on mount (via `helpers.init`), wires an
`IClientEventDispatcher` into React state, and exposes a flat, memoized API. It
tears the client down on unmount.

Returned value (`UseSdkValue`):

- State: `client`, `isReady`, `walletsMetadata: IWalletMetadata[]`,
  `unlockedWallets: Wallet[]`, `reservationsByWallet`, `networks`,
  `networkRecords: IPlaygroundNetwork[]`, `currentNetwork`.
- Network: `setNetwork(name)`, `addNetwork(name, config)`,
  `updateNetwork(name, partialConfig)`, `removeNetwork(name)`. `networkRecords`
  pairs each `NetworkName` with its `INetworkConfig` and `isDefault` flag
  (`IPlaygroundNetwork = { name, config, isDefault }`) — built from
  `getNetworksNames()` + `getNetwork(name)` and refreshed after every CRUD call.
  `updateNetwork`/`removeNetwork` also re-sync `currentNetwork`, since the SDK
  switches the active network internally without emitting `onNetworkChanged`.
- Key generation: `generateMnemonic(strength?)`, `generatePrivateKey()`.
- Wallet lifecycle: `createHDWallet(input, password)`,
  `createPrivateKeyWallet(input, password)`, `unlockWallet(signerId, password)`,
  `removeWallet(walletId)`.
- Account lifecycle: `deriveAccount(walletId, name, password)`,
  `renameAccount(walletId, accountId, name)`, `removeAccount(walletId, accountId)`,
  `setActiveAccount(walletId, accountId)`.
- Transfers & balances: `transfer(request, password)`, `getBalance(address)`,
  `getAvailableBalance(walletId, accountId)`, `getReservations(walletId)`.
- Amounts: `toDisplayAmount(atomic)`, `toAtomicAmount(value)`.
- Persistence: `clearPersistence()`.

Input types: `ICreateHDWalletInput = { name, mnemonic }`,
`ICreatePkWalletInput = { name, privateKey }`.

### SdkContext (`SdkContext.ts`)

React context holding the `useSdk` value.

```ts
SdkContext                    // Context<UseSdkValue>
useSdkContext(): SdkContextValue
```

`Application` calls `useSdk()` once and provides the result through
`SdkContext.Provider`; all pages/components read it via `useSdkContext()`.

### useWalletBalance (`hooks/useWalletBalance.ts`)

Loads total balance, available balance, and reservation count for one account.

```ts
useWalletBalance(sdk: UseSdkValue, walletId, accountId, address): UseWalletBalanceValue
// { balance: { total, available, reservationCount }, isFetching, reload }
```

### helpers.ts

```ts
init(eventDispatcher: IClientEventDispatcher): Promise<Client>
```

Calls `Client.create({ networksConfig: NETWORKS_CONFIG, defaultNetwork, eventDispatcher })`.

### networksConfig.ts

Builds `NETWORKS_CONFIG: TNetworksConfig` from `import.meta.env` (`DevNet`, `Dev`,
plus empty `MainNet`/`TestNet` placeholders) and exposes `DEFAULT_NETWORK`
(default `"DevNet"`).

### formatters (`formatters/index.ts`)

```ts
formatAddress(address: string): string   // 10-char prefix … 8-char suffix
formatAmount(amount: bigint | null | undefined): string // "N/A" or fromAtomicAmount(...)
formatDate(date: Date): string
```

---

## Application (`playground/src/components/Application/index.tsx`)

Root component. Instantiates `useLoader` and `useSdk`, provides
`ApplicationContext` (modal state + loader) and `SdkContext`, and renders the
`Header`, the persistent page routes, the `ModalManager`, and the fullscreen
loader.

- `context.ts` — `ApplicationContext` with `{ modalState, setModalState, withLoader }`
  and the `useAppContext()` hook.
- `meta.tsx` — the `Modals` enum and the `ModalProps` union.
- `ModalManager.tsx` — maps `Modals` to `PasswordModal`, `TransferModal`,
  `CreateWalletModal`, `DeriveWalletModal`, `TransferCompletedModal`,
  `NetworkModal`.
- `Header/` — brand, `ApplicationNavigation`, and a "CLEAR SDK LS" button that
  calls `sdk.clearPersistence()` and reloads.

---

## Routing (`playground/src/router`)

- `paths.ts` — `PATHS` (`/wallets`, `/tx-history`, `/networks`, default `/wallets`).
- `routes.ts` — `PAGE_ROUTES` mapping each path to a label and page component.
- `index.tsx` — `ApplicationNavigation` (NavLinks) and `PersistentPageRoutes`,
  which keep every page mounted and toggle visibility with `hidden` so page state
  survives navigation. Unknown paths redirect to the default page.

---

## Pages

### WalletsPage (`pages/WalletsPage/index.tsx`)

Two columns — Private Key wallets and Mnemonic (HD) wallets — rendered from
`sdk.walletsMetadata`. Locked wallets show an "Unlock" button; unlocked wallets
render their accounts as `AccountCard`s and (for HD) a "Derive" action. HD create/
import offers a 12/24-word choice.

`helpers.ts` builds `WalletPageHandlers`: `createPk`, `importPk`, `createHd`,
`importHd`, `unlockWallet`, `deriveAccount`, `removeWallet`, `renameAccount`,
`removeAccount`. These open the relevant modals and call the matching `useSdk`
methods through `withLoader`.

### TxHistoryPage (`pages/TxHistoryPage/index.tsx`)

Lets the user pick an unlocked account (via `SelectFilter`) and lists its
transactions using `account.getTransactionsHistory()`. Reloads on account or
network change.

- `TxList/index.tsx` — renders the transactions table (or empty/N-A states).
- `TxList/TxListItem/index.tsx` — one row; formats address/date, truncates the
  deploy id and block hash, and offers a copy-deploy-id button.

### NetworksPage (`pages/NetworksPage/index.tsx`)

Manages the SDK network list (custom-networks flow). Renders `sdk.networkRecords`
as cards showing the network name, a `default`/`custom` badge, an `active` badge
for `sdk.currentNetwork`, and the Validator/Read-only/Indexer URLs. Actions per
card: **Switch** (disabled for the active network), and — only for `custom`
(`!isDefault`) networks — **Edit** and **Remove**. A header **Add network** button
opens the create form. Default networks cannot be edited or removed (the SDK
`@EnsureNetworkNotDefault` decorator throws; such errors surface via `alert`).

`helpers.ts` builds `NetworksPageHandlers`: `addNetwork`, `editNetwork`,
`removeNetwork`, `switchNetwork`. They open `NetworkModal` (add/edit) or confirm
removal and call the matching `useSdk` methods through `withLoader`.

---

## Components

### AccountCard (`components/AccountCard/index.tsx`)

Represents one SDK `Account`. Shows name, address, available balance (via
`useWalletBalance`), and a `ReservationStatus`. Actions: Send (opens
`TransferModal` → `PasswordModal` → `sdk.transfer`, then shows
`TransferCompletedModal`), Reload balance, Rename, and Copy address.

```ts
interface IAccountCardProps {
    sdk: UseSdkValue;
    walletId: string;
    account: Account;
    onRename: () => void;
    onRemove: () => void;
}
```

### NetworkSelector (`components/NetworkSelector/index.tsx`)

Renders a button per `sdk.networks`; switching calls `sdk.setNetwork(name)`. The
active network is disabled. (`sdk.networks` comes from `getNetworksNames()`, which
returns the live `Map` keys — including any custom networks added at runtime.)

### NetworkModal (`components/NetworkModal/index.tsx`)

Add or edit a network. Collects `name` (read-only in `edit` mode, since the name
is the record key and is not renamed by the SDK) and the Validator/Read-only/
Indexer URLs. Only `name` is required locally; empty URLs are allowed (matching
the placeholder default networks). On submit it emits an `INetworkModalPayload`.

```ts
interface INetworkModalPayload { name: NetworkName; config: INetworkConfig }

interface INetworkModalProps {
    mode: "add" | "edit";
    title?: string;
    initialName?: string;
    initialConfig?: INetworkConfig;
    onSubmit: (payload: INetworkModalPayload) => void;
    onClose?: () => void;
}
```

### ReservationStatus (`components/ReservationStatus/index.tsx`)

Displays total/available balances and, when reservations exist, the reserved
amount and active-transfer count.

```ts
interface IReservationStatusProps { balance: WalletBalance; isFetching?: boolean }
```

### TransferModal (`components/TransferModal/index.tsx`)

Collects recipient and amount, validating the amount against `availableBalance`
(parsed with `toAtomicAmount` / `NATIVE_TOKEN_DECIMALS_AMOUNT`). Confirms with an
atomic `bigint`.

```ts
interface ITransferModalProps {
    fromAddress: string;
    availableBalance: bigint;
    onConfirm: (toAddress: string, amount: bigint) => void;
    onClose: () => void;
}
```

### TransferCompletedModal (`components/TransferCompletedModal/index.tsx`)

Shows the completed transfer (from/to, human amount via `formatAmount`, deploy id)
and a copy-deploy-id button.

```ts
interface ITransferCompletedModalProps {
    fromAddress: string;
    toAddress: string;
    amount: bigint;
    deployId: string;
    onClose: () => void;
}
```

### CreateWalletModal (`components/CreateWalletModal/index.tsx`)

Create or import a wallet by private key or mnemonic. Validates matching
passwords and required fields; for private keys it parses a JSON byte array; for
mnemonics it opens a nested `InputsForm`.

```ts
type TWalletCreatePayload =
    | { mode: "privateKey"; name: string; privateKey: Uint8Array; password: string }
    | { mode: "mnemonic";   name: string; mnemonic: string;       password: string };

interface IWalletCreateModalProps {
    variant?: 12 | 24;
    mode: "privateKey" | "mnemonic";
    isInputMode?: boolean;
    title?: string;
    onSubmit: (payload: TWalletCreatePayload) => void;
    onClose?: () => void;
    initialMnemonic?: string;
    initialPrivateKey?: Uint8Array;
}
```

### DeriveWalletModal (`components/DeriveWalletModal/index.tsx`)

Collects a name + password to derive a new HD account.

```ts
interface IDeriveWalletModalProps {
    onSubmit: (name: string, password: string) => void;
    onClose?: () => void;
}
```

### PasswordModal (`components/PasswordModal/index.tsx`)

```ts
interface IPasswordModalProps {
    title: string;
    onSubmit: (password: string) => void;
    onClose?: () => void;
}
```

### SelectModal (`components/SelectModal/index.tsx`)

Simple option list.

```ts
interface ISelectModalProps {
    title: string;
    options: { title: string; onClick(): void; disabled?: boolean }[];
    onClose?: () => void;
}
```

### Mnemonic input components

- **InputsForm** (`components/InputsForm/index.tsx`) — grid of word inputs with
  paste-to-fill, sanitization, per-word errors, and validation. Props:
  `variant: 12 | 24`, `formMode: "input" | "output"`, `initialMnemonic: string[]`,
  `validateWords?`, `onValidSubmit?`, `onClose`.
- **InputsGrid** (`components/InputsGrid/index.tsx`) — lays out `Input` components;
  in `output` mode change/paste handlers are omitted (read-only).
- **Input** (`components/Input/index.tsx`) — one controlled word input; prevents
  Enter default and supports multi-word paste.
- **InputsFormActionsButtons** (`components/InputsFormActionsButtons/index.tsx`) —
  renders an array of `{ type, className, onClick?, label }` buttons.

### FullScreenLoader (`components/FullScreenLoader/index.tsx`)

Fullscreen spinner shown while `useLoader` reports loading.

### Common components (`components/common`)

- **HighlightedRows** — labeled value rows with optional accent/description.
- **KeyValueTable** — two-column table with an optional per-row state class.
- **SelectFilter** — labeled `<select>` from `{ label, value }[]` options.

---

## Hooks & utils

- **useLoader** (`hooks/useLoader.ts`) — `{ isLoading, setIsLoading, withLoader }`;
  `withLoader` toggles the loader and defers the wrapped work to the next tick.
- **utils/constants** — mnemonic word-count constants (`MIN_WORDS_COUNT` 12,
  `MAX_WORDS_COUNT` 24, `WordsCountVariants`, `DEFAULT_WORDS_COUNT`).
- **utils/functions** — `sanitizeWord(raw)` and `clippedWordCount(value)` for
  mnemonic inputs.
- **utils/misc** — `copyTextToClipboard(text)`.
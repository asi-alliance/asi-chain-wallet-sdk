# Playground Reference

This document summarizes the example React playground in `playground/src`. The
playground consumes the SDK through a small integration layer (`sdk-react-kit`)
and is split into routed pages (Wallets, Transaction History, Networks, Deploy).

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

The core hook. Creates a `Client` on mount (via `helpers.init`), subscribes to
the client event bus, mirrors those events into React state, and exposes a flat,
memoized API. It tears the client down on unmount (`await client.close()`).

Two effects, deliberately separate: one owns the client's life, the other owns
the subscriptions. The second runs once `client` is set, collects the
`TUnsubscribe` returned by each `eventBus.on(...)` into an array, and calls them
all on cleanup — the pattern the SDK's post-creation subscription model is meant
for, and the reason the hook does not need a constructor-time dispatcher.

```ts
const eventBus = client.getEventBus();

const unsubscribes: TUnsubscribe[] = [
    eventBus.on(ClientEvent.WALLETS_CHANGED, () => void refresh()),
    eventBus.on(ClientEvent.ACCOUNTS_CHANGED, () => void refresh()),
    eventBus.on(ClientEvent.NETWORK_CHANGED, setCurrentNetwork),
    eventBus.on(ClientEvent.RESERVATIONS_CHANGED, setReservationsByWallet),
    eventBus.on(ClientEvent.NETWORK_BUSY_CHANGED, updateBusyNetworkIds),
];
```

Returned value (`UseSdkValue`):

- State: `client`, `isReady`, `walletsMetadata: IWalletMetadata[]`,
  `openWallets: Wallet[]`, `reservationsByWallet`,
  `networkRecords: INetworkRecord[]`, `currentNetwork: INetworkRecord | null`.
- Network: `setNetwork(id)`, `addNetwork(name, config): INetworkRecord`,
  `updateNetwork(id, update)`, `removeNetwork(id)`. Networks are identified by a
  stable `id` (`INetworkRecord = { id, name, config, isDefault }`); `name` is
  editable data, not the key. `networkRecords` comes straight from
  `client.getNetworks()` and is refreshed after every CRUD call.
  `updateNetwork`/`removeNetwork` also re-sync `currentNetwork` from
  `getCurrentNetwork()`, since the SDK switches the active network internally
  without emitting `NETWORK_CHANGED`. The `NETWORK_CHANGED` event itself delivers
  the full active-network record.
- Key generation: `generateMnemonic(strength?)`, `generatePrivateKey()`.
- Wallet lifecycle: `createHDWallet(input, password)`,
  `createPrivateKeyWallet(input, password)`, `openWallet(signerId, password)`,
  `closeWallet(walletId)`, `closeAllWallets()`, `removeWallet(walletId)`.
  `openWallet` loads a stored wallet into memory, `closeWallet` drops it again
  without touching storage, and only `removeWallet` deletes it. `openWallets`
  holds whatever is currently in memory.
- Signing sessions: `isWalletUnlocked(walletId)` — used by `useSecureAction` to
  decide whether a password prompt is needed (see below). `openWallet` starts the
  session as a side effect of opening; the SDK auto-locks it after the policy's
  timeout (`SDK_CLIENT_SESSION_AUTO_LOCK_MS`).
- Account lifecycle: `deriveAccount(walletId, name, password)`,
  `renameAccount(walletId, accountId, name)`, `removeAccount(walletId, accountId)`,
  `setActiveAccount(walletId, accountId)`.
- Transfers & balances: `transfer(request, password?)` (password omitted while a
  session is active), `getBalance(address)`,
  `getAvailableBalance(walletId, accountId)`, `getReservations(walletId)`.
- Deploys: `deploy(request, password?)` (arbitrary Rholang term via
  `IDeployRequest = { walletId, accountId, term, phloLimit? }`, same session
  rules as `transfer`), `exploreDeploy(rholang)` (read-only, no unlock/password),
  `watchDeploy(deployId, callbacks?, options?)` (deploy status polling).
  `transfer` and `deploy` both resolve to an `IReservedOperationResult`
  (`{ deployId, subscribe }`), so the caller follows the deploy through
  `subscribe` instead of a separate watch handle.
- Export: `getExportedAccountData(walletId, accountId)` — the encrypted account
  keyfile JSON (downloaded from `AccountCard`).
- Network busy & reservations: `isNetworkBusy(networkId)`,
  `isCurrentNetworkBusy`, `hasNetworkReservations(networkId)`. The first two read
  a local `busyNetworkIds` list kept in sync by the `NETWORK_BUSY_CHANGED` event
  rather than polling the SDK, so rendering stays synchronous;
  `hasNetworkReservations` delegates straight to the client and answers whether
  funds are still locked on a network before it is removed.
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
useWalletBalance(sdk: UseSdkValue, walletId, accountId, address, options?): UseWalletBalanceValue
// { balance: { total, available, reservationCount }, isFetching, reload }
// options: { reloadIntervalMs?: number }, default 30000
```

The hook reloads on mount, on every `reloadIntervalMs` tick, and whenever the
current network changes. It reads the SDK through the stable `getBalance`,
`getAvailableBalance`, and `getReservations` callbacks instead of the whole
`sdk` object, so a re-render of `Application` no longer restarts the polling.

### useRelevantResultGuard (`hooks/useRelevantResultGuard.ts`)

The SDK keeps no balances or history of its own: every read returns whatever the
network answered at the moment of the call, so deciding that an in-flight answer
became irrelevant is the caller's job.

```ts
useRelevantResultGuard(networkId?: NetworkId): TStartRequest
// TStartRequest      = () => TIsResultRelevant
// TIsResultRelevant  = () => boolean
```

`startRequest()` is called before the request and returns a check that stays
`true` only while this request is the latest one from the same component and the
current network is still the one the request was issued on. Callers await the
read, then skip the state update when the check returns `false`. Used by
`useWalletBalance`, `TxHistoryPage`, and `DeployPage` so that a response of the
previous network is never rendered as the new network's data.

### helpers.ts

```ts
init(): Promise<Client>
```

Calls `Client.create({ networksConfig: NETWORKS_CONFIG, defaultNetwork, onListenerError, security })`.

No `eventDispatcher` is passed: `useSdk` subscribes to the event bus after the
client exists, which is why `init` takes no arguments any more. `onListenerError`
logs a failing listener to the console so a broken subscriber is visible instead
of silently swallowed, and `security.autoLockMs` comes from
`SDK_CLIENT_SESSION_AUTO_LOCK_MS`.

### networksConfig.ts

Builds `NETWORKS_CONFIG: TNetworksConfig` from `import.meta.env` (`DevNet`, `Dev`,
plus empty `MainNet`/`TestNet` placeholders) and exposes `DEFAULT_NETWORK`
(default `"DevNet"`).

`nodeApiProfile` is read from env per network rather than hardcoded, the same way
`DEFAULT_NETWORK` already was:

```ts
nodeApiProfile: env.VITE_DEVNET_NODE_API_PROFILE as NodeApiProfile,
```

Env keys: `VITE_DEVNET_NODE_API_PROFILE=scala`, `VITE_DEV_NODE_API_PROFILE=rust`,
`VITE_MAINNET_NODE_API_PROFILE`, `VITE_TESTNET_NODE_API_PROFILE`. New keys must
also be declared in `playground/src/vite-env.d.ts`. There is no fallback on
purpose — a missing key makes `Client.create` throw
`Invalid nodeApiProfile: Node API profile is required` at startup instead of
quietly assuming a profile.

`DevNet` runs the legacy Scala node, `Dev` the new Rust node. `AlexanderNet` exists
only in the repository-root `.env` (`VITE_NETWORKS`) so far, not in the playground.

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
`sdk.walletsMetadata`. Closed wallets show an "Open" button; open wallets render
their accounts as `AccountCard`s, a "Close" action, and (for HD) a "Derive"
action. HD create/import offers a 12/24-word choice.

The page matches metadata to open wallets through a
`Map<signerId, Wallet>` built from `sdk.openWallets`, because
`walletsMetadata` is keyed by `signerId` while the in-memory wallets are keyed by
`walletId`.

`helpers.ts` builds `WalletPageHandlers`: `createPk`, `importPk`, `createHd`,
`importHd`, `openWallet`, `closeWallet`, `deriveAccount`, `removeWallet`,
`renameAccount`, `removeAccount`. These open the relevant modals and call the
matching `useSdk` methods through `withLoader`.

### TxHistoryPage (`pages/TxHistoryPage/index.tsx`)

Lets the user pick an unlocked account (via `SelectFilter`) and lists its
transactions using `client.getTransactionsHistory(walletId, accountId, options)`
— pending reservations merged with the indexed history.

- A second `SelectFilter` picks the source: **All** (default, `sources`
  omitted), **Pending only** (`["pending"]`), **Executed only** (`["executed"]`).
- Pages hold `PAGE_SIZE` 10 rows and the current page lives in the `?page=`
  query param, so a page survives a reload and is shareable. Changing the
  account or the mode resets it (`replace: true`, no history entry). "Next" is
  offered while the page came back full — the SDK returns no total count.
- Reloads on account, mode, page, network change, and on this wallet's entry in
  `reservationsByWallet`, so a fresh transfer shows up as pending without a
  manual refresh.
- Because the poller and the indexer advance independently, a just confirmed
  transaction can flicker — see the eventual-consistency note in
  [SERVICES.md](SERVICES.md).
- `TxList/index.tsx` — renders the transactions table (or empty/N-A states).
- `TxList/TxListItem/index.tsx` — one row; formats address/date, truncates the
  deploy id and block hash, and offers a copy-deploy-id button.

### NetworksPage (`pages/NetworksPage/index.tsx`)

Manages the SDK network list (custom-networks flow). Renders `sdk.networkRecords`
as cards showing the network name, a `default`/`custom` badge, an `active` badge
when the card id equals `sdk.currentNetwork?.id`, the Validator/Read-only/Indexer
URLs, and a **Node API** row with the raw `config.nodeApiProfile` value (`scala` /
`rust`). Actions per card: **Switch** (disabled for the active network), and
— only for `custom` (`!isDefault`) networks — **Edit** and **Remove**. A header
**Add network** button opens the create form. Everything is keyed by the stable
`network.id`; the editable `name` is just data. Default networks cannot be edited
or removed (the SDK `@EnsureNetworkNotDefault` decorator throws; such errors
surface via `alert`).

`helpers.ts` builds `NetworksPageHandlers`: `addNetwork`, `editNetwork(record)`,
`removeNetwork(record)`, `switchNetwork(id)`. They open `NetworkModal` (add/edit)
or confirm removal and call the matching `useSdk` methods through `withLoader`
(`updateNetwork(id, { name, config })`).

### DeployPage (`pages/DeployPage/index.tsx`)

Runs arbitrary Rholang against the current network (restores the `Deploy` /
`DeployLiteModeWidget` flow from the web wallet). Lets the user pick an unlocked
account (`SelectFilter`), edit the Rholang term in a textarea (seeded with an
example contract), and set a phlo limit. **Deploy** runs
`sdk.deploy({ walletId, accountId, term, phloLimit }, password?)` through
`useSecureAction` (a confirm when the wallet session is active, otherwise a
`PasswordModal`), then tracks status through the returned
`IReservedOperationResult`: `reserved.subscribe({ onStatus, onConfirmed, onError })`
(the unsubscribe is called on unmount and before each new run). **Explore** calls
`sdk.exploreDeploy(code)` and needs no unlock/password. Errors and the
explore/deploy result are shown inline.

---

## Components

### AccountCard (`components/AccountCard/index.tsx`)

Represents one SDK `Account`. Shows name, address, available balance (via
`useWalletBalance`), and a `ReservationStatus`. Actions: Send (opens
`TransferModal`, then runs `sdk.transfer` through `useSecureAction` — a confirm
when a session is active, otherwise a `PasswordModal` — and shows
`TransferCompletedModal`), Reload balance, Rename, Copy address, and Export
(downloads the encrypted keyfile from `sdk.getExportedAccountData`).

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

Renders a button per `sdk.networkRecords` (shows `name`, keyed by `id`); switching
calls `sdk.setNetwork(id)`. The active network (`id === currentNetwork?.id`) is
disabled.

### NetworkModal (`components/NetworkModal/index.tsx`)

Add or edit a network. Collects `name` (editable in both modes), the node API
profile, and the Validator/Read-only/Indexer URLs. Only `name` is required
locally; empty URLs are allowed (matching the placeholder default networks). On
submit it emits an `INetworkModalPayload`; the page maps that to
`addNetwork(name, config)` or `updateNetwork(id, { name, config })`.

The profile is a `<select>` populated from `NODE_API_PROFILE_DESCRIPTORS`, with
options labelled `"<label> (<stability>)"` — e.g. `Rust node (experimental)`. It
defaults to `initialConfig?.nodeApiProfile ?? DEFAULT_NODE_API_PROFILE`, so
editing preselects the network's current profile and adding preselects `scala`.
This is the one place a default profile is applied, and it belongs here: the UI
offers a starting value, the SDK never guesses one.

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
- **Pagination** — `{ page, hasNextPage, onChange }` pager for sources with no
  known total: it renders a trailing window of up to five page numbers ending at
  `page + 1` when a next page is assumed, plus prev/next arrows.

---

## Hooks & utils

- **useSecureAction** (`hooks/useSecureAction.ts`) — the single gate for
  signing operations (transfer and deploy). It encapsulates the
  "try-with-session → prompt-on-lock" pattern:

  ```ts
  const runSecureAction = useSecureAction();
  runSecureAction({ walletId, passwordTitle, confirmMessage, action }): Promise<T | undefined>
  ```

  - When `isWalletUnlocked(walletId)` is `true`, it first shows a
    `window.confirm(confirmMessage)` (guards against an accidental click), then
    calls `action()` without a password. If the SDK throws `WalletLockedError`
    (session expired between the check and the call), it falls through to the
    password prompt.
  - Otherwise (or after a lock error) it opens `PasswordModal` and calls
    `action(password)`; entering the password is itself the confirmation, so no
    extra `confirm` is shown. A cancelled prompt returns `undefined`.

  This keeps the blocking browser `confirm`/`prompt` in the app layer — the SDK
  stays UI-free and its Node tests are unaffected.

- **useLoader** (`hooks/useLoader.ts`) — `{ isLoading, setIsLoading, withLoader }`;
  `withLoader` toggles the loader and defers the wrapped work to the next tick.
- **utils/constants** — mnemonic word-count constants (`MIN_WORDS_COUNT` 12,
  `MAX_WORDS_COUNT` 24, `WordsCountVariants`, `DEFAULT_WORDS_COUNT`).
- **utils/functions** — `sanitizeWord(raw)` and `clippedWordCount(value)` for
  mnemonic inputs.
- **utils/misc** — `copyTextToClipboard(text)`.
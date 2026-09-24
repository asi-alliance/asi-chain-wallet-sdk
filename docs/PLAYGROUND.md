# Playground Reference

This document summarizes the example React playground in `playground/src`. The
playground consumes the SDK through a small integration layer (`sdk-react-kit`)
and is split into routed pages (Wallets, Transaction History, Networks, Deploy,
Deploy Utils, Reservations).

The SDK is imported as `asi-wallet-sdk` (a `file:..` dependency in the
playground's `package.json`). Network endpoints come from Vite env vars (`.env`).
`npm run build` runs `tsc --noEmit` before `vite build`, so a playground that
drifts from the SDK's types fails the build instead of shipping.

---

## Entry (`playground/src/index.tsx`)

Mounts `Application` into `#root` inside a `BrowserRouter` via
`react-dom/client`'s `createRoot`, and imports the global theme in load order:
`theme/tokens.css`, `theme/commonStyles.css`, `theme/pageLayout.css`,
`theme/dataTable.css`, `theme/modal.css`, `theme/statusPanel.css` (see
[Theme](#theme-playgroundsrctheme)).

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
    eventBus.on(ClientEvent.WALLET_LOCKED, trackLockedWallet),
];
```

`WALLET_LOCKED` feeds a `lockedWalletIds` list, which is what lets the UI show a
session as locked the moment the SDK auto-locks it rather than on the next
render. The event fires on the auto-lock timer, so it cannot be inferred from the
calls the app itself makes; every path that can change the session the other way
(`openWallet`, `unlockWallet`, `closeWallet`, `removeWallet`, `clearPersistence`)
drops the wallet from that list. Operations that sign go through an internal
`withSessionSync(walletId, action)` wrapper, which re-reads
`client.isWalletUnlocked(walletId)` in a `finally`, so a session consumed or
re-established by the call itself is reflected even when no event was emitted.

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
  decide whether a password prompt is needed (see below) — plus
  `lockWallet(walletId)`, `unlockWallet(walletId, password)`, and the
  render-friendly `isWalletLocked(walletId)`, which reads the local
  `lockedWalletIds` list instead of calling into the SDK during render.
  `openWallet` starts the session as a side effect of opening; the SDK auto-locks
  it after the policy's timeout (`SDK_CLIENT_SESSION_AUTO_LOCK_MS`).
- Account lifecycle: `deriveAccount(walletId, name, password)`,
  `renameAccount(walletId, accountId, name)`, `removeAccount(walletId, accountId)`.
  There is no `setActiveAccount`: the SDK keeps no active account, so every call
  names its `walletId` and `accountId` (see
  [No active account](DOMAINS.md#no-active-account)).
- Transfers & balances: `transfer(request, password?)` (password omitted while a
  session is active), `getBalance(address: Address)`,
  `getAvailableBalance(walletId, accountId)`, `getReservations(walletId)`.
- Reservations for externally submitted deploys:
  `addTransactionReservation(request, password?)`,
  `updateTransactionReservation(reservationId, request, password?)`,
  `removeTransactionReservation(walletId, reservationId)`. The first two sign
  (they persist into the encrypted reservation store), so they run through
  `withSessionSync`; the removal does not.
- Deploys: `deploy(request, password?)` (arbitrary Rholang term via
  `IDeployRequest = { walletId, accountId, term, phloLimit? }`, same session
  rules as `transfer`), `signDeploy(request, password?)` (signs without
  submitting, `ISignDeployRequest` adds `phloPrice` and `shardId`, resolves to a
  `SignedResult`), `exploreDeploy(rholang)` (read-only, no unlock/password),
  `watchDeploy(deployId, callbacks?, options?)` (deploy status polling).
  `transfer` and `deploy` both resolve to an `IReservedOperationResult`
  (`{ deployId, subscribe }`), so the caller follows the deploy through
  `subscribe` instead of a separate watch handle.
- Export: `getExportedAccountData(walletId, accountId)` — the public account
  descriptor object, and `exportWalletKeyfile(walletId, password)` — the
  password-protected wallet keyfile. Both return objects now, so the playground
  serializes them with `ExportKeyfileService.toJSON` before offering a download.
- Keyfile import: `previewWalletKeyfileImport(source, password)`,
  `importWalletKeyfile(source, password, options?)`,
  `importKeyfileAccounts(source, password, options?)`. The two import calls
  refresh the wallet list afterwards; the preview writes nothing.
- Network busy & reservations: `isNetworkBusy(networkId)`,
  `isCurrentNetworkBusy`, `hasNetworkReservations(networkId)`. The first two read
  a local `busyNetworkIds` list kept in sync by the `NETWORK_BUSY_CHANGED` event
  rather than polling the SDK, so rendering stays synchronous;
  `hasNetworkReservations` delegates straight to the client and answers whether
  funds are still locked on a network before it is removed.
- Persistence: `clearPersistence()`.

Amount conversion is no longer proxied through the hook: `toDisplayAmount` and
`toAtomicAmount` are gone from `UseSdkValue` in favour of the asset-aware
[formatters](#formatters-formattersindexts), which read the decimals from the
`Asset` instead of assuming the native token.

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

Loads total and available balance for one account, and reports how many
reservations it holds.

```ts
useWalletBalance(sdk: UseSdkValue, walletId, accountId, address: Address, options?): UseWalletBalanceValue
// { balance: { total, available }, reservationCount, isFetching, error, reload }
// options: { reloadIntervalMs?: number }, default 30000
```

The hook reloads on mount, on every `reloadIntervalMs` tick, whenever the current
network changes, and whenever `reservationCount` changes. It reads the SDK
through the stable `getBalance` and `getAvailableBalance` callbacks instead of
the whole `sdk` object, so a re-render of `Application` no longer restarts the
polling.

`reservationCount` left the fetched `balance` object: it is derived from
`sdk.reservationsByWallet` filtered by `accountId`, which the
`RESERVATIONS_CHANGED` event already keeps current, so counting no longer costs a
`getReservations` call per balance read and no longer lags an event. Because the
count is a render input, a new reservation also triggers the balance reload that
makes the available amount catch up. Errors are rendered through `toErrorText`,
so a `CustomError` shows its code rather than a bare message.

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
nodeApiProfile: toNodeApiProfile(env.VITE_DEVNET_NODE_API_PROFILE),
```

Env keys: `VITE_DEVNET_NODE_API_PROFILE=scala`, `VITE_DEV_NODE_API_PROFILE=rust`,
`VITE_MAINNET_NODE_API_PROFILE`, `VITE_TESTNET_NODE_API_PROFILE`. New keys must
also be declared in `playground/src/vite-env.d.ts`.

The value is narrowed through `toNodeApiProfile` rather than cast with
`as NodeApiProfile`: env vars are strings of unknown content, and a cast only
hides that from the type checker until `Client.create` throws at startup. The
helper runs the SDK's own `isNodeApiProfile` guard and falls back to
`DEFAULT_NODE_API_PROFILE` (`scala`) when the key is missing or misspelled, so a
typo in `.env` starts the playground on the legacy profile instead of failing to
boot. An application that would rather refuse an unknown profile should throw in
its own wrapper instead — the SDK still rejects an invalid value it is given
directly.

`DevNet` runs the legacy Scala node, `Dev` the new Rust node. `AlexanderNet` exists
only in the repository-root `.env` (`VITE_NETWORKS`) so far, not in the playground.

### formatters (`formatters/index.ts`)

```ts
formatAddress(address: string): string   // 10-char prefix … 8-char suffix
formatAmount(amount: bigint | null | undefined, asset?: Asset): string      // "N/A" or the decimal amount
formatAssetAmount(amount: bigint | null | undefined, asset?: Asset): string // the amount plus the asset name
parseAmount(amount: string | number, asset?: Asset): bigint                 // decimal string to atomic units
formatDate(date: Date): string
```

All three amount helpers default to `DEFAULT_ASSET` and take the decimals from
`asset.getDecimals()` instead of the `NATIVE_TOKEN_DECIMALS_AMOUNT` constant, so
a non-native asset formats and parses correctly without a second code path.
`formatAssetAmount` is what UI surfaces use, which is why the hardcoded `"ASI"`
suffix disappeared from components: the unit now comes from `asset.getName()`.

### errors (`errors/index.ts`)

```ts
toErrorText(error: unknown, fallback: string): string
```

Wraps the SDK's `getErrorMessage` and, for a `CustomError`, prefixes the
machine-readable code: `ACCOUNT_BUSY: Account ... has an operation in progress`.
Every `alert` and error panel in the playground goes through it, replacing the
scattered `(error as Error)?.message ?? "..."` casts — the taxonomy in
[CustomError](DOMAINS.md#customerror-srcdomainscustomerrorindexts) is only useful
if the code reaches the surface.

### validators (`validators/index.ts`)

Input guards and error-message builders shared by the forms, all of them layered
over SDK primitives (`validateAddress`, `validateAccountName`,
`isIntegerInRange`, `isNodeApiProfile`, `NON_NEGATIVE_INTEGER_REGEX`,
`genRandomHex`) rather than re-implementing the rules:

```ts
toNodeApiProfile(value: unknown): NodeApiProfile

isAmountInputAllowed(value: string): boolean          // keystroke guard, respects the asset decimals
isIntegerInputAllowed(value: string, max?: number): boolean
isDeployIdInputAllowed(value: string): boolean        // hex only

toAddressError(value: string): string | null          // reports the AddressValidationErrorCode
toAccountNameError(value: string): string | null
toIntegerRangeError(value: string, options: IIntegerRangeOptions): string | null
toDeployIdError(value: string): string | null         // hex, whole bytes
toDeployIdLengthError(value: string): string | null   // 128-144 hex chars

generateDeployId(): string                            // a random signature-shaped id
```

The split is deliberate: `is...Allowed` runs on every keystroke and only blocks
characters that could never become valid, while `to...Error` runs on the current
value and explains why it is not acceptable yet. That keeps a field from
rejecting an intermediate state such as `"0."` while still refusing to submit it.

---

## Application (`playground/src/components/Application/index.tsx`)

Root component. Instantiates `useLoader` and `useSdk`, provides
`ApplicationContext` (modal state + loader) and `SdkContext`, and renders the
`Header`, the persistent page routes, the `ModalManager`, and the fullscreen
loader.

- `context.ts` — `ApplicationContext` with `{ modalState, setModalState, withLoader }`
  and the `useAppContext()` hook. `withLoader` is typed
  `<T>(method: () => T | Promise<T>) => Promise<T>`, so a caller can await the
  wrapped work and read its result instead of firing it and hoping.
- `meta.tsx` — the `Modals` enum and the `ModalProps` union.
- `ModalManager.tsx` — maps `Modals` to `PasswordModal`, `TransferModal`,
  `CreateWalletModal`, `DeriveWalletModal`, `TransferCompletedModal`,
  `NetworkModal`.
- `Header/` — brand, `ApplicationNavigation`, a "CLOSE ALL WALLETS" button
  (`sdk.closeAllWallets()`, memory only), and a "CLEAR SDK LS" button that calls
  `sdk.clearPersistence()` and reloads. The first was labelled "LOCK ALL WALLETS"
  before, which named the wrong thing: closing drops wallets from memory, while
  locking only ends the signing session.

---

## Routing (`playground/src/router`)

- `paths.ts` — `PATHS` (`/wallets`, `/tx-history`, `/networks`, `/deploy`,
  `/deploy-utils`, `/reservations`, default `/wallets`).
- `routes.ts` — `PAGE_ROUTES` mapping each path to a label and page component.
- `index.tsx` — `ApplicationNavigation` (NavLinks) and `PersistentPageRoutes`,
  which keep every page mounted and toggle visibility with `hidden` so page state
  survives navigation. Unknown paths redirect to the default page.

---

## Pages

### WalletsPage (`pages/WalletsPage/index.tsx`)

Two columns — Private Key wallets and Mnemonic (HD) wallets — rendered from
`sdk.walletsMetadata`. Closed wallets are labelled `closed` and show an "Open"
button; open wallets render their accounts as `AccountCard`s plus "Export
keyfile", "Close wallet", the session toggle, and (for HD) "Derive" actions. A
page-level "Import keyfile" button sits next to the network selector. HD
create/import offers a 12/24-word choice.

The two states are shown separately because they are separate: the row's badge
reads `session unlocked` or `session locked` from `sdk.isWalletLocked(walletId)`,
and the button next to it is "Lock session" or "Unlock session" accordingly,
while "Close wallet" (previously mislabelled "Lock wallet") drops the wallet from
memory entirely. Unlocking opens `PasswordModal` and calls `sdk.unlockWallet`;
locking needs nothing.

On narrow screens the two columns become tabs — `Private Key (n)` /
`Mnemonic (n)` — with the grid switching through a `data-active-column`
attribute. The first render picks the tab that has wallets in it, once: a
`isColumnPickedRef` guard keeps a later metadata refresh from yanking the tab
back while the user is reading the other one.

The page matches metadata to open wallets through a
`Map<signerId, Wallet>` built from `sdk.openWallets`, because
`walletsMetadata` is keyed by `signerId` while the in-memory wallets are keyed by
`walletId`.

Account removal is offered only when the SDK would actually allow it:
`canRemoveAccount` requires an HD wallet with more than one account, and
`AccountCard`'s `onRemove` prop is optional, so the delete control is not
rendered at all otherwise. This mirrors the `@OnlyHDWallet` and
`LastAccountRemovalError` guards rather than letting the user click into an
error.

`helpers.ts` builds `WalletPageHandlers`: `createPk`, `importPk`, `createHd`,
`importHd`, `importKeyfile`, `openWallet`, `closeWallet`, `lockWallet`,
`unlockWallet`, `deriveAccount`, `exportWalletKeyfile`, `removeWallet`,
`renameAccount`, `removeAccount`. These open the relevant modals and call the
matching `useSdk` methods through `withLoader`. Every failure path reports
through `toErrorText`, so an alert carries the SDK error code, and
`renameAccount` runs the prompted name through `toAccountNameError` before
calling the SDK — the same `validateAccountName` rule, applied before a round
trip.

`submitImportKeyfile` is where the two-way import branch lives: the modal hands
back `{ keyfile, password, existingSignerId, accountIndexes }`, and the handler
calls `importKeyfileAccounts` when `existingSignerId` is set and
`importWalletKeyfile` otherwise.

### ImportKeyfileWalletModal (`components/ImportKeyfileWalletModal`)

The preview-then-select flow for wallet keyfile import, registered as
`Modals.IMPORT_KEYFILE_WALLET_MODAL`.

The user picks a file and enters its password; the modal calls
`previewWalletKeyfileImport` and renders the result: the wallet type, whether the
secret already belongs to a stored wallet, and the per-account list with each
entry marked `new` or `already-imported`. Only the new accounts are selectable,
so a selection cannot be built that the SDK would reject as a duplicate. It
submits `IKeyfileImportPayload` with the chosen `accountIndexes`.

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
- Pages past the first are best effort while
  [#178](https://github.com/asi-alliance/asi-chain-wallet-sdk/issues/178) is
  open: the indexer pages transfers and deployments separately, so a row can be
  missing from one page and repeated on another. The **Pending only** mode is
  paginated locally and is not affected.
- Reloads on account, mode, page, network change, and on this wallet's entry in
  `reservationsByWallet`, so a fresh transfer shows up as pending without a
  manual refresh.
- Because the poller and the indexer advance independently, a just confirmed
  transaction can flicker — see the eventual-consistency note in
  [SERVICES.md](SERVICES.md).
- `TxList/index.tsx` — renders the transactions table (or empty/N-A states).
- `TxList/TxListItem/index.tsx` — one row; formats address/date, truncates the
  deploy id and block hash, and offers a copy-deploy-id button. Every cell
  carries a `data-label`, which is what the shared table styles use to restack
  the row as a labeled card on a narrow screen. The details cell shows the gas
  cost and a single-line, 40-character preview of a deploy's contract code
  instead of the removed `note` field.

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

The account picker now carries its own `walletId` instead of searching the open
wallets for the account, and the form validates through the SDK's
`validateDeployPayload` rather than its own `Number.isFinite` check, so the page
refuses exactly what the signing boundary would refuse. The pre-flight balance
check compares the balance against `phloLimit * DEFAULT_PHLO_PRICE` in atomic
units — the amount the deploy will actually reserve — instead of the ad-hoc
division it used before.

### DeployUtilsPage (`pages/DeployUtilsPage/index.tsx`)

The deploy calls that sit outside the reserve-and-submit flow, in three panels:

- **Sign deploy without submitting** — `sdk.signDeploy` through `useSecureAction`,
  with account, phlo limit, phlo price, and shard id. The result is rendered as
  the raw `SignedResult` with a copy button, so it can be handed to whatever will
  submit it. Phlo price and shard id are pinned to `DEFAULT_PHLO_PRICE` and
  `"root"` in the UI: the SDK passes both through as given, but the chain does
  not currently finalize a deploy priced differently or aimed at another shard,
  so a payload signed that way would fail downstream for reasons that say nothing
  about the signing.
- **Watch a deploy by id** — `sdk.watchDeploy` with a configurable interval and
  timeout, appending every `IDeployStatusResult` to a status log. It polls the
  node of the current network and needs no wallet, so any deploy id works,
  including one produced elsewhere.
- **Exploratory deploy** — `sdk.exploreDeploy`, read-only, no unlock or password.

Deploy ids are validated as signatures: hex only while typing
(`isDeployIdInputAllowed`), then `toDeployIdError` and `toDeployIdLengthError`
on submit, with `generateDeployId()` filling a plausible one for experiments.
The page uses `useRelevantResultGuard` so a result that arrives after a network
switch is discarded.

### ReservationsPage (`pages/ReservationsPage/index.tsx`)

The external-reservation API as a form: pick an open wallet and one of its
accounts, then add, edit, or remove reservations for deploys submitted outside
the SDK.

- The form covers both reservation kinds. `kind: "transfer"` asks for recipient
  and amount; `kind: "deploy"` asks for the term instead and locks gas only. The
  reserved total is derived, not typed — `amount + gasCost` for a transfer, the
  gas cost alone for a deploy — which is the invariant
  `validateReservationPayload` enforces on the SDK side.
- Gas cost defaults per kind (`GasFee.MAX` for a transfer,
  `DEFAULT_PHLO_LIMIT * DEFAULT_PHLO_PRICE` for a deploy) and a transfer's gas is
  held between `GasFee.MIN` and `GasFee.MAX`.
- Submitting runs `addTransactionReservation` or, when a row is being edited,
  `updateTransactionReservation` with the same reservation id, both through
  `useSecureAction`. **Remove** confirms first, then calls
  `removeTransactionReservation`.
- The table lists the selected wallet's reservations from
  `sdk.reservationsByWallet` with kind, account, deploy id, details, and a
  countdown to `expirationTime` ticking every second, so a reservation expiring
  under the SDK's own timer is visible as it happens.
- **`Client.getReservations()` raw result** dumps the unformatted array as JSON
  next to the rendered table, which is the point of a playground: the shape the
  SDK returns, not only the shape the UI chose to show.

---

## Components

### AccountCard (`components/AccountCard/index.tsx`)

Represents one SDK `Account`. Shows name, address, available balance (via
`useWalletBalance`), and a `ReservationStatus`. Actions: Send (opens
`TransferModal`, then runs `sdk.transfer` through `useSecureAction` — a confirm
when a session is active, otherwise a `PasswordModal` — and shows
`TransferCompletedModal`), Reload balance, Rename, Copy address, and Export
(downloads the encrypted keyfile from `sdk.getExportedAccountData`).

The transfer itself runs inside `withLoader`, so the loader stays up until the
reservation exists and the balance has been re-read, and the subscription to the
returned `IReservedOperationResult` is attached before that await — a deploy
confirmed quickly still triggers the reload. Amounts are rendered with
`formatAssetAmount`, so the unit comes from the asset rather than a hardcoded
`"ASI"`, and `reservationCount` is passed to `ReservationStatus` from the hook.

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
On submit the selected value goes through `toNodeApiProfile` rather than a cast,
so form data that is not a known profile falls back instead of reaching
`Client.create` as a lie about its type. This is the one place a default profile
is applied, and it belongs here: the UI
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
amount and the reservation count. The reserved amount is derived as
`total - available` rather than summed separately, and a failed read renders as
`unavailable` instead of a zero that would read as "no funds".

```ts
interface IReservationStatusProps {
    balance: WalletBalance;       // { total, available }
    reservationCount: number;
    isFetching?: boolean;
    error?: string | null;
}
```

### TransferModal (`components/TransferModal/index.tsx`)

Collects recipient and amount, validating the recipient through `toAddressError`
(the SDK's `validateAddress`, so a malformed address is refused before the SDK
sees it) and the amount against `availableBalance` (parsed with `parseAmount`).
Confirms with a branded `Address` and an atomic `bigint`.

```ts
interface ITransferModalProps {
    fromAddress: Address;
    availableBalance: bigint;
    onConfirm: (toAddress: Address, amount: bigint) => void;
    onClose: () => void;
}
```

Addresses travel as the SDK's branded `Address` rather than `string`, so the
`as never` casts that used to bridge the two are gone; the modal narrows with
`isAddress` at the point where a validated input becomes one.

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
mnemonics it opens a nested `InputsForm`. The account name is checked with
`toAccountNameError` before submit and the reason is shown in the modal, so a
name the SDK would refuse never becomes a failed call.

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

Collects a name + password to derive a new HD account, with the same inline
`toAccountNameError` check as the create modal.

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

### Mnemonic input components

- **InputsForm** (`components/InputsForm/index.tsx`) — grid of word inputs with
  paste-to-fill, sanitization, per-word errors, and validation. Props:
  `variant: 12 | 24`, `formMode: "input" | "output"`, `initialMnemonic: string[]`,
  `validateWords?`, `onValidSubmit?`, `onClose`.
- **InputsGrid** (`components/InputsGrid/index.tsx`) — lays out `Input` components;
  in `output` mode change/paste handlers are omitted (read-only).
- **Input** (`components/Input/index.tsx`) — one controlled word input; prevents
  Enter default and supports multi-word paste.

`InputsForm` validates the phrase through the SDK's `Mnemonic` service rather
than its own word list: the words are joined and normalized
(`Mnemonic.wordArrayToMnemonic` + `Mnemonic.normalizeMnemonic`) and checked with
`Mnemonic.isMnemonicValid`, which covers the checksum as well as the wordlist.
The per-word BIP-39 checks that were commented out are gone with it, so an
invalid phrase is reported once, on submit, by the same rule the SDK will apply.
The `InputsFormActionsButtons` wrapper was removed; the forms render their
buttons directly.

### FullScreenLoader (`components/FullScreenLoader/index.tsx`)

Fullscreen spinner shown while `useLoader` reports loading.

### Common components (`components/common`)

- **HighlightedRows** — labeled value rows with optional accent/description.
- **SelectFilter** — labeled `<select>` from `{ label, value }[]` options.
- **ConstrainedInput** — a labeled text input that filters keystrokes through an
  `isAllowed` guard and renders an optional hint, error, and trailing action
  (`{ id, label, value, onChange, isAllowed?, hint?, error?, readOnly?, wide?, inputMode?, action? }`).
  It is the form primitive behind the reservation and deploy-utils pages: the
  guard rejects characters that could never be valid while the `error` explains
  a value that is merely not valid yet.
- **Pagination** — `{ page, hasNextPage, onChange }` pager for sources with no
  known total: it renders a trailing window of up to five page numbers ending at
  `page + 1` when a next page is assumed, plus prev/next arrows.

`KeyValueTable` and `SelectModal` were removed; the pages that used them render
tables and option lists through the shared theme classes instead.

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

- **useLoader** (`hooks/useLoader.ts`) — `{ isLoading, setIsLoading, withLoader }`.
  `withLoader<T>(method: () => T | Promise<T>): Promise<T>` awaits the wrapped
  work and clears the loader in a `finally`, returning its result. It used to
  defer the call through a `setTimeout` and return nothing, which hid failures
  and cleared the loader before async work finished.
- **utils/constants** — mnemonic word-count constants (`MIN_WORDS_COUNT` 12,
  `MAX_WORDS_COUNT` 24, `DEFAULT_WORDS_COUNT`) and
  `SDK_CLIENT_SESSION_AUTO_LOCK_MS`, deliberately set to 15 seconds here so the
  auto-lock and the unlock flow are observable while clicking through the
  playground. Use the SDK's own default in a real application.
- **utils/functions** — `sanitizeWord(raw)` and `clippedWordCount(value)` for
  mnemonic inputs.
- **utils/misc** — `copyTextToClipboard(text)`.

---

## Theme (`playground/src/theme`)

The per-component `style.css` files were collapsed into a shared layer, imported
once in `index.tsx` in this order:

- **tokens.css** — CSS custom properties (colors, spacing, radii, typography)
  that everything else refers to; nothing here renders on its own.
- **commonStyles.css** — element-level resets and shared primitives.
- **pageLayout.css** — the page frame: panels, headers, hints, form rows, and the
  responsive column-to-tab behaviour the Wallets page uses.
- **dataTable.css** — the table look, including the `data-label` fallback that
  turns rows into stacked cards on narrow screens.
- **modal.css** — one modal skeleton for every dialog, replacing the copies that
  lived in `CreateWalletModal`, `DeriveWalletModal`, `NetworkModal`,
  `PasswordModal`, `TransferCompletedModal`, and `SelectModal`.
- **statusPanel.css** — the status, notice, and error surfaces shared by the
  reservation, deploy, and balance panels.

A component keeps its own `style.css` only for what is genuinely local to it
(`AccountCard`, `ConstrainedInput`, the two new pages). The point of the split is
that a shared class changes in one place: the modals, tables, and panels on six
pages stayed consistent through the rework because none of them owned its own
copy of the rules.
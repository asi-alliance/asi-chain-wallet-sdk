# Playground Reference

This document summarizes the example React playground in `playground/src` and describes available UI components and their props/usage.

---

## Entry (playground/src/index.tsx)

Renders the demo application root component into `#root` using `react-dom`'s `createRoot`.

Usage: the app is mounted by default — no programmatic API.

---

## Application (playground/src/components/Application)

Top-level demo application that wires together the SDK `Vault`, `ChainService`, modals and `WalletsPage`.

Key exports and behavior:

- `default` (React component) — maintains `vault`, `chainService`, `modalState`, and `currentPassword` in state; exposes helpers through `ApplicationContext`.
- `init(config, setVault, setChainService)` — initializes `ChainService`, reads saved vault data and creates a `Vault` instance.
- Modal helpers: `openUnlockModal()`, `openCreatePasswordForVaultModal()`, `openCreateKeyPairWalletModal()`, `openImportKeyPairWalletModal()`, `openCreateMnemonicWalletModal(words)`, `openRestoreMnemonicWalletModal(words)`, `openDeriveWalletModal(index)` — open corresponding modals via context state.
- Vault operations: `saveVault(password)`, `unlockVault(password)`, `createKeyPairWallet(payload)`, `handleCreateMnemonicWallet` (async factory calling `createMnemonicWallet` from `meta`), `handleDeriveWallet(name, password, index)`.

Context provided to children (`ApplicationContext`): `{ modalState, setModalState, withLoader }` (see `useLoader` hook in playground/src/hooks).

Example: the `WalletsPage` is rendered with props from the application state (vault, chainService, and action callbacks).

---

## ModalManager (playground/src/components/Application/ModalManager.tsx)

Component that maps `Modals` enum to concrete modal components and forwards props.

Props:

- `currentModal: Modals | null` — which modal to show.
- `modalProps?: ModalProps` — props forwarded to the modal component (typed unions for each modal).

Usage: rendered inside `Application` and switches between `PasswordModal`, `CreateWalletModal`, `TransferModal`, `DeriveWalletModal` and `TransferCompletedModal`.

---

## CreateWalletModal (playground/src/components/CreateWalletModal/index.tsx)

Form/modal to create or restore wallets either by private key or mnemonic.

Props (`IWalletCreateModalProps`):

- `variant?: 12 | 24` — mnemonic length variant.
- `mode: "privateKey" | "mnemonic"` — selected mode.
- `isInputMode: boolean` — if `true` the private key / mnemonic is editable.
- `title?: string` — optional modal title override.
- `onSubmit(payload: TWalletCreatePayload): void` — submit handler receives either privateKey payload or mnemonic payload.
- `onClose?(): void` — optional close handler.
- `initialMnemonic?: string` — optional mnemonic to pre-fill.
- `initialPrivateKey?: string` — optional private key to pre-fill.

Key behavior:

- Validates password/re-password match and that required fields are present for selected `mode`.
- For mnemonic mode it uses `InputsForm` to collect or display words; calls `onSubmit` with normalized words.

Example submission payloads:

- Private key mode: `{ mode: 'privateKey', name, privateKey, password }`
- Mnemonic mode: `{ mode: 'mnemonic', name, mnemonicWords, password }`

---

## DeriveWalletModal (playground/src/components/DeriveWalletModal/index.tsx)

Props (`IDeriveWalletModalProps`):

- `onSubmit(name: string, password: string, index: number): void` — called with user inputs.
- `onClose?(): void`
- `index: number` — derivation index.

Behavior: simple form validating password confirmation and forwarding trimmed name/password/index.

---

## FullScreenLoader (playground/src/components/FullScreenLoader/index.tsx)

Visual fullscreen spinner displayed when `useLoader` reports loading.

---

## Input (playground/src/components/Input/index.tsx)

Small controlled text input used by `InputsGrid` and `InputsForm` for mnemonic words.

Props:

- `index: number` — position index (0-based).
- `value: string` — current input value.
- `hasError: boolean` — error styling flag.
- `onChange(index, value): void` — change callback.
- `onPaste(index, pasted): void` — paste handler for multi-word paste.
- `inputRef: RefObject<HTMLInputElement | null>` — optional ref.

Behavior: prevents Enter default, supports multi-word paste to populate many inputs.

---

## InputsForm (playground/src/components/InputsForm/index.tsx)

Composed form that renders a grid of `Input` components and handles mnemonic validation and submission.

Props (`IInputsFormProps`):

- `variant: 12 | 24` — words count.
- `formMode: 'input' | 'output'` — determines interactivity.
- `initialMnemonic: string[]` — initial words array.
- `validateWords?(words: string[]): string | null` — optional custom validation function returning error message.
- `onValidSubmit?(normalizedWords: string[]): void` — callback when form is valid.
- `onClose(): void` — close handler.

Behavior:

- Manages words array, per-word error flags, paste-to-fill behavior, and overall validation.
- Normalizes words (trim/lowercase) before calling `onValidSubmit`.

---

## InputsGrid (playground/src/components/InputsGrid/index.tsx)

Renders `Input` components in a grid.

Props:

- `words: string[]`, `errors: boolean[]`, `inputRefs: RefObject[]`, `onWordChange`, `onPasteWords`, `mode: 'input'|'output'`.

---

## InputsFormActionsButtons (playground/src/components/InputsFormActionsButtons/index.tsx)

Renders action buttons for forms; accepts an array of actions with label, type, className and onClick.

---

## PasswordModal (playground/src/components/PasswordModal/index.tsx)

Props (`IPasswordModalProps`):

- `title: string` — label shown next to password input.
- `onSubmit(password: string): void` — invoked with password string.
- `onClose?(): void` — optional cancel.

---

## SelectModal (playground/src/components/SelectModal/index.tsx)

Simple modal list of options.

Props (`ISelectModalProps`):

- `title: string`, `options: { title: string; onClick(): void; disabled?: boolean }[]`, `onClose?(): void`.

---

## TransferModal (playground/src/components/TransferModal/index.tsx)

Props (`ITransferModalProps`):

- `currentBalance: bigint`, `toAddress: string`, `amount: bigint`, `commission: number`,
- `onConfirm(toAddress: string, amount: bigint): void`, `onClose(): void`.

Behavior: reads form fields, converts amount to atomic `bigint` using playground utilities (`toAtomicAmount`) and calls `onConfirm`.

---

## TransferCompletedModal (playground/src/components/TransferCompletedModal/index.tsx)

Props (`ITransferCompletedModalProps`):

- `fromAddress: string`, `toAddress: string`, `amount: bigint`, `deployId: string`, `onClose(): void`.

Behavior: shows transfer details, displays human-readable amount using `fromAtomicAmount`, and supports copying `deployId` to clipboard.

---

## WalletCard (playground/src/components/WalletCard/index.tsx)

Card component representing a `Wallet` instance from the SDK; shows name, address, balance and actions.

Props (`IWalletCardProps`):

- `wallet: Wallet` — SDK `Wallet` instance.
- `removeWallet(id: Address): void` — callback to remove wallet from vault.
- `chainService: ChainService` — SDK chain service used to fetch balances and execute transfers.

Behavior & methods:

- `fetchBalance()` — fetches ASI balance via `chainService.getASIBalance(address)`.
- `handlePrepareSend()` — opens transfer modal via `ApplicationContext`.
- `handleSend()` — prompts `PasswordModal` then calls `transfer()`.
- `transfer(toAddress, amount, password)` — unlocks wallet, calls `chainService.transfer` with wallet and password provider, locks wallet and shows `TransferCompletedModal` on success.

Example: clicking Send triggers modal flow to unlock wallet and send funds.

---

## WalletsPage (playground/src/pages/WalletsPage/index.tsx)

Page that lists private-key and mnemonic wallets from a `Vault` and provides create/import/derive UI actions.

Props (`WalletsPageProps`):

- `vault: Vault`, `chainService: ChainService`, `removeWallet(id: Address)`, `importPk()`, `importDk(words)`, `createPk()`, `createDk(words)`, `deriveK(index)`.

Behavior: separates wallets by `wallet.getIndex()` (null => private key wallets), exposes buttons to create/import/derive wallets, and renders `WalletCard` for each wallet.

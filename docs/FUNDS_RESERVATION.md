# Funds Reservation System

## Overview

The Funds Reservation System provides a mechanism to lock and manage funds during in-flight transactions, preventing double-spending and enabling safe concurrent transaction handling in the ASI Wallet SDK.

## Problem Solved

**Without Reservation System:**
- User initiates multiple transfers without waiting for confirmation
- SDK cannot prevent double-spending (same funds locked multiple times)
- No visibility into which funds are "in-flight"
- Race conditions in concurrent scenarios

**With Reservation System:**
- Funds are locked before transaction submission
- Each lock maintains lifecycle (pending → committed/released)
- Clear tracking of reserved vs. available funds
- Safe handling of concurrent operations

## Core Concepts

### Reservation States

```
PENDING     → Initial state after lock()
  ├─ COMMITTED  → After commit() - transaction submitted to blockchain
  └─ RELEASED   → After release() - transaction cancelled/failed
  
EXPIRED     → When expiresAt timestamp passes (auto-transition)
```

### Reservation Lifecycle

```
1. lock(address, amount)
   ↓
2. [Optional: Get total reserved to check availability]
   ↓
3. Submit deploy to blockchain
   ↓
4a. SUCCESS → commit(reservationId, deployId)
   └→ COMMITTED (transaction in mempool/block)
   
4b. FAILURE → release(reservationId)
   └→ RELEASED (funds freed, retry possible)
```

## API Reference

### FundsReservationService

Singleton service managing all reservations. Access via:
```typescript
import FundsReservationService from "@services/FundsReservation";
const service = FundsReservationService.getInstance();
```

#### `lock(address, amount, expirationTimeMs?, deployId?, reason?): string`

Reserve funds for a transaction.

**Parameters:**
- `address: Address` - Wallet address to reserve funds for
- `amount: bigint` - Amount in atomic units (required: > 0)
- `expirationTimeMs?: number` - Time before expiration (default: 5 minutes = 300000ms)
- `deployId?: string` - Optional deploy ID to associate
- `reason?: string` - Optional description (e.g., "Transfer to user X")

**Returns:** `reservationId: string` - Unique identifier for this reservation

**Throws:** Error if amount ≤ 0

**Example:**
```typescript
const amount = 1000n; // atomic units
const reservationId = reservationService.lock(
  userAddress,
  amount,
  5 * 60 * 1000,  // 5 minutes
  undefined,
  "Transfer payment"
);
```

---

#### `commit(reservationId, deployId?): void`

Finalize a reservation (mark as submitted to blockchain).

**Parameters:**
- `reservationId: string` - ID from lock()
- `deployId?: string` - Optional: set/update the deploy ID

**State Transition:** PENDING → COMMITTED

**Throws:** 
- Error if reservation doesn't exist
- Error if not in PENDING state
- Error if reservation has expired

**Use When:** Deploy has been successfully submitted to blockchain

**Example:**
```typescript
const deployResult = await gateway.submitDeploy(signedDeploy);
if (deployResult.success) {
  reservationService.commit(reservationId, deployResult.deployId);
}
```

---

#### `release(reservationId): void`

Cancel a reservation (unlock funds).

**Parameters:**
- `reservationId: string` - ID from lock()

**State Transition:** PENDING → RELEASED

**Throws:**
- Error if reservation doesn't exist  
- Error if not in PENDING state

**Use When:** Transaction submission fails or is cancelled

**Example:**
```typescript
try {
  await gateway.submitDeploy(signedDeploy);
} catch (error) {
  reservationService.release(reservationId);
  // User can retry or funds freed for other transfers
}
```

---

#### `getTotalReserved(address): bigint`

Get all reserved funds (pending + committed, excluding expired/released).

**Parameters:**
- `address: Address` - Wallet address

**Returns:** `bigint` - Total reserved amount

**Use When:** 
- Checking available balance for new transfers
- Preventing overspending
- UI showing "locked" funds

**Example:**
```typescript
const balance = await getASIBalance(address);
const reserved = reservationService.getTotalReserved(address);
const available = balance - reserved;

if (newTransferAmount > available) {
  throw new Error("Insufficient available balance");
}
```

---

#### `getPendingReserved(address): bigint`

Get only pending (not yet committed) reserved funds.

**Parameters:**
- `address: Address` - Wallet address

**Returns:** `bigint` - Total pending reservation amount

**Use When:** Tracking in-flight transactions that haven't confirmed yet

---

#### `getReservations(address): Reservation[]`

Get all reservations for an address.

**Parameters:**
- `address: Address` - Wallet address

**Returns:** Array of Reservation objects with full details

**Example:**
```typescript
const reservations = reservationService.getReservations(address);
const pending = reservations.filter(r => r.status === "PENDING");
const committed = reservations.filter(r => r.status === "COMMITTED");
```

---

#### `getReservation(reservationId): Reservation | undefined`

Get a specific reservation by ID.

**Parameters:**
- `reservationId: string` - ID from lock()

**Returns:** Reservation object or undefined

---

#### `cleanupExpired(address): number`

Remove expired pending reservations.

**Parameters:**
- `address: Address` - Wallet address

**Returns:** `number` - Count of reservations removed

**Use When:** Cleaning up stuck/abandoned transfers, freeing memory

**Note:** Expired reservations are automatically excluded from `getTotalReserved()`, so cleanup is optional but recommended for long-lived applications.

---

#### `clear(): void`

Clear all reservations (testing/reset only).

---

## Usage Patterns

### Pattern 1: Simple Transfer with Reservation

```typescript
import AssetsService from "@services/AssetsService";
const assetsService = new AssetsService();
const reservationService = FundsReservationService.getInstance();

async function safeTransfer(
  fromAddress: Address,
  toAddress: Address,
  amount: bigint,
  wallet: Wallet,
  passwordProvider: PasswordProvider
) {
  let reservationId: string | null = null;

  try {
    // Lock funds
    reservationId = reservationService.lock(
      fromAddress,
      amount,
      5 * 60 * 1000,  // 5 minute timeout
      undefined,
      `Transfer to ${toAddress}`
    );

    // Submit transaction
    const deployId = await assetsService.transfer(
      fromAddress,
      toAddress,
      amount,
      wallet,
      passwordProvider
    );

    // Confirm reservation
    if (deployId) {
      reservationService.commit(reservationId, deployId);
      console.log(`Transfer confirmed. Deploy: ${deployId}`);
    }

    return deployId;

  } catch (error) {
    // Release on error
    if (reservationId) {
      reservationService.release(reservationId);
    }
    throw error;
  }
}
```

**Note:** `AssetsService.transfer()` already has this logic built-in.

---

### Pattern 2: Check Available Balance Before Transfer

```typescript
async function checkAvailableBalance(
  address: Address
): Promise<bigint> {
  const balance = await assetsService.getASIBalance(address);
  const reserved = reservationService.getTotalReserved(address);
  
  return balance - reserved;  // Available for new transfers
}

// Usage
const available = await checkAvailableBalance(userAddress);
if (transferAmount > available) {
  showError("Insufficient balance (accounting for in-flight transfers)");
}
```

---

### Pattern 3: Handle Concurrent Transfers

```typescript
async function sendMultipleTransfers(
  fromAddress: Address,
  transfers: Array<{ to: Address; amount: bigint }>
) {
  const balance = await assetsService.getASIBalance(fromAddress);
  const reservationIds: string[] = [];

  try {
    // Lock all transfers upfront
    for (const tx of transfers) {
      const available = balance - 
        reservationService.getTotalReserved(fromAddress);

      if (tx.amount > available) {
        throw new Error(`Insufficient balance for ${tx.to}`);
      }

      const resId = reservationService.lock(
        fromAddress,
        tx.amount,
        5 * 60 * 1000,
        undefined,
        `Transfer to ${tx.to}`
      );
      reservationIds.push(resId);
    }

    // Submit all transfers
    const deployPromises = transfers.map((tx) =>
      assetsService.transfer(
        fromAddress,
        tx.to,
        tx.amount,
        wallet,
        passwordProvider
      )
    );

    const deployIds = await Promise.allSettled(deployPromises);

    // Commit/release based on results
    for (let i = 0; i < deployIds.length; i++) {
      const result = deployIds[i];

      if (result.status === "fulfilled" && result.value) {
        reservationService.commit(reservationIds[i], result.value);
      } else {
        reservationService.release(reservationIds[i]);
      }
    }

  } catch (error) {
    // Release all on critical error
    for (const resId of reservationIds) {
      try {
        reservationService.release(resId);
      } catch (e) {
        console.error("Failed to release reservation", e);
      }
    }
    throw error;
  }
}
```

---

### Pattern 4: Cleanup Stuck Transfers

```typescript
async function cleanupStuckTransfers(address: Address) {
  const removed = reservationService.cleanupExpired(address);
  
  if (removed > 0) {
    console.log(`Cleaned up ${removed} expired reservations at ${address}`);
    
    // Notify user their balance is available again
    const nowAvailable = await checkAvailableBalance(address);
    console.log(`Available balance: ${nowAvailable}`);
  }
}

// Call periodically or when user requests
setInterval(() => cleanupStuckTransfers(userAddress), 60000);
```

---

## Integration Points

### AssetsService.transfer()

Already integrated:
```typescript
// Inside AssetsService.transfer():
const reservationId = reservationService.lock(
  fromAddress,
  amount,
  5 * 60 * 1000,
  undefined,
  `Transfer to ${toAddress}`
);

try {
  const deployId = await gateway.submitDeploy(signedDeploy);
  reservationService.commit(reservationId, deployId);
  return deployId;
} catch (error) {
  reservationService.release(reservationId);
  throw error;
}
```

### DeployResubmitter

Can be enhanced to track reservations across resubmission attempts. Example framework:
```typescript
class Resubmitter {
  async resubmit(
    rholangCode: string,
    wallet: Wallet,
    passwordProvider: PasswordProvider,
    reservationId?: string  // Optional
  ) {
    // Track reservation through retries
    // Release on final failure
    // Commit on success
  }
}
```

---

## Testing

See test files for comprehensive scenarios:
- `tests/reservation-functionality.test.ts` - Unit tests
- `tests/funds-reservation-integration.test.ts` - Integration test scenarios

Run tests:
```bash
npm test -- reservation
npm test -- funds-reservation-integration
```

---

## Error Handling

### Common Errors

```typescript
// Invalid amount
reservationService.lock(address, 0n)
// → Error: "Amount must be greater than zero"

// Commit non-pending
reservationService.commit(reservationId)
reservationService.commit(reservationId)  // 2nd attempt
// → Error: "Cannot commit a non-pending reservation"

// Release non-existent
reservationService.release("invalid_id")
// → Error: "Reservation not found"

// Commit expired
const expiredResId = reservationService.lock(address, amount, 100);
await wait(200);  // Expire the reservation
reservationService.commit(expiredResId)
// → Error: "Cannot commit an expired reservation"
```

### Error Recovery

Always wrap in try-catch at transaction boundary:
```typescript
let reservationId: string | null = null;

try {
  reservationId = reservationService.lock(...);
  // Submit and process
  reservationService.commit(reservationId);
} catch (error) {
  if (reservationId) {
    try {
      reservationService.release(reservationId);
    } catch (releaseError) {
      // Log but don't throw - funds will free after expiration
      console.error("Release failed:", releaseError);
    }
  }
  throw error;  // Propagate original error
}
```

---

## Performance Considerations

- **Memory:** Each reservation ~200 bytes. Cleanup expired to reduce memory in long-running apps.
- **Lookup:** O(1) by ID, O(n) per-address traversal
- **Singleton:** Service is a singleton—no multiple instances
- **Thread-safe:** JS is single-threaded; no locking needed for SDK

---

## Future Enhancements

Potential improvements:
- Persistent storage (IndexedDB) for cross-session tracking
- Automatic release after expiration (instead of manual cleanup)
- Reservation limits per address
- Integration with blockchain polling status
- Analytics on failed vs. successful reservations
- UI component for displaying reserved funds

---

## Migration Guide

If upgrading from old transfer code:

**Before:**
```typescript
const deployId = await assetsService.transfer(from, to, amount, wallet, pwd);
// Risk: concurrent calls double-spend
```

**After (Via AssetsService):**
```typescript
// No changes needed! AssetsService now handles reservations internally
const deployId = await assetsService.transfer(from, to, amount, wallet, pwd);
```

**Or manually with service:**
```typescript
const resId = reservationService.lock(from, amount);
try {
  const deployId = await submitDeploy(...);
  reservationService.commit(resId, deployId);
} catch (e) {
  reservationService.release(resId);
  throw e;
}
```

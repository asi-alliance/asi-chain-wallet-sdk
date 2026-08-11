import test from "node:test";
import assert from "node:assert/strict";

import TransactionsHistoryAggregator, {
    ITransactionsHistoryWindow,
} from "@services/TransactionsHistoryAggregator";
import { Pagination } from "@services/GraphqlParser/queryOptions";
import { Transaction, TransactionStatus } from "@domains/Transaction";
import { NetworkId } from "@domains/Network";

const NETWORK_ID: NetworkId = "test-network";
const OTHER_NETWORK_ID: NetworkId = "other-network";

const MAX_SWEEP_PAGES: number = 50;

const makeTransaction = (
    id: string,
    time: string,
    status: TransactionStatus,
    networkId: NetworkId = NETWORK_ID,
): Transaction => ({
    id,
    timestamp: new Date(`2026-07-31T${time}:00.000Z`),
    type: "send",
    status,
    from: "sender-address",
    networkId,
});

const executed = (
    id: string,
    time: string,
    networkId?: NetworkId,
): Transaction => makeTransaction(id, time, "completed", networkId);

const failed = (id: string, time: string): Transaction =>
    makeTransaction(id, time, "failed");

const pending = (
    id: string,
    time: string,
    networkId?: NetworkId,
): Transaction => makeTransaction(id, time, "pending", networkId);

const toIds = (transactions: Transaction[]): string[] =>
    transactions.map((transaction: Transaction) => transaction.id);

const queryIndexer = (
    indexedTransactions: Transaction[],
    { offset, limit }: Pagination,
): Transaction[] => {
    const start: number = offset ?? 0;

    if (limit === undefined) {
        return indexedTransactions.slice(start);
    }

    return indexedTransactions.slice(start, start + limit);
};

const buildExpectedHistory = (
    indexedTransactions: Transaction[],
    pendingTransactions: Transaction[],
): Transaction[] => {
    const indexedIds: Set<string> = new Set(toIds(indexedTransactions));

    const localPending: Transaction[] = pendingTransactions.filter(
        (transaction: Transaction) =>
            transaction.networkId === NETWORK_ID &&
            !indexedIds.has(transaction.id),
    );

    return [...indexedTransactions, ...localPending].sort(
        (first: Transaction, second: Transaction) =>
            second.timestamp.getTime() - first.timestamp.getTime(),
    );
};

const readPage = (
    indexedTransactions: Transaction[],
    pendingTransactions: Transaction[],
    pagination?: Pagination,
): Transaction[] => {
    const historyWindow: ITransactionsHistoryWindow =
        TransactionsHistoryAggregator.createHistoryWindow(
            pendingTransactions,
            NETWORK_ID,
            { pagination },
        );

    return TransactionsHistoryAggregator.mergeHistoryPage(
        historyWindow,
        queryIndexer(indexedTransactions, historyWindow.executedPagination),
    );
};

const readAllPages = (
    indexedTransactions: Transaction[],
    pendingTransactions: Transaction[],
    limit: number,
): Transaction[] => {
    const collected: Transaction[] = [];

    for (let pageIndex: number = 0; pageIndex < MAX_SWEEP_PAGES; pageIndex++) {
        const page: Transaction[] = readPage(
            indexedTransactions,
            pendingTransactions,
            { offset: pageIndex * limit, limit },
        );

        if (!page.length) {
            return collected;
        }

        collected.push(...page);
    }

    assert.fail(`Paging did not terminate within ${MAX_SWEEP_PAGES} pages`);
};

const assertMonotonic = (transactions: Transaction[]): void => {
    transactions.forEach((transaction: Transaction, index: number) => {
        if (!index) {
            return;
        }

        assert.ok(
            transactions[index - 1].timestamp.getTime() >=
                transaction.timestamp.getTime(),
            `History is not sorted at index ${index}: ${toIds(transactions).join(", ")}`,
        );
    });
};

const INTERLEAVED_EXECUTED: Transaction[] = [
    executed("c1", "12:10"),
    executed("c2", "12:06"),
    executed("c3", "12:04"),
    executed("c4", "12:01"),
    executed("c5", "11:58"),
    executed("c6", "11:50"),
];

const INTERLEAVED_PENDING: Transaction[] = [
    pending("p1", "12:08"),
    pending("p2", "12:05"),
    pending("p3", "11:55"),
];

const INTERLEAVED_EXPECTED_IDS: string[] = [
    "c1",
    "p1",
    "c2",
    "p2",
    "c3",
    "c4",
    "c5",
    "p3",
    "c6",
];

test("indexer window is requested untouched when there are no pending rows", () => {
    const historyWindow: ITransactionsHistoryWindow =
        TransactionsHistoryAggregator.createHistoryWindow([], NETWORK_ID, {
            pagination: { offset: 2, limit: 3 },
        });

    assert.deepEqual(historyWindow.executedPagination, {
        offset: 2,
        limit: 3,
    });

    assert.deepEqual(
        toIds(readPage(INTERLEAVED_EXECUTED, [], { offset: 2, limit: 3 })),
        ["c3", "c4", "c5"],
    );
});

test("indexer window is widened by the pending count and floored at zero", () => {
    const nearHead: ITransactionsHistoryWindow =
        TransactionsHistoryAggregator.createHistoryWindow(
            INTERLEAVED_PENDING,
            NETWORK_ID,
            { pagination: { offset: 1, limit: 4 } },
        );

    assert.deepEqual(nearHead.executedPagination, { offset: 0, limit: 7 });

    const deepPage: ITransactionsHistoryWindow =
        TransactionsHistoryAggregator.createHistoryWindow(
            INTERLEAVED_PENDING,
            NETWORK_ID,
            { pagination: { offset: 6, limit: 4 } },
        );

    assert.deepEqual(deepPage.executedPagination, { offset: 3, limit: 7 });
});

test("an executed row newer than a live pending row keeps page boundaries intact", () => {
    const indexed: Transaction[] = [
        executed("c0", "12:02"),
        executed("c1", "12:01"),
        executed("c2", "11:59"),
    ];

    const local: Transaction[] = [pending("p1", "12:00")];

    const firstPage: Transaction[] = readPage(indexed, local, {
        offset: 0,
        limit: 2,
    });

    const secondPage: Transaction[] = readPage(indexed, local, {
        offset: 2,
        limit: 2,
    });

    console.log("page 1:", toIds(firstPage), "page 2:", toIds(secondPage));

    assert.deepEqual(toIds(firstPage), ["c0", "c1"]);
    assert.deepEqual(toIds(secondPage), ["p1", "c2"]);

    assertMonotonic([...firstPage, ...secondPage]);
});

test("a pending row sent between two executed rows lands between them", () => {
    const indexed: Transaction[] = [
        executed("later", "12:02"),
        executed("earlier", "12:00"),
    ];

    const local: Transaction[] = [pending("middle", "12:01")];

    assert.deepEqual(toIds(readPage(indexed, local, { offset: 0, limit: 2 })), [
        "later",
        "middle",
    ]);

    assert.deepEqual(toIds(readPage(indexed, local, { offset: 2, limit: 2 })), [
        "earlier",
    ]);
});

test("a failed row takes part in the merged history like any executed one", () => {
    const indexed: Transaction[] = [
        executed("ok", "12:02"),
        failed("reverted", "12:00"),
    ];

    const local: Transaction[] = [pending("p1", "12:01")];

    assert.deepEqual(toIds(readPage(indexed, local, { offset: 0, limit: 3 })), [
        "ok",
        "p1",
        "reverted",
    ]);

    assert.deepEqual(toIds(readPage(indexed, local, { offset: 2, limit: 1 })), [
        "reverted",
    ]);
});

test("pending rows newer than the whole indexed history head the first page", () => {
    const indexed: Transaction[] = [
        executed("c1", "11:00"),
        executed("c2", "10:00"),
    ];

    const local: Transaction[] = [
        pending("p1", "12:00"),
        pending("p2", "11:30"),
    ];

    assert.deepEqual(toIds(readPage(indexed, local, { offset: 0, limit: 3 })), [
        "p1",
        "p2",
        "c1",
    ]);

    assert.deepEqual(toIds(readPage(indexed, local, { offset: 3, limit: 3 })), [
        "c2",
    ]);
});

test("pending rows older than the whole indexed history land at the tail", () => {
    const indexed: Transaction[] = [
        executed("c1", "12:00"),
        executed("c2", "11:00"),
    ];

    const local: Transaction[] = [pending("p1", "10:00")];

    assert.deepEqual(toIds(readPage(indexed, local, { offset: 0, limit: 2 })), [
        "c1",
        "c2",
    ]);

    assert.deepEqual(toIds(readPage(indexed, local, { offset: 2, limit: 2 })), [
        "p1",
    ]);
});

test("an indexed row replaces its pending twin and the page stays full", () => {
    const indexed: Transaction[] = [
        executed("shared", "12:02"),
        executed("c1", "12:01"),
        executed("c2", "12:00"),
    ];

    const local: Transaction[] = [pending("shared", "12:02")];

    const page: Transaction[] = readPage(indexed, local, {
        offset: 0,
        limit: 3,
    });

    assert.deepEqual(toIds(page), ["shared", "c1", "c2"]);

    assert.equal(
        page[0].status,
        "completed",
        "The indexed row must win over its pending twin",
    );
});

test("pending rows from another network are excluded", () => {
    const indexed: Transaction[] = [executed("c1", "12:00")];

    const local: Transaction[] = [
        pending("foreign", "12:30", OTHER_NETWORK_ID),
        pending("local", "12:10"),
    ];

    assert.deepEqual(toIds(readPage(indexed, local, { offset: 0, limit: 5 })), [
        "local",
        "c1",
    ]);
});

test("history is served from pending rows alone when the indexer is empty", () => {
    const local: Transaction[] = [
        pending("p1", "12:00"),
        pending("p2", "11:00"),
    ];

    assert.deepEqual(toIds(readPage([], local, { offset: 0, limit: 5 })), [
        "p1",
        "p2",
    ]);

    assert.deepEqual(toIds(readPage([], local, { offset: 1, limit: 5 })), [
        "p2",
    ]);

    assert.deepEqual(toIds(readPage([], local, { offset: 2, limit: 5 })), []);
});

test("an equal timestamp keeps the indexed row above the pending one", () => {
    const indexed: Transaction[] = [executed("c1", "12:00")];

    const local: Transaction[] = [pending("p1", "12:00")];

    assert.deepEqual(toIds(readPage(indexed, local, { offset: 0, limit: 2 })), [
        "c1",
        "p1",
    ]);
});

test("an offset past the end of the merged history returns an empty page", () => {
    assert.deepEqual(
        readPage(INTERLEAVED_EXECUTED, INTERLEAVED_PENDING, {
            offset: INTERLEAVED_EXPECTED_IDS.length,
            limit: 5,
        }),
        [],
    );

    assert.deepEqual(
        readPage(INTERLEAVED_EXECUTED, INTERLEAVED_PENDING, {
            offset: 500,
            limit: 5,
        }),
        [],
    );
});

test("an omitted limit returns the merged history from the offset to the end", () => {
    assert.deepEqual(
        toIds(readPage(INTERLEAVED_EXECUTED, INTERLEAVED_PENDING)),
        INTERLEAVED_EXPECTED_IDS,
    );

    assert.deepEqual(
        toIds(
            readPage(INTERLEAVED_EXECUTED, INTERLEAVED_PENDING, { offset: 4 }),
        ),
        INTERLEAVED_EXPECTED_IDS.slice(4),
    );
});

test("every single-row window matches the merged history at that index", () => {
    const expectedIds: string[] = toIds(
        buildExpectedHistory(INTERLEAVED_EXECUTED, INTERLEAVED_PENDING),
    );

    assert.deepEqual(expectedIds, INTERLEAVED_EXPECTED_IDS);

    expectedIds.forEach((expectedId: string, index: number) => {
        assert.deepEqual(
            toIds(
                readPage(INTERLEAVED_EXECUTED, INTERLEAVED_PENDING, {
                    offset: index,
                    limit: 1,
                }),
            ),
            [expectedId],
            `Window at offset ${index} does not match the merged history`,
        );
    });
});

test("paging with any limit reproduces the merged history exactly once", () => {
    const expected: Transaction[] = buildExpectedHistory(
        INTERLEAVED_EXECUTED,
        INTERLEAVED_PENDING,
    );

    [1, 2, 3, 4, 5, 9, 20].forEach((limit: number) => {
        const collected: Transaction[] = readAllPages(
            INTERLEAVED_EXECUTED,
            INTERLEAVED_PENDING,
            limit,
        );

        console.log(`limit ${limit}:`, toIds(collected).join(" "));

        assert.deepEqual(
            toIds(collected),
            toIds(expected),
            `Paging with limit ${limit} did not reproduce the merged history`,
        );

        assertMonotonic(collected);
    });
});

test("paging stays correct when pending rows outnumber the indexed ones", () => {
    const indexed: Transaction[] = [executed("c1", "12:00")];

    const local: Transaction[] = [
        pending("p1", "12:30"),
        pending("p2", "12:20"),
        pending("p3", "11:40"),
        pending("p4", "11:30"),
    ];

    const expected: Transaction[] = buildExpectedHistory(indexed, local);

    assert.deepEqual(toIds(expected), ["p1", "p2", "c1", "p3", "p4"]);

    [1, 2, 3].forEach((limit: number) => {
        assert.deepEqual(
            toIds(readAllPages(indexed, local, limit)),
            toIds(expected),
            `Paging with limit ${limit} did not reproduce the merged history`,
        );
    });
});

test("the pending-only source applies pagination to the pending rows directly", () => {
    const local: Transaction[] = [
        pending("p3", "11:55"),
        pending("p1", "12:08"),
        pending("p2", "12:05"),
    ];

    assert.deepEqual(
        toIds(
            TransactionsHistoryAggregator.createPendingHistoryPage(
                local,
                NETWORK_ID,
            ).items,
        ),
        ["p1", "p2", "p3"],
    );

    assert.deepEqual(
        toIds(
            TransactionsHistoryAggregator.createPendingHistoryPage(
                local,
                NETWORK_ID,
                { pagination: { offset: 1, limit: 1 } },
            ).items,
        ),
        ["p2"],
    );

    assert.deepEqual(
        TransactionsHistoryAggregator.createPendingHistoryPage(
            local,
            NETWORK_ID,
            { pagination: { offset: 3, limit: 2 } },
        ).items,
        [],
    );
});

test("the pending-only source drops rows from another network", () => {
    const local: Transaction[] = [
        pending("foreign", "12:30", OTHER_NETWORK_ID),
        pending("local", "12:10"),
    ];

    assert.deepEqual(
        toIds(
            TransactionsHistoryAggregator.createPendingHistoryPage(
                local,
                NETWORK_ID,
                { pagination: { offset: 0, limit: 5 } },
            ).items,
        ),
        ["local"],
    );
});
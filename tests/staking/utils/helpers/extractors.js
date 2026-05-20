function findValueByKey(target, key) {
    if (target === null || target === undefined) {
        return undefined;
    }

    if (typeof target === "string") {
        try {
            return findValueByKey(JSON.parse(target), key);
        } catch {
            return undefined;
        }
    }

    if (typeof target !== "object") {
        return undefined;
    }

    if (Object.prototype.hasOwnProperty.call(target, key)) {
        return target[key];
    }

    if (Array.isArray(target)) {
        for (const item of target) {
            const found = findValueByKey(item, key);

            if (found !== undefined) {
                return found;
            }
        }

        return undefined;
    }

    for (const value of Object.values(target)) {
        const found = findValueByKey(value, key);

        if (found !== undefined) {
            return found;
        }
    }

    return undefined;
}

module.exports = {
    findValueByKey,
};

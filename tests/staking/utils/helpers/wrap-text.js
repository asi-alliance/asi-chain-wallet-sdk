const { DEFAULT_CONSOLE_LOG_LENGTH } = require("../../config");

function wrapText(text, width = DEFAULT_CONSOLE_LOG_LENGTH) {
    const lines = [];

    for (const rawLine of text.split("\n")) {
        if (rawLine.length <= width) {
            lines.push(rawLine);

            continue;
        }

        let line = rawLine;

        while (line.length > width) {
            lines.push(line.slice(0, width));

            line = line.slice(width);
        }

        if (line.length) {
            lines.push(line);
        }
    }

    return lines;
}

function formatCompactJSON(obj, width = DEFAULT_CONSOLE_LOG_LENGTH) {
    const json = JSON.stringify(obj, null, 2);
    const lines = wrapText(json, width);

    return lines.join("\n");
}

module.exports = {
    formatCompactJSON,
};

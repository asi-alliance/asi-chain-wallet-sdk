const {
    DEFAULT_SEPARATOR,
    DEFAULT_CONSOLE_LOG_LENGTH,
} = require("../../config");

const WriteColors = {
    RED: "\x1b[31m",
    GREEN: "\x1b[32m",
    YELLOW: "\x1b[33m",
    CYAN: "\x1b[36m",
};

const WriteSpecificSymbols = {
    RESET: "\x1b[0m",
};

const WriteStyles = {
    BOLD: "\x1b[1m",
    DIM: "\x1b[2m",
};

function write(line = "") {
    process.stdout.write(line + "\n");
}

function printSeparator(
    separator = DEFAULT_SEPARATOR,
    length = DEFAULT_CONSOLE_LOG_LENGTH,
) {
    write(separator.repeat(length));
}

function formatText(text, options = {}) {
    const { color, bold = false, dim = false } = options;

    let result = text;

    if (bold) {
        result = `${WriteStyles.BOLD}${result}`;
    }

    if (dim) {
        result = `${WriteStyles.DIM}${result}`;
    }

    if (color) {
        result = `${color}${result}`;
    }

    return `${result}${WriteSpecificSymbols.RESET}`;
}

const LogFormats = {
    info: (text) => formatText(text, { color: WriteColors.CYAN }),
    warn: (text) => formatText(text, { color: WriteColors.YELLOW }),
    error: (text) => formatText(text, { color: WriteColors.RED }),
    success: (text) => formatText(text, { color: WriteColors.GREEN }),
    title: (text) => formatText(text, { color: WriteColors.CYAN, bold: true }),
    bold: (text) => formatText(text, { bold: true }),
    muted: (text) => formatText(text, { bold: false, dim: true }),
};

module.exports = {
    LogFormats,
    formatText,
    WriteColors,
    WriteSpecificSymbols,
    WriteStyles,
    write,
    printSeparator,
};

const fs = require('fs').promises;
const path = require('path');

const ensureDirectoryExists = async (filePath) => {
    const directory = path.dirname(filePath);
    try {
        await fs.access(directory);
    } catch (error) {
        await fs.mkdir(directory, { recursive: true });
    }
};

module.exports = ensureDirectoryExists;
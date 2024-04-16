const createConsoleLog = (directoryPath, logMessage) => {
    // Use regex to remove the leading directory path components
    const cleanedPath = directoryPath.replace(/^.*retsjs\//, '');
    console.log(`${new Date(Date.now()).toLocaleString()}:${cleanedPath}: ${logMessage}`);
}

module.exports = createConsoleLog;

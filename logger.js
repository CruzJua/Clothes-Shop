const DEBUG = false; 

const debugLogger = (tag) => {
    return (...args) => {
        if (DEBUG) {
            console.log(`%c[${tag}]`, "color: cyan; font-weight: bold;", ...args);
        }
    };
};

module.exports = debugLogger;
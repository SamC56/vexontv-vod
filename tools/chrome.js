// Where the headless browser lives. Used by the layout suite and by the screenshot
// tool: CHROME_BIN wins, then the Playwright cache, then whatever is on PATH.
const fs = require("fs")
const os = require("os")
const path = require("path")

module.exports = function chrome() {
    if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN))
        return process.env.CHROME_BIN
    const cache = path.join(os.homedir(), ".cache/ms-playwright")
    if (fs.existsSync(cache)) {
        const found = fs
            .readdirSync(cache)
            .filter((name) => {
                return name.indexOf("chromium") === 0
            })
            .map((name) => {
                return path.join(cache, name, "chrome-headless-shell-linux64/chrome-headless-shell")
            })
            .filter((file) => {
                return fs.existsSync(file)
            })
        if (found.length) return found[0]
    }
    const paths = (process.env.PATH || "").split(":")
    for (const name of ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable"]) {
        for (const dir of paths) {
            const file = path.join(dir, name)
            if (fs.existsSync(file)) return file
        }
    }
    return null
}

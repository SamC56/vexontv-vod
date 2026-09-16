// The three suites print through here, so the output reads the same everywhere: one line
// per check, emoji, and a summary with the count and the time. Colour only on a terminal.
const color = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR && !process.env.CI

function paint(code, text) {
    return color ? `\u001b[${code}m${text}\u001b[0m` : text
}

module.exports = function report(title) {
    const started = Date.now()
    const failed = []
    let passed = 0
    let skipped = 0

    console.log(`\n${paint(1, `🧪 ${title}`)}\n`)

    return {
        check(label, condition, detail) {
            if (condition) {
                passed++
                console.log(`   ✅ ${label}`)
                return true
            }
            failed.push(label)
            console.log(`   ❌ ${label}${detail ? paint(2, `  →  ${detail}`) : ""}`)
            return false
        },

        // Something that is not a check but ruins the run: the file that will not load.
        fail(what, detail) {
            failed.push(what)
            console.log(`   ❌ ${what}${detail ? paint(2, `  →  ${detail}`) : ""}`)
        },

        skip(what) {
            skipped++
            console.log(`   ⏭️  ${paint(2, what)}`)
        },

        done() {
            const seconds = ((Date.now() - started) / 1000).toFixed(1)
            const counts = [`${passed} passed`]
            if (failed.length) counts.push(paint(31, `${failed.length} failed`))
            if (skipped) counts.push(`${skipped} skipped`)
            const mark = failed.length ? paint(31, "✖") : paint(32, "✔")
            console.log(
                `\n   ${mark} ${counts.join(paint(2, " · "))} ${paint(2, `· ${seconds}s`)}\n`,
            )
            if (failed.length) process.exitCode = 1
            // The suite ends here, not when the event loop empties: jsdom and the stubbed
            // fetch keep handles open and the run would hang. The empty write is the flush,
            // without it the last lines go missing when the output is piped.
            process.stdout.write("", () => process.exit(process.exitCode || 0))
        },
    }
}

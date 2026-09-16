// Refuses npm and yarn: they would write their own lockfile, and this repo has pnpm's.
const agent = process.env.npm_config_user_agent || ""

if (!agent.startsWith("pnpm/")) {
    console.error(`\nThis repo is installed with pnpm, not ${agent.split("/")[0] || "unknown"}.\n`)
    console.error("    pnpm install\n")
    process.exit(1)
}

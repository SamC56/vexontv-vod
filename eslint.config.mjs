export default [
    {
        files: ["js/**/*.js", "test/**/*.js", "tools/*.mjs"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "script",
        },
        rules: {
            "no-var": "error",
            "prefer-const": "error",
            "prefer-template": "error",
            "prefer-arrow-callback": "error",
            "object-shorthand": ["error", "properties"],
        },
    },
]

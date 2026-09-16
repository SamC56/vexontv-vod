# Community packages manifest

VexonTV ships in the [Tizen community packages][community] bundle, which is the app list
Apps2Samsung installs from. Each app is one JSON file in their `packages/` folder.

## Submitting

1. Fork `Apps2Samsung/tizen-community-packages`.
2. Copy [`DvzZDev__VexonTV.json`](DvzZDev__VexonTV.json) into their `packages/` folder — the
   name is already the one they expect (owner, double underscore, repo) and the `repo` field
   already says `DvzZDev/VexonTV`, as long as the repository is public and named `VexonTV`.
3. Open the pull request. Their bot validates the file against `packages.schema.json`; a
   green check means it is ready, and the next bundle picks it up.

## Why `build` and not `release`

With `source: "build"` their CI checks the branch out and packages it with Tizen Studio, so
there is no release to cut and no binary to upload: the bundle always comes from `main`.
`skip_npm` is set because this project vendors its dependencies and the only entry in
`package.json` is jsdom, for the tests.

The manifest is valid against their schema (checked with `jsonschema` against the real
`packages.schema.json`).

## The other option

If you would rather ship a versioned artifact, tag a GitHub release with `VexonTV.wgt`
attached and use a `release` manifest instead:

```json
{
  "name": "VexonTV",
  "description": "Live TV player for Samsung Tizen TVs: M3U, Xtream Codes and Stalker portals, provider EPG and a remote-first interface.",
  "repo": "DvzZDev/VexonTV",
  "repo_label": "VexonTV",
  "source": "release",
  "branch": "main",
  "output_name": "VexonTV.wgt"
}
```

`release` and `build` are mutually exclusive: `release` takes `branch` plus `output_name`,
and nothing else.

[community]: https://github.com/Apps2Samsung/tizen-community-packages

# Publishing to the community packages

VexonTV ships in the [Tizen community packages][community] bundle, which is the app list
Apps2Samsung installs from. Each app is one JSON file in their `packages/` folder.

## Submitting

1. Fork `Apps2Samsung/tizen-community-packages`.
2. Add `packages/DvzZDev__VexonTV.json` with the manifest below — the file name is already
   the one they expect (owner, double underscore, repo), and it only works while the
   repository is public and named `VexonTV`.
3. Open the pull request. Their bot validates the file against `packages.schema.json`; a
   green check means it is ready, and the next bundle picks it up.

```json
{
  "name": "VexonTV",
  "description": "Live TV player for Samsung Tizen TVs: M3U, Xtream Codes and Stalker portals, provider EPG and a remote-first interface.",
  "repo": "DvzZDev/VexonTV",
  "repo_label": "VexonTV",
  "source": "build",
  "branch": "main",
  "skip_npm": true,
  "output_name": "VexonTV.wgt"
}
```

That manifest is valid against their schema (checked with `jsonschema` against the real
`packages.schema.json`).

## Why `build` and not `release`

With `source: "build"` their CI checks the branch out and packages it with Tizen Studio, so
there is no release to cut and no binary to upload: the bundle always comes from `main`.

`skip_npm` is not optional here. `package.json` carries a `preinstall` guard that aborts
anything that is not pnpm, so a CI step running `npm install` would fail the build; with
`skip_npm` their pipeline never touches a package manager. The app vendors its dependencies
anyway.

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

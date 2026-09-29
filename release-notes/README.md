# Release notes

One file per release, named exactly after the tag: `release-notes/v1.0.9.md`.

The release workflow **fails before it starts building** if the file for the tag is missing, so
notes get written deliberately instead of every release inheriting the same boilerplate.
`_install-instructions.md` is appended to every release automatically — it's the only shared
content.

## Writing them

The app renders the **first three lines** of the release body in its "update available" card
(**⚙️ Settings → Check for Updates**). Lead with whatever a user must know; supporting detail
below that is fine, since the release page shows all of it.

Keep it about the user's experience of the app, not about the pipeline.

Start from this:

```markdown
**<the one thing users need to know, in one sentence>**

<what changed and why it matters to them>

### ✨ New
- ...

### 🐛 Fixed
- ...
```

## Release checklist

The easy path does all of this for you:

```bash
npm run release -- 1.0.9
```

It bumps both version files, creates `release-notes/v1.0.9.md` from [`_template.md`](_template.md),
opens it in your editor (`$EDITOR`, otherwise notepad), runs the tests, then commits, tags and
pushes. It refuses to run on a dirty tree, off `main`, if the tag already exists, if the version
is not higher than the current one, or if the notes still contain the template marker.
`--dry-run` performs every local step but touches no git history.

By hand, the same steps are:

1. Bump `expo.version` in `client/app.json` **and** `version` in `client/package.json` — the
   workflow fails the release if the tag and `app.json` disagree.
2. Add `release-notes/v<version>.md` (and delete the `<!-- TODO: -->` line).
3. Commit and push.
4. Tag and push the tag: `git tag v1.0.9 && git push origin v1.0.9`

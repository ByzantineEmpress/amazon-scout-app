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

1. Bump `expo.version` in `client/app.json` **and** `version` in `client/package.json` — the
   workflow fails the release if the tag and `app.json` disagree.
2. Add `release-notes/v<version>.md`.
3. Commit and push.
4. Tag and push the tag: `git tag v1.0.9 && git push origin v1.0.9`

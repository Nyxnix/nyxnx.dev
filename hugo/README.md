# Hugo posts

This folder powers the blog at `/posts/`.

## Local preview

```bash
npm run dev:hugo
```

Run `npm run dev` in a second terminal for the React app.
The React `Posts` tab fetches `/posts/index.json` from Hugo.

## Create a post

```bash
hugo new --source ./hugo posts/my-post.md
```

Then edit the front matter in `hugo/content/posts/my-post.md` and set:

- `draft = false`
- `summary = "..."`

## Build for GitHub Pages

```bash
npm run build:site
```

This builds:

- your React dashboard into `docs/`
- your Hugo blog into `docs/posts/`

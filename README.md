# test-manager-creator-ui

Simple UI for the Test Manager API. Pure HTML / CSS / vanilla JS + anime.js (loaded from CDN).
No build step required.

## Files
- `index.html` – page layout (tree on the left, details on the right, toolbar on top)
- `style.css`  – minimal styles
- `app.js`     – lazy-loaded tree, detail panel, placeholder create/update functions

## Run
Open `index.html` directly in a browser, or serve the folder:

```
python3 -m http.server 8080
```

Then visit http://localhost:8080.

## Backend
Base URL is configured in `app.js`:

```
const API_BASE = "http://192.128.10.230:11000";
```

The page calls these endpoints lazily as the user expands the tree:

- `GET /cb/projects`
- `GET /cb/projects/list-trackers?project_id={id}`
- `GET /cb/trackers/list-children?tracker_id={id}`
- `GET /cb/items/children-items-in-item?item_id={id}`
- `GET /cb/items/fields?item_id={id}`

## Placeholders
`createTestcase`, `linkTestcaseToParent`, and `updateTestSteps` in `app.js`
are stubs that currently only `console.log` their arguments. Wire them up
to your backend when the APIs are ready.


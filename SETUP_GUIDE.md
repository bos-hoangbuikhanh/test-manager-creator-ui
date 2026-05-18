# Tree View Setup Guide

## Architecture

The tree view is now correctly integrated:

```
test-manager-creator-ui (Port 11000)
    └─ Frontend: HTML/CSS/JS (served on port 11000)
       └─ Calls backend APIs on → test-manager (Port 8082)
           └─ Backend: Codebeamer API endpoints
```

## Setup Steps

### 1. Start the Test Manager Backend

In a terminal, start the test-manager on port 8082:

```bash
cd /home/hoangb/BOS/test-manager
./run.sh 0.0.0.0 8082
# or: python execute.py
```

The backend should print: `Uvicorn running on http://0.0.0.0:8082`

### 2. Start the Test Manager Creator UI Frontend

In another terminal:

```bash
cd /home/hoangb/BOS/test-manager-creator-ui
python main.py
# or: uvicorn main:app --host 0.0.0.0 --port 11000
```

The frontend should print: `Uvicorn running on http://0.0.0.0:11000`

### 3. Open in Browser

Open your browser and go to:

```
http://localhost:11000
```

**Important**: Use `localhost` or your machine's IP address, NOT `0.0.0.0`

## Troubleshooting

### "Failed to Load Page" Error
- Check that BOTH services are running (backend on 8082, frontend on 11000)
- Use `http://localhost:11000` instead of `http://0.0.0.0:11000`
- Check firewall isn't blocking port 11000

### Tree Not Loading
- Verify test-manager backend is running on port 8082
- Check browser console (F12) for errors
- Verify Codebeamer API URL is correct in test-manager configuration

### Can't Connect from Another Machine
- Replace `localhost` with your machine's IP address
- Example: `http://192.168.1.100:11000`
- Make sure both ports (8082, 11000) are accessible

## Docker Alternative

### Build Docker Image

```bash
cd /home/hoangb/BOS/test-manager-creator-ui
sudo ./docker-run.sh
```

### Access
```
http://localhost:11000
```

## API Endpoints Used

The frontend calls these test-manager endpoints:

- `GET /cb/projects` - List projects
- `GET /cb/projects/list-trackers?project_id={id}` - List trackers
- `GET /cb/trackers/list-children?tracker_id={id}` - List tracker items
- `GET /cb/items/children-items-in-item?item_id={id}` - List item children
- `GET /cb/items/fields?item_id={id}` - Get item field values
- `POST /cc/trackers/create/items-in-tracker` - Create new testcase

## File Structure

```
test-manager-creator-ui/
├── main.py                              # FastAPI server (serves frontend)
├── index.html                           # Main UI page
├── app.js                               # Tree view logic (calls backend on port 8082)
├── style.css                            # Styling
├── Dockerfile                           # Docker image definition
└── docker-run.sh                        # Docker build/run script
```

## How It Works

1. **Frontend loads** (port 11000)
   - main.py serves HTML, CSS, JS files
   
2. **Browser runs app.js**
   - Sets API_BASE = "http://localhost:8082"
   - Calls test-manager endpoints on port 8082

3. **Tree view renders**
   - Loads projects automatically
   - Lazy loads trackers, items, testcases on expand
   - Shows details panel on selection

4. **Create testcase**
   - User clicks "+ Create Testcase"
   - Modal prompts for testcase name/description
   - Frontend calls POST /cc/trackers/create/items-in-tracker
   - Test-manager backend creates item in Codebeamer
   - Tree refreshes to show new testcase

## Development Notes

- No credentials stored in frontend (stateless)
- Simple HTML/CSS/JS, no build process needed
- Anime.js for smooth animations
- Single-file backend (main.py), minimal dependencies
- All API calls go through test-manager backend

## Next Steps

1. Run test-manager backend: `./run.sh 0.0.0.0 8082`
2. Run frontend: `python main.py`
3. Open: `http://localhost:11000`
4. Expand project/tracker nodes
5. Click to view details
6. Create testcases with "+ Create Testcase" button

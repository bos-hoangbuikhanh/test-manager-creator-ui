# Codebeamer Test Manager Creator UI - Unified

A single-page web application for managing Codebeamer test cases with a tree view interface.

## ✨ Features

- **Tree View**: Browse projects → trackers → items → testcases with lazy loading
- **Expand/Collapse**: Smooth animations with anime.js
- **Details Panel**: View selected item information and fields
- **Create Testcases**: Add new testcases with name and description
- **Icons**: Visual indicators for each node type (📁 📘 📄 ✅)
- **Responsive**: Works on desktop and tablet

## 🏗️ Architecture

**Single Unified Application** (Port 5000):
- Frontend: HTML/CSS/JavaScript (served from index.html)
- Backend: FastAPI endpoints that proxy to test-manager
- All in one: main.py + index.html + requirements.txt

```
Browser
  ↓
Port 5000: main.py (FastAPI)
  ├─ Serves: index.html (UI)
  └─ APIs: /api/projects, /api/trackers, etc.
      ↓
      Proxies to → test-manager backend (Port 8082)
      ↓
      Codebeamer API (http://cb.corp.bos-semi.com/cb/api/v3)
```

## 🚀 Quick Start

### Prerequisites
- Python 3.8+
- Test-manager backend running on port 8082

### 1. Start Test-Manager Backend
```bash
cd /home/hoangb/BOS/test-manager
./run.sh 0.0.0.0 8082
```

### 2. Start Creator UI (Port 5000)
```bash
cd /home/hoangb/BOS/test-manager-creator-ui
pip install -r requirements.txt
python main.py
```

### 3. Open Browser
```
http://localhost:5000
```

## 📋 Available Endpoints

### Frontend
- `GET /` - Serve index.html

### Backend APIs
- `GET /api/projects` - List all projects
- `GET /api/trackers?project_id={id}` - List trackers in project
- `GET /api/tracker-items?tracker_id={id}` - List items in tracker
- `GET /api/item-children?item_id={id}` - List children of item
- `GET /api/item-fields?item_id={id}` - Get item field values
- `POST /api/create-item` - Create new item in tracker

## 🐳 Docker Setup

### Build and Run
```bash
cd /home/hoangb/BOS/test-manager-creator-ui
sudo ./docker-run.sh
```

### Access
```
http://localhost:5000
```

### Stop Container
```bash
docker rm -f test-manager-creator-ui
```

## 📁 File Structure

```
test-manager-creator-ui/
├── main.py                 # Unified FastAPI server (backend + frontend)
├── index.html              # Single HTML page (UI + JavaScript + CSS)
├── requirements.txt        # Python dependencies
├── Dockerfile              # Docker image definition
├── docker-run.sh           # Docker build/run script
└── docker-kill.sh          # Docker cleanup script
```

## 🔧 How It Works

### Frontend (in index.html)
1. **HTML Structure**: Layout with tree panel and detail panel
2. **CSS Styling**: Minimal, responsive design
3. **JavaScript**: Tree view logic, API calls, event handling
4. **API Calls**: `fetch()` to local `/api/*` endpoints

### Backend (in main.py)
1. **Serve UI**: GET / returns index.html
2. **Proxy APIs**: `/api/*` endpoints call test-manager backend
3. **Error Handling**: Convert errors to user-friendly messages
4. **Single Port**: Everything on port 5000

### Tree Loading Flow
```
1. Load Page → /api/projects
2. User clicks expand → /api/trackers?project_id=X
3. User clicks expand → /api/tracker-items?tracker_id=Y
4. User clicks expand → /api/item-children?item_id=Z
5. User clicks item → /api/item-fields?item_id=Z
6. User clicks create → POST /api/create-item
```

## 🎯 Usage

### Viewing the Tree
1. Open http://localhost:5000
2. Tree loads with projects automatically
3. Click arrow (▶) next to any node to expand
4. Click on node name to view details

### Creating a Testcase
1. Expand project/tracker/item to find parent
2. Click on the item node (to select it)
3. Click "+ Create Testcase" button
4. Enter testcase name and description
5. Click Submit
6. Tree refreshes to show new testcase

### Refreshing a Node
1. Click on a node with children
2. Click "Refresh Children" button
3. Node collapses and reloads children

## 🔌 Configuration

### Change Test-Manager URL
Edit `TEST_MANAGER_BASE` in main.py:
```python
TEST_MANAGER_BASE = "http://localhost:8082"  # Default
# Change to: TEST_MANAGER_BASE = "http://192.168.1.100:8082"
```

### Change Default Testcase Tracker
Edit trackerId in index.html:
```javascript
async function createTestcase(parentId, testcaseName, description) {
  const trackerId = 238730;  // Change this
  ...
}
```

### Change Icons
Edit ICONS in index.html:
```javascript
const ICONS = {
  project: "📁",    // Change icon
  tracker: "📘",
  item: "📄",
  testcase: "✅",
};
```

## 🧹 Cleanup

### Remove Docker Container
```bash
docker rm -f test-manager-creator-ui
```

### Stop Python Process
```bash
pkill -f "python main.py"
```

## 📊 API Response Formats

### Project List
```json
{
  "projects": [
    {"id": 1, "name": "Project Name", ...}
  ]
}
```

### Tracker List
```json
{
  "trackers": [
    {"id": 2, "name": "Tracker Name", "trackerType": "Test Case", ...}
  ]
}
```

### Item List
```json
{
  "items": [
    {"id": 3, "name": "Item Name", "itemType": "...", ...}
  ]
}
```

## 🐛 Troubleshooting

### "Cannot reach test-manager backend"
- Verify test-manager is running: `netstat -ln | grep 8082`
- Check firewall allows localhost:8082
- Verify TEST_MANAGER_BASE in main.py is correct

### "Projects not loading"
- Check browser console (F12) for errors
- Verify Codebeamer API is accessible from test-manager
- Check network tab in DevTools to see API responses

### "Create testcase fails"
- Verify tracker ID is correct (238730 default)
- Check test-manager has /cc/trackers/create/items-in-tracker endpoint
- Verify permissions in Codebeamer

### "Tree not expanding"
- Check browser console for JavaScript errors
- Verify API responses are valid JSON
- Check that Codebeamer returns children correctly

## 📝 Development Notes

- **No Build Process**: HTML/CSS/JS all embedded, no webpack/build needed
- **No State Management**: Simple variable storage, no Redux/Vuex
- **Lightweight**: ~500 lines of code total
- **Dependencies**: FastAPI, uvicorn, httpx (that's it!)
- **Animations**: Anime.js via CDN (smooth, 60fps)

## 🎨 Customization

### Add New Tree Node Types
Edit `ICONS` and `isTestcase()` in index.html

### Change Styling
Edit `<style>` block in index.html

### Add New API Endpoints
1. Add endpoint in main.py
2. Add API call in index.html
3. Add tree logic if needed

### Change Animation Speed
Edit `duration` in `animateToggle()`:
```javascript
anime({
  targets: ul,
  duration: 220,  // Change this (milliseconds)
  ...
});
```

## 📞 Support

For issues:
1. Check browser console (F12)
2. Check API endpoint is accessible
3. Verify test-manager backend is running
4. Check network tab for API responses

## 📄 License

Same as parent project (BOS)

---

**Ready to go!** Run `python main.py` and open http://localhost:5000

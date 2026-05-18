# Quick Start & Testing Guide

## Setup

### 1. Install Dependencies
```bash
cd /home/hoangb/BOS/test-manager-creator-ui
pip install -r requirements.txt
```

### 2. Configure Backend URL
Edit `main.py` to set the correct Codebeamer API endpoint:
```python
BASE_URL = "http://cb.corp.bos-semi.com/cb/api/v3"
UI_BASE_URL = "http://cb.corp.bos-semi.com/cb"
```

### 3. Start Backend Server
```bash
# From test-manager-creator-ui directory
python main.py
# Server runs on http://localhost:11000
```

### 4. Access Frontend
Open browser to: `http://localhost:11000`

## Testing Tree View

### Test 1: Load Projects
1. Page loads automatically
2. Should see "Loading projects..." message
3. Projects appear in tree after API returns data
4. Each project shows icon (📁) and project name

### Test 2: Expand Project
1. Click arrow next to any project
2. Should show "Loading..." message
3. After moment, trackers appear indented under project
4. Arrow rotates 90° with smooth animation
5. Shows tracker icon (📘) and tracker name

### Test 3: Expand Tracker
1. Click arrow next to any tracker
2. Should show child items
3. Items show icon (📄) or testcase (✅)
4. Each node shows ID next to name

### Test 4: View Details
1. Click on any node (not the arrow)
2. Right panel updates with:
   - Node name and type
   - Node ID
   - API URL that was used
   - Link to Codebeamer
3. For items/testcases: shows "Fields" section with JSON data

### Test 5: Create Testcase
1. Select an item in tree (click it, not arrow)
2. Click "+ Create Testcase" button
3. Modal appears with fields:
   - Username (enter Codebeamer username)
   - Password (enter Codebeamer password)
   - Parent ID (read-only, auto-filled)
   - Testcase name
   - Description
4. Enter testcase name and click Submit
5. Should see success message with new testcase ID
6. Parent item node should refresh to show new testcase

### Test 6: Edit Test Steps
1. Select a testcase node
2. Click "Edit Test Steps" button
3. Modal appears with fields:
   - Username
   - Password
   - Testcase ID (read-only)
   - Steps textarea (one per line)
4. Enter steps and click Submit
5. Should see success message

### Test 7: Refresh Node
1. Select any node with children
2. Click "Refresh Children" button
3. Node should collapse/expand to reload children
4. Shows latest state from Codebeamer

### Test 8: Error Handling
1. Try to create testcase without username/password
2. Should show validation error
3. Try with wrong credentials
4. Should show Codebeamer API error
5. Try network error (stop backend)
6. Should show error message in tree

## Expected Tree Structure

```
Project
├─ Tracker 1
│  ├─ Item 1
│  │  └─ Testcase 1
│  │  └─ Testcase 2
│  └─ Item 2
└─ Tracker 2
   └─ Item 3
```

## Icons Legend
- 📁 Project - Top level container
- 📘 Tracker - Tracker for specific test type
- 📄 Item - Regular item/container
- ✅ Testcase - Leaf node, no children

## Troubleshooting

### "Error: Failed to fetch projects"
- Check backend is running: `http://localhost:11000/cb/projects`
- Check Codebeamer API URL in main.py
- Check network connectivity to Codebeamer

### "Error loading children"
- Check if node type is correctly detected
- Verify child API endpoint syntax
- Check Codebeamer API returns expected format

### Testcase creation fails
- Verify username/password are correct
- Check user has permissions in Codebeamer
- Verify parent_id is valid item ID
- Check TESTCASE_TRACKER_ID is correct

### Steps not updating
- Verify field IDs match Codebeamer schema
- Check TEST_STEPS_FIELD_ID and other field IDs
- Verify testcase is correct type

### Animation not smooth
- Check browser supports CSS transitions
- Verify anime.js CDN is accessible
- Check browser dev console for JS errors

## API Response Formats

### Expected project format
```json
{
  "projects": [
    {
      "id": 123,
      "name": "My Project",
      ...
    }
  ]
}
```

### Expected tracker format
```json
{
  "trackers": [
    {
      "id": 456,
      "name": "Test Tracker",
      "trackerType": "Test Case",
      ...
    }
  ]
}
```

### Expected item format
```json
{
  "items": [
    {
      "id": 789,
      "name": "Test Item",
      "itemType": "Test Case",
      ...
    }
  ]
}
```

## Developer Notes

### Extending Node Types
Edit `isTestcase()` function in app.js to detect custom types:
```javascript
function isTestcase(node) {
  const t = (node.type || node.itemType || node.trackerType || "") + "";
  return /test\s*case/i.test(t);
}
```

### Adding Custom Icons
Update `ICONS` object in app.js:
```javascript
const ICONS = {
  project: "📁",
  tracker: "📘",
  item: "📄",
  testcase: "✅",
  // add more...
};
```

### Changing Animation Duration
Edit `anime()` calls in `animateToggle()`:
```javascript
anime({
  targets: ul,
  height: [0, targetHeight],
  duration: 220,  // Change this
  easing: "easeOutQuad",
});
```

### Custom Field Mapping
Edit field IDs in main.py:
```python
TEST_STEPS_FIELD_ID = 1000000
ACTION_FIELD_ID = 1000001
# etc...
```

## Performance Tips
- Tree loads ~50 nodes/level smoothly
- Animations use GPU acceleration
- API calls are debounced (single request per click)
- Keep credential object for reuse
- Consider pagination for 100+ children

## Security Notes
- Username/password passed only to backend
- Backend uses HTTPS for Codebeamer (recommended)
- Never log credentials to console
- Consider using OAuth instead of basic auth
- Validate all inputs on backend

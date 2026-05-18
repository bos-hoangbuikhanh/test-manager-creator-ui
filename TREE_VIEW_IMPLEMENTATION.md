# Tree View Implementation - Codebeamer Test Manager

## Overview
A fully functional tree view UI with lazy loading for navigating Codebeamer projects, trackers, items, and testcases. The implementation follows a clean, minimal architecture without over-engineering.

## Architecture

### Frontend (app.js)
- **Lazy Loading**: Each node loads children only when expanded
- **Tree Structure**: Project → Tracker → Item → Testcase
- **Animations**: Smooth expand/collapse using anime.js
- **Selection**: Click any node to view details on the right panel
- **Credentials**: Prompted when creating/updating testcases

### Backend (main.py)
- **Proxy Endpoints**: Pass-through to Codebeamer API (GET requests)
- **Create/Update**: Dedicated endpoints for testcase operations
- **Authentication**: HTTP Basic Auth with Codebeamer API
- **Error Handling**: Comprehensive error messages to frontend

## API Endpoints

### GET Endpoints (Read-only, no auth required)
```
GET /cb/projects
GET /cb/projects/list-trackers?project_id={projectId}
GET /cb/trackers/list-children?tracker_id={trackerId}
GET /cb/items/children-items-in-item?item_id={itemId}
GET /cb/items/fields?item_id={itemId}
```

### POST Endpoints (Require authentication)
```
POST /api/testcases/create
  - username: string
  - password: string
  - parent_id: int
  - testcase_name: string
  - description: string (optional)

POST /api/testcases/update-steps
  - username: string
  - password: string
  - testcase_id: int
  - steps: array of {action, expected_result, critical, id}
```

## UI Components

### Left Panel - Tree View
- **Expandable nodes** with arrow indicator (▶/▼)
- **Icons** for node types:
  - 📁 Project
  - 📘 Tracker
  - 📄 Item
  - ✅ Testcase
- **Node labels** showing name and ID
- **Indentation** for visual hierarchy
- **Hover effects** for better UX
- **Selection highlighting** with blue background

### Right Panel - Details View
- **Node Information**: ID, Type, API URL
- **Codebeamer Link**: Direct link to item in Codebeamer
- **Fields Display**: JSON view of all item fields (for items/testcases)
- **Loading States**: Visual feedback during data fetches

### Toolbar Buttons
- **+ Create Testcase**: Modal dialog to create new testcase under selected node
- **Edit Test Steps**: Modal dialog to update test steps for selected testcase
- **Refresh Children**: Reload children of selected node

## Key Features

### 1. Lazy Loading
- Projects load on page initialization
- Children load only when user expands a node
- Loading states prevent multiple simultaneous requests
- Error handling with user-friendly messages

### 2. Smooth Animations
- Expand/collapse uses anime.js for smooth height transitions
- Arrow rotates 90° when expanded
- Opacity fades in/out with content

### 3. Node Detection
- Automatically detects node type based on API response
- Smart naming: uses available field (name, label, title) with fallback to ID
- Type detection: identifies testcases vs regular items

### 4. Child Loading Strategy
```
project (children = trackers)
  └─ tracker (children = items)
      └─ item (children = items or testcases)
          └─ testcase (leaf node, no children)
```

### 5. Error Resilience
- Network errors show user-friendly messages
- Empty children states show "(no children)" message
- Failed API calls display error details
- Credentials validation before POST operations

## Code Organization

### Frontend Structure (app.js)
1. **Configuration**: API base, icons, Codebeamer URLs
2. **API Layer**: Fetch wrapper, endpoint definitions
3. **Data Normalization**: Convert API responses to tree nodes
4. **Tree Rendering**: DOM creation, event listeners
5. **Animation**: anime.js integration
6. **Selection & Details**: Node selection, detail panel
7. **Modal Dialogs**: Forms for create/update
8. **Toolbar**: Button handlers
9. **Initialization**: Load projects on page load

### Backend Structure (main.py)
1. **Configuration**: Base URLs, field IDs, tracker IDs
2. **Helper Functions**: Create testcase, update steps
3. **Request Models**: Pydantic models for validation
4. **GET Endpoints**: Proxy to Codebeamer API
5. **POST Endpoints**: Create and update operations
6. **Error Handling**: HTTP exceptions with details
7. **Static Files**: Serve HTML/CSS/JS

## Styling (style.css)
- **Flexbox Layout**: Two-column responsive design
- **Tree Styling**: Padding-based indentation, hover effects
- **Animations**: Transitions for arrow rotation and opacity
- **Colors**: Professional blue theme (#2c3e50, #3498db)
- **Responsive**: Works on desktop and tablet sizes

## Data Flow Example

### Expanding a Project Node
1. User clicks arrow next to project
2. JavaScript detects click, checks if children loaded
3. If not loaded: show "Loading..." placeholder
4. Fetch `GET /cb/projects/list-trackers?project_id=123`
5. Receive tracker list from Codebeamer API
6. Render tracker nodes under project
7. Animate expand with anime.js
8. Update selected node with new API URL

### Creating a Testcase
1. User selects parent item and clicks "+ Create Testcase"
2. Modal prompts for username, password, name, description
3. User submits form
4. Frontend validates inputs
5. POST to `/api/testcases/create` with credentials
6. Backend authenticates with Codebeamer API
7. Creates testcase under parent via Codebeamer API
8. Returns testcase ID and URL
9. Frontend shows success message
10. Refresh parent node to show new testcase

## Configuration

### Backend (main.py)
- `BASE_URL`: Codebeamer API v3 endpoint
- `UI_BASE_URL`: Codebeamer UI base for issue links
- `TESTCASE_TRACKER_ID`: Tracker ID for testcases
- Field IDs: Custom field IDs for test steps

### Frontend (app.js)
- `API_BASE`: Backend service URL (http://localhost:11000)
- `CB_ITEM_URL`: Function to generate Codebeamer item URLs
- `ICONS`: Emoji icons for node types

## Browser Compatibility
- Modern browsers with ES6 support
- Fetch API for HTTP requests
- Flexbox for layout
- anime.js for animations (CDN)

## Performance Considerations
- Lazy loading prevents loading entire tree
- Minimal DOM manipulation during rendering
- Efficient event delegation on tree nodes
- Debounced API calls (no duplicate requests for same node)
- Single credential object to reduce re-prompting

## Future Enhancements
- Persist user credentials in session storage
- Add search/filter functionality
- Keyboard navigation (arrow keys, enter)
- Right-click context menu
- Drag-and-drop to reorder
- Pagination for large datasets
- Tree node caching
- Multi-select for batch operations

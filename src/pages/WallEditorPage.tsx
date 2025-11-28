import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import styles from './WallEditorPage.module.css';
import {
  ChevronLeft,
  Save,
  Undo2,
  Redo2,
  Eraser,
  Ruler,
  PenTool,
  Eye,
  Search,
  Filter,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Maximize2,
  Minimize2,
  BoxSelect,
  MousePointer2,
  Square,
  Circle,
  Type,
  Move,
  Layers,
  Grid,
  Settings,
  Image as ImageIcon,
  Box,
  Sun,
  Lightbulb,
  Palette,
  Star,
  User,
  ArrowUpRight,
  GripVertical,
  Spline,
  SlidersHorizontal,
  Trash2
} from 'lucide-react';

interface WallData {
  wallId: string;
  dimensions: { width: number; height: number };
  faceNormal: { x: number; y: number; z: number };
  customizations?: {
    molding?: string;
    texture?: string;
    baseboard?: string;
  };
}

interface MoldingItem {
  id: string;
  name: string;
  thumbnail: string;
  category: string;
}

const MOLDING_CATEGORIES = [
  { id: 'molding', name: 'Molding', icon: <BoxSelect size={18} /> },
  { id: 'baseboard', name: 'Baseboard', icon: <Layers size={18} /> },
  { id: 'cornice', name: 'Cornice', icon: <ArrowUpRight size={18} /> },
  { id: 'decorative', name: 'Deco', icon: <Star size={18} /> },
  { id: 'sunAngle', name: 'Sun Angle', icon: <Sun size={18} /> },
  { id: 'lightBand', name: 'Light Band', icon: <Lightbulb size={18} /> },
  { id: 'texture', name: 'Texture', icon: <Palette size={18} /> },
  { id: 'premium', name: 'Premium', icon: <Box size={18} /> },
  { id: 'my', name: 'My Library', icon: <User size={18} /> },
];

// Sample molding items
const SAMPLE_MOLDINGS: MoldingItem[] = [
  { id: 'm1', name: 'Classic Molding 1', thumbnail: '', category: 'molding' },
  { id: 'm2', name: 'Classic Molding 2', thumbnail: '', category: 'molding' },
  { id: 'm3', name: 'Modern Molding 1', thumbnail: '', category: 'molding' },
  { id: 'm4', name: 'Wood Molding', thumbnail: '', category: 'molding' },
  { id: 'm5', name: 'Simple Molding 1', thumbnail: '', category: 'molding' },
  { id: 'm6', name: 'Simple Molding 2', thumbnail: '', category: 'molding' },
  { id: 'm7', name: 'Deco Molding 1', thumbnail: '', category: 'molding' },
  { id: 'm8', name: 'Deco Molding 2', thumbnail: '', category: 'molding' },
  { id: 'm9', name: 'Marble Texture', thumbnail: '', category: 'texture' },
  { id: 'm10', name: 'Wood Texture', thumbnail: '', category: 'texture' },
];

export default function WallEditorPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const wallIdParam = searchParams.get('wallId');

  const [wallData, setWallData] = useState<WallData | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('molding');
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [isWallSelected, setIsWallSelected] = useState(false);
  const totalPages = 5;

  // Load wall data from localStorage on mount
  useEffect(() => {
    const savedData = localStorage.getItem('wallEditorData');
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData) as WallData;
        setWallData(parsed);
      } catch (e) {
        console.error('Failed to parse wall data:', e);
      }
    }
  }, []);

  const filteredItems = SAMPLE_MOLDINGS.filter(
    item => item.category === selectedCategory || selectedCategory === 'molding'
  );

  const handleBack = () => {
    navigate('/editor');
  };

  const handleSave = () => {
    if (wallData) {
      // Save customizations back to localStorage
      const updatedData = {
        ...wallData,
        customizations: {
          ...wallData.customizations,
          [selectedCategory]: selectedItem
        }
      };
      localStorage.setItem('wallEditorData', JSON.stringify(updatedData));

      // Also save to a wall-specific key for persistence
      localStorage.setItem(`wall_${wallData.wallId}`, JSON.stringify(updatedData));
    }
    navigate('/editor');
  };

  const handleItemSelect = (itemId: string) => {
    setSelectedItem(itemId);
  };

  // Get wall dimensions (in mm)
  const wallWidth = wallData?.dimensions?.width || 0;
  const wallHeight = wallData?.dimensions?.height || 0;

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <button className={styles.backButton} onClick={handleBack}>
            <ChevronLeft size={20} />
            <span>Wall Editor</span>
          </button>
        </div>

        <div className={styles.headerCenter}>
          <span className={styles.wallIdDisplay}>{wallData?.wallId || 'No Wall Selected'}</span>
        </div>

        <div className={styles.headerActions}>
          <button className={styles.headerBtn} onClick={handleSave} title="Save">
            <Save size={18} />
            <span>Save</span>
          </button>
          <div className={styles.divider}></div>
          <button className={styles.iconBtn} title="Undo">
            <Undo2 size={18} />
          </button>
          <button className={styles.iconBtn} title="Redo">
            <Redo2 size={18} />
          </button>
          <div className={styles.divider}></div>
          <button className={styles.iconBtn} title="Clear">
            <Eraser size={18} />
          </button>
          <button className={styles.iconBtn} title="Guides">
            <Ruler size={18} />
          </button>
          <button className={styles.iconBtn} title="Tools">
            <PenTool size={18} />
          </button>
          <button className={styles.iconBtn} title="View">
            <Eye size={18} />
          </button>
        </div>
      </header>

      <div className={styles.mainContent}>
        {/* Left Sidebar - Categories & Items */}
        <aside className={styles.leftSidebar}>
          <div className={styles.sidebarTabs}>
            <button className={`${styles.tab} ${styles.tabActive}`}>Materials</button>
            <button className={styles.tab}>Properties</button>
          </div>

          <div className={styles.searchBar}>
            <Search size={16} className={styles.searchIcon} />
            <input type="text" placeholder="Search materials..." />
            <button className={styles.filterBtn}>
              <Filter size={14} />
            </button>
          </div>

          <div className={styles.sidebarContent}>
            {/* Category List */}
            <nav className={styles.categoryList}>
              {MOLDING_CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  className={`${styles.categoryItem} ${selectedCategory === cat.id ? styles.categoryActive : ''}`}
                  onClick={() => setSelectedCategory(cat.id)}
                >
                  <span className={styles.categoryIcon}>{cat.icon}</span>
                  <span className={styles.categoryName}>{cat.name}</span>
                </button>
              ))}
            </nav>

            {/* Item Grid */}
            <div className={styles.itemSection}>
              <div className={styles.sectionHeader}>
                <span>{MOLDING_CATEGORIES.find(c => c.id === selectedCategory)?.name}</span>
                <span className={styles.itemCount}>{filteredItems.length} items</span>
              </div>
              <div className={styles.itemGrid}>
                {filteredItems.map(item => (
                  <div
                    key={item.id}
                    className={`${styles.itemCard} ${selectedItem === item.id ? styles.itemSelected : ''}`}
                    onClick={() => handleItemSelect(item.id)}
                  >
                    <div className={styles.itemThumbnail}>
                      {item.thumbnail ? (
                        <img src={item.thumbnail} alt={item.name} />
                      ) : (
                        <div className={styles.placeholderThumb}>
                          <ImageIcon size={24} color="#555" />
                        </div>
                      )}
                    </div>
                    <div className={styles.itemName}>{item.name}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Pagination */}
          <div className={styles.pagination}>
            <button className={styles.pageBtn} onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
              <ChevronLeftIcon size={16} />
            </button>
            <span className={styles.pageInfo}>{currentPage} / {totalPages}</span>
            <button className={styles.pageBtn} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
              <ChevronRightIcon size={16} />
            </button>
          </div>
        </aside>

        {/* Center - 2D View */}
        <main className={styles.centerPanel}>
          {/* Drawing Tools */}
          <div className={styles.drawingTools}>
            <button className={styles.toolBtn} title="Select">
              <MousePointer2 size={20} />
            </button>
            <div className={styles.toolDivider}></div>
            <button className={styles.toolBtn} title="Line (L)">
              <PenTool size={20} />
            </button>
            <button className={styles.toolBtn} title="Rectangle (R)">
              <Square size={20} />
            </button>
            <button className={styles.toolBtn} title="Circle (C)">
              <Circle size={20} />
            </button>
            <button className={styles.toolBtn} title="Text (T)">
              <Type size={20} />
            </button>
            <div className={styles.toolDivider}></div>
            <button className={styles.toolBtn} title="Move (M)">
              <Move size={20} />
            </button>
          </div>

          {/* 2D Canvas Area */}
          <div className={styles.canvasArea}>
            {wallData ? (
              <div className={styles.canvasWrapper}>
                <svg className={styles.wallPreview} viewBox="0 0 600 400">
                  <defs>
                    <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                      <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#333" strokeWidth="0.5" />
                    </pattern>
                  </defs>
                  <rect
                    width="100%"
                    height="100%"
                    fill="url(#grid)"
                    onClick={() => setIsWallSelected(false)}
                    style={{ cursor: 'default' }}
                  />

                  {/* Wall outline */}
                  <rect
                    x="50"
                    y="50"
                    width="500"
                    height="280"
                    fill="#2a2a2a"
                    stroke={isWallSelected ? "#2196f3" : "#4caf50"}
                    strokeWidth={isWallSelected ? 3 : 2}
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsWallSelected(true);
                    }}
                  />

                  {/* Wall Toolbar - appears when wall is selected */}
                  {isWallSelected && (
                    <foreignObject x="430" y="55" width="115" height="36">
                      <div className={styles.wallToolbar}>
                        <button className={styles.wallToolbarBtn} title="Grid">
                          <GripVertical size={16} />
                        </button>
                        <button className={styles.wallToolbarBtn} title="Edit Points">
                          <Spline size={16} />
                        </button>
                        <button className={styles.wallToolbarBtn} title="Adjust">
                          <SlidersHorizontal size={16} />
                        </button>
                        <button className={styles.wallToolbarBtn} title="Delete">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </foreignObject>
                  )}

                  {/* Top dimension */}
                  <line x1="50" y1="30" x2="550" y2="30" stroke="#666" strokeWidth="1" />
                  <line x1="50" y1="25" x2="50" y2="35" stroke="#666" strokeWidth="1" />
                  <line x1="550" y1="25" x2="550" y2="35" stroke="#666" strokeWidth="1" />
                  <rect x="270" y="12" width="60" height="16" rx="4" fill="#1a1a1a" />
                  <text x="300" y="24" textAnchor="middle" fontSize="10" fill="#aaa">{wallWidth} mm</text>

                  {/* Left dimension */}
                  <line x1="30" y1="50" x2="30" y2="330" stroke="#666" strokeWidth="1" />
                  <line x1="25" y1="50" x2="35" y2="50" stroke="#666" strokeWidth="1" />
                  <line x1="25" y1="330" x2="35" y2="330" stroke="#666" strokeWidth="1" />
                  <rect x="5" y="180" width="16" height="60" rx="4" fill="#1a1a1a" />
                  <text x="15" y="210" textAnchor="middle" fontSize="10" fill="#aaa" transform="rotate(-90, 15, 210)">{wallHeight} mm</text>

                  {/* Right dimension */}
                  <line x1="570" y1="50" x2="570" y2="330" stroke="#666" strokeWidth="1" />
                  <line x1="565" y1="50" x2="575" y2="50" stroke="#666" strokeWidth="1" />
                  <line x1="565" y1="330" x2="575" y2="330" stroke="#666" strokeWidth="1" />
                  <rect x="575" y="180" width="16" height="60" rx="4" fill="#1a1a1a" />
                  <text x="585" y="210" textAnchor="middle" fontSize="10" fill="#aaa" transform="rotate(90, 585, 210)">{wallHeight} mm</text>

                  {/* Bottom dimension */}
                  <line x1="50" y1="350" x2="550" y2="350" stroke="#666" strokeWidth="1" />
                  <line x1="50" y1="345" x2="50" y2="355" stroke="#666" strokeWidth="1" />
                  <line x1="550" y1="345" x2="550" y2="355" stroke="#666" strokeWidth="1" />
                  <rect x="270" y="362" width="60" height="16" rx="4" fill="#1a1a1a" />
                  <text x="300" y="374" textAnchor="middle" fontSize="10" fill="#aaa">{wallWidth} mm</text>

                  {/* Wall ID label */}
                  <text x="300" y="190" textAnchor="middle" fontSize="14" fill="#666" fontWeight="bold">
                    {wallData.wallId}
                  </text>
                </svg>
              </div>
            ) : (
              <div className={styles.noWallData}>
                <p>No wall data loaded</p>
                <button onClick={handleBack}>Return to Editor</button>
              </div>
            )}
          </div>

          {/* Bottom Controls */}
          <div className={styles.bottomControls}>
            <div className={styles.viewControls}>
              <button className={styles.viewBtnActive}>
                <Layers size={16} />
                <span>2D View</span>
              </button>
              <button className={styles.viewBtn}>
                <Box size={16} />
                <span>3D View</span>
              </button>
            </div>

            <div className={styles.zoomControls}>
              <button className={styles.zoomBtn}><Minimize2 size={16} /></button>
              <div className={styles.zoomSliderWrapper}>
                <input type="range" className={styles.zoomSlider} />
              </div>
              <button className={styles.zoomBtn}><Maximize2 size={16} /></button>
              <span className={styles.zoomValue}>100%</span>
            </div>
          </div>
        </main>

        {/* Right Sidebar - Preview & Properties */}
        <aside className={styles.rightSidebar}>
          <div className={styles.previewSection}>
            <div className={styles.sidebarHeader}>
              <span>3D Preview</span>
              <button className={styles.expandBtn}><Maximize2 size={14} /></button>
            </div>
            <div className={styles.previewCanvas}>
              {/* 3D Preview would go here */}
              <div className={styles.previewPlaceholder}>
                <Box size={48} color="#444" />
                <span>No Preview Available</span>
              </div>
            </div>
          </div>

          <div className={styles.propertiesSection}>
            <div className={styles.sidebarHeader}>
              <span>Properties</span>
              <Settings size={14} />
            </div>
            <div className={styles.propertiesContent}>
              {wallData ? (
                <div className={styles.wallProperties}>
                  <div className={styles.propertyGroup}>
                    <label>Wall ID</label>
                    <div className={styles.propertyValue}>{wallData.wallId}</div>
                  </div>
                  <div className={styles.propertyRow}>
                    <div className={styles.propertyGroup}>
                      <label>Width</label>
                      <div className={styles.propertyValue}>{wallWidth} mm</div>
                    </div>
                    <div className={styles.propertyGroup}>
                      <label>Height</label>
                      <div className={styles.propertyValue}>{wallHeight} mm</div>
                    </div>
                  </div>

                  {selectedItem && (
                    <div className={styles.propertyGroup}>
                      <label>Selected Material</label>
                      <div className={styles.propertyValueHighlight}>{selectedItem}</div>
                    </div>
                  )}
                </div>
              ) : (
                <div className={styles.noSelection}>
                  <MousePointer2 size={32} color="#444" />
                  <span>Select an object to view properties</span>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

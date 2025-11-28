import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import styles from './WallEditorPage.module.css';

interface MoldingItem {
  id: string;
  name: string;
  thumbnail: string;
  category: string;
}

const MOLDING_CATEGORIES = [
  { id: 'molding', name: '몰딩', icon: '▭' },
  { id: 'baseboard', name: '받침대', icon: '▭' },
  { id: 'cornice', name: '코니스', icon: '▭' },
  { id: 'decorative', name: '장식 몰딩', icon: '◈' },
  { id: 'sunAngle', name: '태양 각도선', icon: '☀' },
  { id: 'lightBand', name: '라이트 밴드', icon: '💡' },
  { id: 'texture', name: '질감', icon: '▤' },
  { id: 'premium', name: '프리미엄 텍스처', icon: '★' },
  { id: 'my', name: '나의', icon: '👤' },
];

// Sample molding items
const SAMPLE_MOLDINGS: MoldingItem[] = [
  { id: 'm1', name: '클래식 몰딩 1', thumbnail: '', category: 'molding' },
  { id: 'm2', name: '클래식 몰딩 2', thumbnail: '', category: 'molding' },
  { id: 'm3', name: '모던 몰딩 1', thumbnail: '', category: 'molding' },
  { id: 'm4', name: '우드 몰딩', thumbnail: '', category: 'molding' },
  { id: 'm5', name: '심플 몰딩 1', thumbnail: '', category: 'molding' },
  { id: 'm6', name: '심플 몰딩 2', thumbnail: '', category: 'molding' },
  { id: 'm7', name: '장식 몰딩 1', thumbnail: '', category: 'molding' },
  { id: 'm8', name: '장식 몰딩 2', thumbnail: '', category: 'molding' },
  { id: 'm9', name: '대리석 텍스처', thumbnail: '', category: 'texture' },
  { id: 'm10', name: '우드 텍스처', thumbnail: '', category: 'texture' },
];

export default function WallEditorPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const wallId = searchParams.get('wallId');

  const [selectedCategory, setSelectedCategory] = useState('molding');
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [wallDimensions] = useState({ width: 5563, height: 2800 });
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = 5;

  const filteredItems = SAMPLE_MOLDINGS.filter(
    item => item.category === selectedCategory || selectedCategory === 'molding'
  );

  const handleBack = () => {
    navigate('/editor');
  };

  const handleSave = () => {
    // TODO: Save wall customization
    console.log('Saving wall customization...');
    navigate('/editor');
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <button className={styles.backButton} onClick={handleBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
          </svg>
          완성 벽 커스터마이즈
        </button>

        <div className={styles.headerActions}>
          <button className={styles.headerBtn} title="저장">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/>
            </svg>
            저장
          </button>
          <button className={styles.headerBtn} title="실행 취소">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/>
            </svg>
          </button>
          <button className={styles.headerBtn} title="다시 실행">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z"/>
            </svg>
          </button>
          <span className={styles.divider}></span>
          <button className={styles.headerBtn} title="지우기">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
            </svg>
            지우기
          </button>
          <span className={styles.divider}></span>
          <button className={styles.headerBtn}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 3h8v2H5v14h14v-6h2v8H3V3zm16 0h-6v2h4.59L9.3 13.29l1.41 1.41L19 6.41V11h2V3z"/>
            </svg>
            가이드 라인
          </button>
          <button className={styles.headerBtn}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/>
            </svg>
            도구
          </button>
          <button className={styles.headerBtn}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
            </svg>
            보기
          </button>
        </div>
      </header>

      <div className={styles.mainContent}>
        {/* Left Sidebar - Categories & Items */}
        <aside className={styles.leftSidebar}>
          <div className={styles.sidebarTabs}>
            <span className={styles.tabActive}>몰딩</span>
            <span className={styles.tab}>받침대</span>
            <span className={styles.searchTag}>검색어 다국어 지원 ×</span>
          </div>

          <div className={styles.searchBar}>
            <input type="text" placeholder="현재 카테고리 검색" />
            <button className={styles.searchBtn}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
              </svg>
            </button>
            <button className={styles.filterBtn}>1↓</button>
          </div>

          <div className={styles.brandFilter}>
            <span>브랜드</span>
            <select>
              <option>전체</option>
            </select>
          </div>

          {/* Category List */}
          <nav className={styles.categoryList}>
            {MOLDING_CATEGORIES.map(cat => (
              <button
                key={cat.id}
                className={`${styles.categoryItem} ${selectedCategory === cat.id ? styles.categoryActive : ''}`}
                onClick={() => setSelectedCategory(cat.id)}
              >
                <span className={styles.categoryIcon}>{cat.icon}</span>
                <span>{cat.name}</span>
              </button>
            ))}
          </nav>

          {/* Item Grid */}
          <div className={styles.itemGrid}>
            {filteredItems.map(item => (
              <div
                key={item.id}
                className={`${styles.itemCard} ${selectedItem === item.id ? styles.itemSelected : ''}`}
                onClick={() => setSelectedItem(item.id)}
              >
                <div className={styles.itemThumbnail}>
                  {item.thumbnail ? (
                    <img src={item.thumbnail} alt={item.name} />
                  ) : (
                    <div className={styles.placeholderThumb}></div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          <div className={styles.pagination}>
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>&lt;</button>
            <input
              type="number"
              value={currentPage}
              onChange={e => setCurrentPage(Number(e.target.value))}
              min={1}
              max={totalPages}
            />
            <span>/{totalPages}</span>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}>&gt;</button>
          </div>
        </aside>

        {/* Center - 2D View */}
        <main className={styles.centerPanel}>
          {/* Drawing Tools */}
          <div className={styles.drawingTools}>
            <button className={styles.toolBtn} title="선(L)">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M4 20L20 4" stroke="currentColor" strokeWidth="2"/>
              </svg>
              <span>선(L)</span>
            </button>
            <button className={styles.toolBtn} title="직사각형(R)">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18"/>
              </svg>
              <span>직사각형(R)</span>
            </button>
            <button className={styles.toolBtn} title="다각형(P)">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="12,2 22,8 22,16 12,22 2,16 2,8"/>
              </svg>
              <span>다각형(P)</span>
            </button>
            <button className={styles.toolBtn} title="원(C)">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
              </svg>
              <span>원(C)</span>
            </button>
            <button className={styles.toolBtn} title="필릿(F)">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 21V3h4v14h14v4H3z"/>
              </svg>
              <span>필릿(F)</span>
            </button>
            <button className={styles.toolBtn} title="오프셋(O)">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="12" height="12"/>
                <rect x="9" y="9" width="12" height="12"/>
              </svg>
              <span>오프셋(O)</span>
            </button>
          </div>

          {/* 2D Canvas Area */}
          <div className={styles.canvasArea}>
            <svg className={styles.wallPreview} viewBox="0 0 600 400">
              {/* Wall outline */}
              <rect
                x="50"
                y="50"
                width="500"
                height="280"
                fill="none"
                stroke="#333"
                strokeWidth="2"
              />

              {/* Dimension lines */}
              <line x1="50" y1="30" x2="550" y2="30" stroke="#666" strokeWidth="1" />
              <line x1="50" y1="25" x2="50" y2="35" stroke="#666" strokeWidth="1" />
              <line x1="550" y1="25" x2="550" y2="35" stroke="#666" strokeWidth="1" />
              <text x="300" y="20" textAnchor="middle" fontSize="12" fill="#666">{wallDimensions.width}</text>

              <line x1="30" y1="50" x2="30" y2="330" stroke="#666" strokeWidth="1" />
              <line x1="25" y1="50" x2="35" y2="50" stroke="#666" strokeWidth="1" />
              <line x1="25" y1="330" x2="35" y2="330" stroke="#666" strokeWidth="1" />
              <text x="15" y="195" textAnchor="middle" fontSize="12" fill="#666" transform="rotate(-90, 15, 195)">{wallDimensions.height}</text>

              <line x1="570" y1="50" x2="570" y2="330" stroke="#666" strokeWidth="1" />
              <line x1="565" y1="50" x2="575" y2="50" stroke="#666" strokeWidth="1" />
              <line x1="565" y1="330" x2="575" y2="330" stroke="#666" strokeWidth="1" />
              <text x="585" y="195" textAnchor="middle" fontSize="12" fill="#666" transform="rotate(90, 585, 195)">{wallDimensions.height}</text>

              <line x1="50" y1="350" x2="550" y2="350" stroke="#666" strokeWidth="1" />
              <line x1="50" y1="345" x2="50" y2="355" stroke="#666" strokeWidth="1" />
              <line x1="550" y1="345" x2="550" y2="355" stroke="#666" strokeWidth="1" />
              <text x="300" y="370" textAnchor="middle" fontSize="12" fill="#666">{wallDimensions.width}</text>

              {/* Height indicator */}
              <text x="530" y="320" fontSize="10" fill="#666">높이 0</text>
            </svg>
          </div>

          {/* Bottom Controls */}
          <div className={styles.bottomControls}>
            <div className={styles.viewControls}>
              <button className={styles.viewBtn}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                </svg>
              </button>
              <span className={styles.viewLabel}>2D</span>
              <span className={styles.viewNum}>1</span>
            </div>
            <div className={styles.directionControl}>
              <span>방향</span>
              <span>4</span>
              <button className={styles.directionBtn}>↻</button>
            </div>
            <div className={styles.zoomControls}>
              <button className={styles.lockBtn}>🔒</button>
              <button className={styles.fitBtn}>⬜</button>
              <button className={styles.zoomOutBtn}>−</button>
              <input type="range" className={styles.zoomSlider} />
              <button className={styles.zoomInBtn}>+</button>
            </div>
          </div>
        </main>

        {/* Right Sidebar - Preview & Properties */}
        <aside className={styles.rightSidebar}>
          <div className={styles.previewSection}>
            <div className={styles.previewHeader}>
              <span>로밍 뷰</span>
              <button className={styles.expandBtn}>↗</button>
              <span>방 선택</span>
            </div>
            <div className={styles.previewCanvas}>
              {/* 3D Preview would go here */}
              <div className={styles.previewPlaceholder}>
                <span>2D 전환 🔄</span>
              </div>
            </div>
          </div>

          <div className={styles.propertiesSection}>
            <div className={styles.propertiesHeader}>
              <span>속성</span>
              <button className={styles.expandBtn}>↗</button>
            </div>
            <div className={styles.propertiesContent}>
              <div className={styles.noSelection}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="#ccc">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
                <span>객체 없음</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

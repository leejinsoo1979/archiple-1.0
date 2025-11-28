import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import styles from './FloorplanSearchModal.module.css';

// Fix Leaflet marker icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

function MapUpdater({ center }: { center: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, 17);
    }
  }, [center, map]);
  return null;
}

interface FloorplanSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FloorplanSearchModal: React.FC<FloorplanSearchModalProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [markerPos, setMarkerPos] = useState<[number, number] | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&countrycodes=kr&limit=1`,
      { headers: { 'Accept-Language': 'ko' } }
    );
    const data = await response.json();
    if (data?.[0]) {
      setMarkerPos([parseFloat(data[0].lat), parseFloat(data[0].lon)]);
    }
  };

  const handleDrawFloorplan = () => {
    onClose();
    navigate('/editor');
  };

  const handleTraceFloorplan = () => {
    onClose();
    navigate('/editor?mode=trace');
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className={styles.backdrop} onClick={onClose} />

      {/* Modal */}
      <div className={styles.modal}>
        {/* Close Button */}
        <button className={styles.closeBtn} onClick={onClose}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        <div className={styles.content}>
          {/* Left Panel */}
          <div className={styles.leftPanel}>
            <div className={styles.header}>
              <h2 className={styles.title}>도면 검색</h2>
              <p className={styles.subtitle}>주소를 입력하여 도면을 검색해 보세요</p>
            </div>

            {/* Search Input */}
            <form className={styles.searchForm} onSubmit={handleSearch}>
              <input
                type="text"
                className={styles.searchInput}
                placeholder="지역, 주소 또는 지하철역을 입력해주세요."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button type="submit" className={styles.searchBtn}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
              </button>
            </form>

            {/* Notice */}
            <div className={styles.notice}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <p>
                <strong>3D 도면</strong>은 실측 도면을 바탕으로 구축되었으나 일부분 오차가 있을 수 있습니다.
              </p>
            </div>

            {/* Divider */}
            <div className={styles.divider}>
              <span className={styles.dividerText}>찾으시는 우리집 도면이 없다면?</span>
            </div>

            {/* Illustration */}
            <div className={styles.illustration}>
              <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
                <circle cx="60" cy="60" r="50" fill="#f0f0f0" />
                <circle cx="55" cy="55" r="20" stroke="#999" strokeWidth="3" fill="none" />
                <line x1="70" y1="70" x2="85" y2="85" stroke="#999" strokeWidth="3" strokeLinecap="round" />
                <rect x="40" y="45" width="30" height="20" fill="#ddd" rx="2" />
                <line x1="45" y1="50" x2="65" y2="50" stroke="#bbb" strokeWidth="2" />
                <line x1="45" y1="55" x2="60" y2="55" stroke="#bbb" strokeWidth="2" />
                <line x1="45" y1="60" x2="55" y2="60" stroke="#bbb" strokeWidth="2" />
              </svg>
            </div>

            <p className={styles.helpText}>
              찾으시는 도면이 없으시다면, 아래의 방법에 따라 원하시는 도면을 얻으실 수 있습니다.
            </p>

            {/* Options */}
            <div className={styles.options}>
              <div className={styles.option} onClick={handleDrawFloorplan}>
                <div className={styles.optionIcon}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 19l7-7 3 3-7 7-3-3z" />
                    <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
                    <path d="M2 2l7.586 7.586" />
                    <circle cx="11" cy="11" r="2" />
                  </svg>
                </div>
                <div className={styles.optionContent}>
                  <h3 className={styles.optionTitle}>도면 직접 그리기</h3>
                  <p className={styles.optionDescription}>
                    도면 에디터에서 직접 도면을 생성하여 시작하는 방법이 있습니다.
                  </p>
                </div>
              </div>

              <div className={styles.option} onClick={handleTraceFloorplan}>
                <div className={styles.optionIcon}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M3 9h18" />
                    <path d="M9 21V9" />
                  </svg>
                </div>
                <div className={styles.optionContent}>
                  <h3 className={styles.optionTitle}>도면 따라 그리기</h3>
                  <p className={styles.optionDescription}>
                    우리집 도면 이미지를 에디터에 업로드하여, 손쉽게 따라 그리는 방법이 있습니다.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel - Map */}
          <div className={styles.rightPanel}>
            <MapContainer
              center={[37.5665, 126.9780]}
              zoom={14}
              scrollWheelZoom={true}
              className={styles.mapFrame}
            >
              <MapUpdater center={markerPos} />
              <TileLayer
                attribution='&copy; 국토교통부 Vworld'
                url="https://api.vworld.kr/req/wmts/1.0.0/CEB52025-E065-364C-9DBA-44880E3B02B8/Base/{z}/{y}/{x}.png"
                maxZoom={19}
              />
              {markerPos && <Marker position={markerPos} />}
            </MapContainer>
          </div>
        </div>
      </div>
    </>
  );
};
